type DashboardPageProps = {
  user: {
    name: string;
    email: string;
    role: string;
    setupCompleted: boolean;
    paydayOfMonth: number;
  };
  onLogout: () => Promise<void>;
};

export function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const handleLogout = async () => {
    await onLogout();
  };

  return (
    <main className="screen-shell">
      <section className="panel panel-wide">
        <span className="eyebrow">Phase 1</span>
        <h1>{user.name}さん、ログイン中です</h1>
        <p className="lead">セットアップと認証基盤が動作しています。</p>

        <div className="status-grid">
          <article className="status-card">
            <h2>メール</h2>
            <p>{user.email}</p>
          </article>
          <article className="status-card">
            <h2>ロール</h2>
            <p>{user.role}</p>
          </article>
          <article className="status-card">
            <h2>給料日</h2>
            <p>{user.paydayOfMonth}日</p>
          </article>
          <article className="status-card">
            <h2>初期設定</h2>
            <p>{user.setupCompleted ? "完了" : "未完了"}</p>
          </article>
        </div>

        <div className="button-row">
          <button className="button button-secondary" onClick={handleLogout} type="button">
            ログアウト
          </button>
        </div>
      </section>
    </main>
  );
}
