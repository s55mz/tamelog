export function ProfileInstallGuide({
  compact = false,
  className = ""
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`profile-guide ${compact ? "profile-guide--compact" : ""} ${className}`.trim()}>
      <div className="profile-guide__phone" aria-hidden="true">
        <div className="profile-guide__status" />
        <div className="profile-guide__frame">
          <div className="profile-guide__screen profile-guide__screen--one">
            <span className="profile-guide__chip">1</span>
            <strong>ダウンロード</strong>
            <p>プロファイルを保存</p>
          </div>
          <div className="profile-guide__screen profile-guide__screen--two">
            <span className="profile-guide__chip">2</span>
            <strong>設定を開く</strong>
            <p>構成プロファイルを許可</p>
          </div>
          <div className="profile-guide__screen profile-guide__screen--three">
            <span className="profile-guide__chip">3</span>
            <strong>VPN を有効化</strong>
            <p>接続して利用開始</p>
          </div>
        </div>
      </div>

      <div className="profile-guide__steps">
        <div className="profile-guide__step">
          <span>1</span>
          <div>
            <strong>プロファイルをダウンロード</strong>
            <p>`.mobileconfig` を保存します</p>
          </div>
        </div>
        <div className="profile-guide__step">
          <span>2</span>
          <div>
            <strong>設定アプリでインストール</strong>
            <p>表示に従って許可します</p>
          </div>
        </div>
        <div className="profile-guide__step">
          <span>3</span>
          <div>
            <strong>VPN をオンにする</strong>
            <p>接続後にフィルタリングが有効になります</p>
          </div>
        </div>
      </div>
    </div>
  );
}
