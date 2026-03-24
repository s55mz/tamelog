import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "587");
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER;

function getTransporter() {
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
  return nodemailer.createTransport({
    host: "127.0.0.1",
    port: 25,
    secure: false,
    ignoreTLS: true
  });
}

const FROM_ADDRESS = SMTP_FROM || `no-reply@${process.env.MAIL_DOMAIN ?? "finance-pro.space"}`;
const APP_URL = process.env.APP_URL ?? "https://finance-pro.space";

const FOOTER = `
--
TameLog（貯めログ）- 家計管理サービス
${APP_URL}

このメールはシステムから自動送信されています。
心当たりのない場合は、このメールを無視していただいて構いません。
`;

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  // SMTP未設定かつpostfixなし（ローカル開発環境）はコンソール出力のみ
  const isDev = process.env.NODE_ENV !== "production";
  const hasSmtp = SMTP_HOST && SMTP_USER && SMTP_PASS;
  if (isDev && !hasSmtp) {
    console.log(`[MAIL DEV] to=${opts.to} subject="${opts.subject}"\n${opts.text}`);
    return;
  }
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"TameLog" <${FROM_ADDRESS}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    headers: { "X-TameLog-Generated": "1" }
  });
  console.log(`[MAIL] 送信完了: ${opts.to} "${opts.subject}"`);
}

// ── テンプレート ───────────────────────────────────────────────

export function mailVerificationCode(code: string): { subject: string; text: string } {
  return {
    subject: "TameLog メールアドレス確認コード",
    text: `TameLog（貯めログ）をご利用いただきありがとうございます。

アカウント登録のご確認

以下の確認コードを入力して、メールアドレスの認証を完了してください。

  確認コード: ${code}

このコードの有効期限は 10分間 です。
コードの入力が完了するまで、このメールは大切に保管してください。

心当たりのない場合は、このメールを無視していただいて構いません。
${FOOTER}`
  };
}

export function mailInvitation(inviteUrl: string, invitedByName: string): { subject: string; text: string } {
  return {
    subject: "TameLog への招待が届いています",
    text: `TameLog（貯めログ）への招待のお知らせ

${invitedByName} さんから、家計管理サービス TameLog への招待が届いています。

以下のURLからアカウントを作成できます。
招待リンクの有効期限は 7日間 です。

${inviteUrl}

TameLog は、日々の収支記録・貯金目標管理・家計分析をシンプルにまとめた家計管理サービスです。
${FOOTER}`
  };
}

export function mailWeeklySummary(opts: {
  userName: string;
  incomeTotal: number;
  expenseTotal: number;
  savingTotal: number;
  balance: number;
  goalCount: number;
  topGoalName: string | null;
  topGoalRate: number | null;
  weeklyReminderEnabled: boolean;
  goalNotificationEnabled: boolean;
  deficitAlertEnabled: boolean;
}): { subject: string; text: string } | null {
  const lines: string[] = [];

  if (opts.weeklyReminderEnabled) {
    lines.push(`今週の収支サマリー
  収入:  ¥${opts.incomeTotal.toLocaleString()}
  支出:  ¥${opts.expenseTotal.toLocaleString()}
  貯金:  ¥${opts.savingTotal.toLocaleString()}
  収支:  ¥${opts.balance.toLocaleString()}`);
  }

  if (opts.deficitAlertEnabled && opts.balance < 0) {
    lines.push(`[注意] 今期の収支が ¥${Math.abs(opts.balance).toLocaleString()} の赤字となっています。支出の見直しをご検討ください。`);
  }

  if (opts.goalNotificationEnabled && opts.topGoalName) {
    lines.push(`目標「${opts.topGoalName}」の達成率: ${opts.topGoalRate ?? 0}%`);
  }

  if (lines.length === 0) return null;

  return {
    subject: "TameLog 週次レポート",
    text: `${opts.userName} さんの週次レポート

${lines.join("\n\n")}

詳細は TameLog アプリからご確認いただけます。
${APP_URL}
${FOOTER}`
  };
}

export function mailAppNotification(userName: string, title: string, body: string | null, url: string | null): { subject: string; text: string } {
  const linkLine = url ? `\n詳細: ${APP_URL}${url}` : "";
  return {
    subject: `TameLog ${title}`,
    text: `${userName} さん

${title}

${body ?? ""}${linkLine}
${FOOTER}`
  };
}

export function mailTestSend(userName: string): { subject: string; text: string } {
  return {
    subject: "TameLog メール送信テスト",
    text: `${userName} さん

TameLog（貯めログ）からのメール送信テストです。
このメールが届いていれば、通知メールは正常に機能しています。
${FOOTER}`
  };
}
