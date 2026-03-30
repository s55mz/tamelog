import { ShieldOff, Settings, ArrowLeft, PiggyBank } from "lucide-react";
import { APP_HOME_URL, APP_SETTINGS_URL, getBlockedPageContext } from "../lib/blockPage";

const COMMENTS = [
  "衝動買いを一度止めることで、貯金目標に近づけます。",
  "今日の我慢が、明日の夢を叶えます。",
  "ショッピングサイトより、貯めログを開いてみませんか？",
  "少しだけ立ち止まって、本当に必要か考えてみましょう。",
  "目標金額まであと少し。今日も一緒に頑張りましょう！",
];

function getDailyComment(host: string): string {
  const seed = host.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const today = new Date();
  const dayIndex = today.getDate() + today.getMonth() * 31 + seed;
  return COMMENTS[dayIndex % COMMENTS.length];
}

export function BlockedPage() {
  const blocked = getBlockedPageContext();
  const comment = getDailyComment(blocked.host);

  return (
    <div className="blocked-page">
      <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>

        {/* Icon */}
        <div className="blocked-icon">
          <ShieldOff size={36} strokeWidth={1.5} style={{ color: "var(--coral)" }} />
        </div>

        {/* Text */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "var(--coral-soft)",
              color: "var(--coral)",
              fontSize: 11,
              fontWeight: 700,
              padding: "4px 12px",
              borderRadius: 999,
              letterSpacing: "0.05em",
              marginBottom: 10,
              border: "1px solid rgba(255,100,117,0.20)",
            }}
          >
            TameLog Filter
          </div>
          <h1 className="blocked-title">このサイトはブロック中です</h1>
          <p className="blocked-body" style={{ marginTop: 8 }}>
            貯めログの VPN フィルタリング設定により<br />アクセスを制限しています。
          </p>
        </div>

        {/* Info card */}
        <div
          style={{
            width: "100%",
            background: "var(--bg-1)",
            borderRadius: "var(--r4)",
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>ブロック対象</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {blocked.host}
            </div>
          </div>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "var(--brand-soft)",
                color: "var(--brand)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <PiggyBank size={16} strokeWidth={2} />
            </div>
            <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{comment}</p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
          <a
            href={APP_SETTINGS_URL}
            className="btn btn--fill btn--block btn--lg"
            style={{ textDecoration: "none" }}
          >
            <Settings size={16} strokeWidth={2} />
            設定を確認する
          </a>
          <button
            onClick={() => window.history.back()}
            className="btn btn--ghost btn--block btn--lg"
            type="button"
          >
            <ArrowLeft size={16} strokeWidth={2} />
            前のページに戻る
          </button>
          <a
            href={APP_HOME_URL}
            style={{ textAlign: "center", fontSize: 13, color: "var(--text-3)", padding: "8px 0", display: "block" }}
          >
            貯めログを開く
          </a>
        </div>

      </div>
    </div>
  );
}
