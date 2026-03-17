import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from "fs";
import { randomUUID, randomBytes } from "crypto";

import { Hono } from "hono";
import plist from "plist";

import { requireAuth, type AuthContext } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { jsonError } from "../lib/errors";

const VPN_SERVER_HOST = process.env.VPN_SERVER_HOST ?? "160.251.203.86";
const VPN_SUBNET = "10.10.10";
const MITMPROXY_CA_CANDIDATES = [
  process.env.VPN_FILTER_CA_PATH,
  "/etc/mitmproxy/mitmproxy-ca-cert.pem",
  "/var/www/tamelog/certs/mitmproxy-ca-cert.pem"
].filter((value): value is string => Boolean(value));
const IKEV2_CA_PATH = "/etc/ipsec.d/cacerts/ikev2-ca.cert.pem";
const IKEV2_CA_KEY_PATH = process.env.VPN_CA_KEY_PATH ?? "/etc/ipsec.d/private/ikev2-ca.pem";
const EAP_SECRETS_PATH = "/etc/ipsec.d/eap-users.secrets";
const VPN_PROFILE_SIGNING_ENABLED = process.env.VPN_PROFILE_SIGNING_ENABLED === "1";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tamelog-internal-2026";
const WEBAPP_URL = process.env.WEBAPP_URL ?? "https://finance-pro.space/";
const WEBCLIP_ICON_PATH = process.env.VPN_WEBCLIP_ICON_PATH ?? "/var/www/tamelog/img/icons/icon-192.png";

export const vpnRoutes = new Hono<AuthContext>();

// 公開エンドポイント（認証不要 — トークンで保護）
vpnRoutes.get("/profiles/:token", profileDownload);
vpnRoutes.get("/certs/ca", caCertDownload);

// mitmproxy用 内部ブロックリストAPI（共有シークレットで保護）
vpnRoutes.get("/internal/active-blocks", async (c) => {
  const secret = c.req.header("x-internal-secret");
  if (secret !== INTERNAL_SECRET) return jsonError(c, "Forbidden", 403);

  const vpnIp = c.req.query("vpn_ip");
  if (!vpnIp) return c.json({ blocked: [] });

  // VPN IPからユーザーを特定（完全一致 → /24サブネット内の任意クライアントにフォールバック）
  let client = await prisma.vpnClient.findFirst({ where: { vpnIp } });
  if (!client) {
    const prefix = vpnIp.split(".").slice(0, 3).join(".") + ".";
    client = await prisma.vpnClient.findFirst({
      where: { vpnIp: { startsWith: prefix } }
    });
  }
  if (!client) return c.json({ blocked: [] });

  // 現在のJST曜日・時刻を取得
  const now = new Date();
  const jstOffset = 9 * 60;
  const jstMs = now.getTime() + jstOffset * 60 * 1000;
  const jst = new Date(jstMs);
  const dayOfWeek = jst.getUTCDay(); // 0=日, 1=月, ..., 6=土
  const currentTime = `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;

  // 現在時刻にアクティブなスケジュールを取得
  const schedules = await prisma.userBlockSchedule.findMany({
    where: { userId: client.userId, enabled: true, dayOfWeek },
    include: { category: { include: { domains: { where: { enabled: true } } } } }
  });

  const blocked = new Set<string>();
  for (const schedule of schedules) {
    if (schedule.startTime <= currentTime && currentTime < schedule.endTime) {
      for (const d of schedule.category.domains) {
        blocked.add(d.domain);
      }
    }
  }

  return c.json({ blocked: Array.from(blocked), userId: client.userId });
});

// 認証必須エンドポイント
vpnRoutes.use("/devices/*", requireAuth);
vpnRoutes.use("/devices", requireAuth);

// 次の利用可能なIPを取得
async function getNextVpnIp(): Promise<string> {
  const used = await prisma.vpnClient.findMany({ select: { vpnIp: true } });
  const usedNums = new Set(used.map((c) => parseInt(c.vpnIp.split(".")[3])));
  for (let i = 10; i <= 254; i++) {
    if (!usedNums.has(i)) return `${VPN_SUBNET}.${i}`;
  }
  throw new Error("利用可能なIPがありません");
}

// EAPユーザー追加
function addEapUser(username: string, password: string): void {
  try {
    appendFileSync(EAP_SECRETS_PATH, `${username} : EAP "${password}"\n`, { encoding: "utf8" });
    execSync("sudo ipsec rereadsecrets 2>&1", { encoding: "utf8" });
    console.log(`[VPN] EAP user added: ${username}`);
  } catch (err) {
    console.error(`[VPN] Failed to add EAP user ${username}:`, err);
  }
}

// EAPユーザー削除
function removeEapUser(username: string): void {
  try {
    const current = readFileSync(EAP_SECRETS_PATH, "utf8");
    const updated = current.split("\n").filter(line => !line.startsWith(`${username} `)).join("\n");
    writeFileSync(EAP_SECRETS_PATH, updated, { encoding: "utf8" });
    execSync("sudo ipsec rereadsecrets 2>&1", { encoding: "utf8" });
    console.log(`[VPN] EAP user removed: ${username}`);
  } catch (err) {
    console.error(`[VPN] Failed to remove EAP user ${username}:`, err);
  }
}

// iOS/macOS/Windows用 mobileconfig生成
function buildMobileconfig(eapUsername: string, eapPassword: string): string {
  const content: Record<string, unknown>[] = [];

  // IKEv2 VPN CA証明書
  try {
    const pem = readFileSync(IKEV2_CA_PATH, "utf8");
    const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
    content.push({
      PayloadType: "com.apple.security.root",
      PayloadIdentifier: "com.tamelog.vpnca",
      PayloadUUID: randomUUID(),
      PayloadDisplayName: "TameLog VPN CA",
      PayloadVersion: 1,
      PayloadContent: Buffer.from(b64, "base64")
    });
    console.log("[VPN] CA cert included in profile");
  } catch (err) {
    console.error("[VPN] CA cert not found at", IKEV2_CA_PATH, ":", err);
  }

  // mitmproxy CA証明書（HTTPS フィルタリング用）
  const filteringCaPath = MITMPROXY_CA_CANDIDATES.find((path) => existsSync(path));
  try {
    if (!filteringCaPath) {
      throw new Error("filtering CA not found");
    }
    const pem = readFileSync(filteringCaPath, "utf8");
    const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
    content.push({
      PayloadType: "com.apple.security.root",
      PayloadIdentifier: "com.tamelog.filteringca",
      PayloadUUID: randomUUID(),
      PayloadDisplayName: "TameLog Filtering CA",
      PayloadVersion: 1,
      PayloadContent: Buffer.from(b64, "base64")
    });
    console.log("[VPN] Filtering CA cert included in profile from", filteringCaPath);
  } catch (err) {
    console.error("[VPN] Filtering CA cert not found in candidates:", MITMPROXY_CA_CANDIDATES, err);
  }

  // IKEv2 VPN設定ペイロード
  content.push({
    PayloadType: "com.apple.vpn.managed",
    PayloadIdentifier: "com.tamelog.vpn",
    PayloadUUID: randomUUID(),
    PayloadDisplayName: "TameLog VPN",
    PayloadVersion: 1,
    UserDefinedName: "TameLog",
    VPNType: "IKEv2",
    IKEv2: {
      RemoteAddress: VPN_SERVER_HOST,
      RemoteIdentifier: VPN_SERVER_HOST,
      LocalIdentifier: eapUsername,
      AuthenticationMethod: "None",
      ExtendedAuthEnabled: 1,
      AuthName: eapUsername,
      AuthPassword: eapPassword,
      ServerCertificateIssuerCommonName: "TameLog VPN CA",
      ServerCertificateCommonName: VPN_SERVER_HOST,
      DeadPeerDetectionRate: "Medium",
      DisableMOBIKE: 0,
      DisableRedirect: 0,
      EnableCertificateRevocationCheck: 0,
      EnablePFS: 1,
      UseConfigurationAttributeInternalIPSubnet: 0,
      // iOS優先: ECP-384 (group 20) → iOS 9+ でサポート、AES-256-GCM
      IKESecurityAssociationParameters: {
        EncryptionAlgorithm: "AES-256-GCM",
        IntegrityAlgorithm: "SHA2-384",
        DiffieHellmanGroup: 20,
        LifeTimeInMinutes: 1440
      },
      ChildSecurityAssociationParameters: {
        EncryptionAlgorithm: "AES-256-GCM",
        IntegrityAlgorithm: "SHA2-384",
        DiffieHellmanGroup: 20,
        LifeTimeInMinutes: 480
      }
    }
  });

  try {
    const icon = readFileSync(WEBCLIP_ICON_PATH);
    content.push({
      PayloadType: "com.apple.webClip.managed",
      PayloadIdentifier: "com.tamelog.webclip",
      PayloadUUID: randomUUID(),
      PayloadDisplayName: "TameLog App",
      PayloadVersion: 1,
      Label: "貯めログ",
      URL: WEBAPP_URL,
      FullScreen: true,
      IsRemovable: true,
      Precomposed: true,
      IgnoreManifestScope: false,
      Icon: icon
    });
    console.log("[VPN] WebClip included in profile");
  } catch (err) {
    console.error("[VPN] WebClip icon not found at", WEBCLIP_ICON_PATH, ":", err);
  }

  const profile: Record<string, unknown> = {
    PayloadType: "Configuration",
    PayloadIdentifier: `com.tamelog.profile.${randomUUID()}`,
    PayloadUUID: randomUUID(),
    PayloadDisplayName: "TameLog",
    PayloadDescription: "TameLog VPN・フィルタリング・Webアプリ設定",
    PayloadOrganization: "TameLog",
    PayloadVersion: 1,
    PayloadContent: content
  };

  return plist.build(profile as any);
}

// OpenSSL CMS でプロファイルに署名（失敗時はnullを返す）
function signMobileconfig(xml: string): Buffer | null {
  if (!VPN_PROFILE_SIGNING_ENABLED) {
    console.log("[VPN] Profile signing skipped by configuration");
    return null;
  }
  if (!existsSync(IKEV2_CA_PATH) || !existsSync(IKEV2_CA_KEY_PATH)) {
    console.log("[VPN] Signing skipped: cert or key not found");
    return null;
  }
  const tmpIn = `/tmp/tamelog_profile_${Date.now()}.plist`;
  const tmpOut = `/tmp/tamelog_signed_${Date.now()}.p7`;
  try {
    writeFileSync(tmpIn, xml, "utf8");
    execSync(
      `openssl smime -sign -md sha256 -nodetach` +
      ` -signer "${IKEV2_CA_PATH}" -inkey "${IKEV2_CA_KEY_PATH}"` +
      ` -in "${tmpIn}" -out "${tmpOut}" -outform DER`,
      { encoding: "buffer", stdio: ["pipe", "pipe", "pipe"] }
    );
    const signed = readFileSync(tmpOut);
    console.log("[VPN] Profile signed successfully");
    return signed;
  } catch (err) {
    console.error("[VPN] Profile signing failed:", err);
    return null;
  } finally {
    try { unlinkSync(tmpIn); } catch {}
    try { unlinkSync(tmpOut); } catch {}
  }
}

// デバイス作成
vpnRoutes.post("/devices", async (c) => {
  const authUser = c.get("authUser");
  const body = await c.req.json().catch(() => ({}));
  const platform = (body.platform ?? "other") as string;
  const deviceName = (body.deviceName ?? "デバイス") as string;

  const vpnIp = await getNextVpnIp();
  const eapUsername = `tl_${randomBytes(6).toString("hex")}`;
  const eapPassword = randomBytes(12).toString("hex");
  const profileToken = randomUUID().replace(/-/g, "");
  const profileTokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const device = await prisma.vpnClient.create({
    data: {
      userId: authUser.id,
      vpnIp,
      publicKey: eapUsername,
      privateKey: eapPassword,
      deviceName,
      platform,
      status: "ACTIVE",
      profileToken,
      profileTokenExpiresAt,
    }
  });

  addEapUser(eapUsername, eapPassword);

  const mobileconfigUrl = `/api/vpn/profiles/${profileToken}.mobileconfig`;

  return c.json({
    data: {
      id: device.id,
      vpnIp,
      mobileconfigUrl,
      platform,
    }
  });
});

// デバイス一覧
vpnRoutes.get("/devices", async (c) => {
  const authUser = c.get("authUser");
  const devices = await prisma.vpnClient.findMany({
    where: { userId: authUser.id },
    select: { id: true, vpnIp: true, deviceName: true, platform: true, status: true, createdAt: true }
  });
  return c.json({ data: { devices } });
});

// デバイス削除
vpnRoutes.delete("/devices/:id", async (c) => {
  const authUser = c.get("authUser");
  const id = c.req.param("id");
  const device = await prisma.vpnClient.findFirst({ where: { id, userId: authUser.id } });
  if (!device) return jsonError(c, "デバイスが見つかりません", 404);

  if (device.publicKey) removeEapUser(device.publicKey);
  await prisma.vpnClient.delete({ where: { id } });
  return c.json({ data: { success: true } });
});

// mobileconfig ダウンロード（トークン認証、ログイン不要）
async function profileDownload(c: any) {
  const token = c.req.param("token").replace(".mobileconfig", "");
  const device = await prisma.vpnClient.findFirst({
    where: { profileToken: token }
  });
  if (!device) return jsonError(c, "プロファイルが見つかりません", 404);
  if (!device.publicKey || !device.privateKey) return jsonError(c, "デバイス情報が不完全です", 500);

  const xml = buildMobileconfig(device.publicKey, device.privateKey);
  const signed = signMobileconfig(xml);

  c.header("Content-Type", "application/x-apple-aspen-config");
  c.header("Content-Disposition", `attachment; filename="tamelog.mobileconfig"`);

  if (signed) {
    return c.body(signed);
  }
  return c.body(xml);
}

// CA証明書ダウンロード（認証不要）
function caCertDownload(c: any) {
  const type = c.req.query("type") ?? "mitmproxy";
  const certPath = type === "vpn"
    ? IKEV2_CA_PATH
    : MITMPROXY_CA_CANDIDATES.find((path) => existsSync(path));
  try {
    if (!certPath) {
      throw new Error("filtering CA not found");
    }
    const cert = readFileSync(certPath);
    c.header("Content-Type", "application/x-pem-file");
    c.header("Content-Disposition", `attachment; filename="tamelog-ca.pem"`);
    return c.body(cert);
  } catch {
    return jsonError(c, "証明書ファイルが見つかりません", 404);
  }
}

// ブロック通知API（内部用 — DNSサーバーから呼ばれる）
vpnRoutes.post("/internal/block-notify", async (c) => {
  const secret = c.req.header("x-internal-secret");
  if (secret !== INTERNAL_SECRET) return jsonError(c, "Forbidden", 403);

  const body = await c.req.json().catch(() => ({}));
  const { vpn_ip, domain, category_code } = body as { vpn_ip?: string; domain?: string; category_code?: string };
  if (!vpn_ip || !domain) return c.json({ ok: false });

  // VPN IPからユーザー特定
  let client = await prisma.vpnClient.findFirst({ where: { vpnIp: vpn_ip } });
  if (!client) {
    const prefix = vpn_ip.split(".").slice(0, 3).join(".") + ".";
    client = await prisma.vpnClient.findFirst({ where: { vpnIp: { startsWith: prefix } } });
  }
  if (!client) return c.json({ ok: false });

  const userId = client.userId;

  // 今月の収支を集計
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.dailyRecord.aggregate({
      where: { userId, type: "INCOME", recordDate: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true }
    }),
    prisma.dailyRecord.aggregate({
      where: { userId, type: "EXPENSE", recordDate: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true }
    })
  ]);

  const income = incomeAgg._sum.amount ?? 0;
  const expense = expenseAgg._sum.amount ?? 0;
  const balance = income - expense;

  // 目標の達成率を取得
  const goals = await prisma.goal.findMany({
    where: { userId },
    include: { goalRecords: { select: { amount: true } } },
    take: 1,
    orderBy: { createdAt: "asc" }
  });

  const mainGoal = goals[0];
  const savedTotal = mainGoal ? mainGoal.goalRecords.reduce((s: number, r: { amount: number }) => s + r.amount, 0) : 0;
  const goalPct = mainGoal ? Math.min(100, Math.round((savedTotal / mainGoal.targetAmount) * 100)) : null;
  const remaining = mainGoal ? mainGoal.targetAmount - savedTotal : null;

  // 家計状況に応じてメッセージ選択
  const isEC = !category_code || category_code === "EC";
  const isBudgetNegative = balance < 0;
  const isBudgetTight = income > 0 && balance < income * 0.1;

  let title: string;
  let body2: string;

  if (isBudgetNegative) {
    title = "今月の家計はピンチです";
    body2 = `今月は${Math.abs(balance).toLocaleString()}円のマイナスです。このサイトへのアクセスは控えてみませんか？`;
  } else if (isBudgetTight && isEC) {
    title = "衝動買いに注意！";
    body2 = `今月の残り予算は収入の${Math.round((balance / income) * 100)}%です。本当に必要なものですか？`;
  } else if (goalPct !== null && remaining !== null && isEC) {
    if (goalPct >= 80) {
      title = "目標まであと少し！";
      body2 = `「${mainGoal!.title}」達成まであと${remaining.toLocaleString()}円！衝動買いは控えましょう。`;
    } else {
      title = `貯金達成まで残り${100 - goalPct}%です`;
      body2 = `「${mainGoal!.title}」達成まで${remaining.toLocaleString()}円。衝動買いは控えましょう 💪`;
    }
  } else if (!isEC) {
    title = "決済アプリへのアクセス";
    body2 = expense > 0
      ? `今月はすでに${expense.toLocaleString()}円使っています。本当に必要な支払いですか？`
      : "フィルタリング設定により制限されています。";
  } else {
    title = "アクセスがブロックされました";
    body2 = `${domain} はフィルタリング設定により制限されています。`;
  }

  // WebPush送信
  const webpush = (await import("web-push")).default;
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@finance-pro.space";
  if (!vapidPublicKey || !vapidPrivateKey) return c.json({ ok: false, reason: "VAPID not configured" });
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body: body2, url: "/" })
      ).catch(async (err: any) => {
        if (err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
        }
      })
    )
  );

  return c.json({ ok: true, sent: subs.length });
});

// VPN診断（管理者のみ）
vpnRoutes.get("/diagnostics", requireAuth, (c) => {
  const user = c.get("authUser");
  if (user.role !== "ADMIN") return jsonError(c, "権限がありません", 403);

  const checks: Record<string, string> = {};

  // CA証明書チェック
  checks.caCert = existsSync(IKEV2_CA_PATH) ? "OK" : `NOT_FOUND: ${IKEV2_CA_PATH}`;
  checks.caKey = existsSync(IKEV2_CA_KEY_PATH) ? "OK" : `NOT_FOUND: ${IKEV2_CA_KEY_PATH}`;
  const filteringCaPath = MITMPROXY_CA_CANDIDATES.find((path) => existsSync(path));
  checks.mitmCert = filteringCaPath ? `OK: ${filteringCaPath}` : `NOT_FOUND: ${MITMPROXY_CA_CANDIDATES.join(", ")}`;
  checks.eapSecrets = existsSync(EAP_SECRETS_PATH) ? "OK" : `NOT_FOUND: ${EAP_SECRETS_PATH}`;
  checks.vpnHost = VPN_SERVER_HOST;

  // strongSwan ステータス
  try {
    const status = execSync("sudo ipsec statusall 2>&1 | head -20", { encoding: "utf8", timeout: 5000 });
    checks.ipsecStatus = status.trim().slice(0, 500);
  } catch (err) {
    checks.ipsecStatus = `ERROR: ${String(err)}`;
  }

  // OpenSSL バージョン
  try {
    const ver = execSync("openssl version 2>&1", { encoding: "utf8" });
    checks.openssl = ver.trim();
  } catch {
    checks.openssl = "NOT_FOUND";
  }

  return c.json({ data: checks });
});
