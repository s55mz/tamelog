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
            <strong>設定を開く</strong>
            <p>一般から VPN とデバイス管理へ進みます</p>
          </div>
          <div className="profile-guide__screen profile-guide__screen--two">
            <span className="profile-guide__chip">2</span>
            <strong>プロファイルを選ぶ</strong>
            <p>ダウンロード済みのプロファイルを開いてインストールします</p>
          </div>
          <div className="profile-guide__screen profile-guide__screen--three">
            <span className="profile-guide__chip">3</span>
            <strong>証明書を信頼</strong>
            <p>一般の情報から証明書信頼設定へ進みます</p>
          </div>
          <div className="profile-guide__screen profile-guide__screen--four">
            <span className="profile-guide__chip">4</span>
            <strong>全面的に信頼</strong>
            <p>ルート証明書をオンにして完了です</p>
          </div>
        </div>
      </div>

      <div className="profile-guide__steps">
        <div className="profile-guide__step">
          <span>1</span>
          <div>
            <strong>設定 → 一般 → VPN とデバイス管理</strong>
            <p>ダウンロード後に設定アプリを開いて進みます</p>
          </div>
        </div>
        <div className="profile-guide__step">
          <span>2</span>
          <div>
            <strong>ダウンロード済みのプロファイル → インストール</strong>
            <p>表示される案内に従って構成プロファイルを入れます</p>
          </div>
        </div>
        <div className="profile-guide__step">
          <span>3</span>
          <div>
            <strong>設定 → 一般 → 情報 → 証明書信頼設定</strong>
            <p>インストール後に証明書の信頼設定を開きます</p>
          </div>
        </div>
        <div className="profile-guide__step">
          <span>4</span>
          <div>
            <strong>ルート証明書を全面的に信頼</strong>
            <p>最後に信頼を有効化してフィルタリングを使える状態にします</p>
          </div>
        </div>
      </div>
    </div>
  );
}
