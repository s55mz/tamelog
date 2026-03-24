import { APP_HOME_URL, APP_SETTINGS_URL, getBlockedPageContext } from "../lib/blockPage";

function summarizePath(path: string) {
  if (path.length <= 84) {
    return path;
  }

  return `${path.slice(0, 56)}...${path.slice(-24)}`;
}

export function BlockedPage() {
  const blocked = getBlockedPageContext();

  return (
    <div className="wizard-wrap wizard-wrap--native blocked-page-wrap">
      <div className="setup-native blocked-page">
        <div className="setup-native__header blocked-page__header">
          <div className="setup-native__nav">
            <div className="blocked-page__brand">
              <span className="blocked-page__brand-mark material-symbols-outlined">shield_lock</span>
              <div className="blocked-page__brand-copy">
                <span className="setup-native__nav-title">TameLog Filter</span>
                <span className="setup-native__progress-label">アクセスを制限中</span>
              </div>
            </div>
            <span className="badge badge--out blocked-page__badge">BLOCKED</span>
          </div>
          <div className="setup-native__progress blocked-page__progress">
            <span />
          </div>
        </div>

        <div className="setup-native__body blocked-page__body">
          <div className="setup-native__copy-block">
            <p className="setup-native__eyebrow">Access blocked</p>
            <h1 className="setup-native__title">このサイトは現在ブロック中です</h1>
            <p className="setup-native__copy">
              貯めログの VPN フィルタリング設定により、このページへのアクセスを止めています。
              Setup 画面ではなく、今ブロックされていることだけを表示します。
            </p>
          </div>

          <div className="setup-native__summary blocked-page__summary">
            <div className="setup-native__summary-item">
              <strong>ブロック対象</strong>
              <span className="blocked-page__target">{blocked.host}</span>
            </div>
            <div className="setup-native__summary-item">
              <strong>アクセスしようとしたページ</strong>
              <span className="blocked-page__target">{summarizePath(blocked.path)}</span>
            </div>
            <div className="setup-native__summary-item">
              <strong>対処方法</strong>
              <span>貯めログの設定でブロック時間帯やカテゴリを見直してください。</span>
            </div>
          </div>

          <div className="blocked-page__note">
            <span className="material-symbols-outlined">info</span>
            <p>
              必要なら貯めログを開いて設定を確認できます。サイトの解除は VPN のブロック設定から行ってください。
            </p>
          </div>
        </div>

        <div className="setup-native__footer blocked-page__footer">
          <button className="btn btn--out btn--block" onClick={() => window.history.back()} type="button">
            前のページに戻る
          </button>
          <a className="btn btn--fill btn--block" href={APP_SETTINGS_URL}>
            設定を確認する
          </a>
          <a className="btn btn--ghost btn--block" href={APP_HOME_URL}>
            貯めログを開く
          </a>
        </div>
      </div>
    </div>
  );
}
