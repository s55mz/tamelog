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
const MITMPROXY_CA_PATH = "/var/www/tamelog/certs/mitmproxy-ca-cert.pem";
const IKEV2_CA_PATH = "/etc/ipsec.d/cacerts/ikev2-ca.cert.pem";
const IKEV2_CA_KEY_PATH = process.env.VPN_CA_KEY_PATH ?? "/etc/ipsec.d/private/ikev2-ca.pem";
const EAP_SECRETS_PATH = "/etc/ipsec.d/eap-users.secrets";
const VPN_PROFILE_SIGNING_ENABLED = process.env.VPN_PROFILE_SIGNING_ENABLED === "1";

export const vpnRoutes = new Hono<AuthContext>();

// 公開エンドポイント（認証不要 — トークンで保護）
vpnRoutes.get("/profiles/:token", profileDownload);
vpnRoutes.get("/certs/ca", caCertDownload);

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
  try {
    const pem = readFileSync(MITMPROXY_CA_PATH, "utf8");
    const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
    content.push({
      PayloadType: "com.apple.security.root",
      PayloadIdentifier: "com.tamelog.filteringca",
      PayloadUUID: randomUUID(),
      PayloadDisplayName: "TameLog Filtering CA",
      PayloadVersion: 1,
      PayloadContent: Buffer.from(b64, "base64")
    });
  } catch { /* mitmproxy CA証明書なし — オプション */ }

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
      EnablePFS: 0,
      UseConfigurationAttributeInternalIPSubnet: 0,
      IKESecurityAssociationParameters: {
        EncryptionAlgorithm: "AES-256",
        IntegrityAlgorithm: "SHA2-256",
        DiffieHellmanGroup: 14,
        LifeTimeInMinutes: 1440
      },
      ChildSecurityAssociationParameters: {
        EncryptionAlgorithm: "AES-256",
        IntegrityAlgorithm: "SHA2-256",
        DiffieHellmanGroup: 14,
        LifeTimeInMinutes: 1440
      }
    }
  });

  const profile: Record<string, unknown> = {
    PayloadType: "Configuration",
    PayloadIdentifier: `com.tamelog.profile.${randomUUID()}`,
    PayloadUUID: randomUUID(),
    PayloadDisplayName: "TameLog",
    PayloadDescription: "TameLog VPN & フィルタリング設定",
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
  const certPath = type === "vpn" ? IKEV2_CA_PATH : MITMPROXY_CA_PATH;
  try {
    const cert = readFileSync(certPath);
    c.header("Content-Type", "application/x-pem-file");
    c.header("Content-Disposition", `attachment; filename="tamelog-ca.pem"`);
    return c.body(cert);
  } catch {
    return jsonError(c, "証明書ファイルが見つかりません", 404);
  }
}

// VPN診断（管理者のみ）
vpnRoutes.get("/diagnostics", requireAuth, (c) => {
  const user = c.get("authUser");
  if (user.role !== "ADMIN") return jsonError(c, "権限がありません", 403);

  const checks: Record<string, string> = {};

  // CA証明書チェック
  checks.caCert = existsSync(IKEV2_CA_PATH) ? "OK" : `NOT_FOUND: ${IKEV2_CA_PATH}`;
  checks.caKey = existsSync(IKEV2_CA_KEY_PATH) ? "OK" : `NOT_FOUND: ${IKEV2_CA_KEY_PATH}`;
  checks.mitmCert = existsSync(MITMPROXY_CA_PATH) ? "OK" : `NOT_FOUND: ${MITMPROXY_CA_PATH}`;
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
