import { useEffect, useState } from "react";

import { DateField } from "../components/TemporalFields";
import { Feedback } from "../components/ui";
import { apiRequest } from "../lib/api";
import { isPushSubscribed, subscribePush } from "../lib/push";
import { getAuthToken } from "../lib/storage";

type UserSetupPageProps = {
  onCompleted: () => Promise<void>;
};

type GoalDraft = { title: string; targetAmount: string; deadline: string; visualOptionId: string };

type GoalVisualOption = {
  id: string;
  title: string;
  visualCategory: string;
  visualSubcategory: string;
  imagePath: string;
};

type VpnSetupData = {
  id: string;
  vpnIp: string;
  mobileconfigUrl: string;
  platform: string;
};

const stepLabels = ["はじめに", "給料日", "口座", "通知とプロファイル", "目標"];

function detectPlatform(): "ios" | "android" | "mac" | "windows" | "other" {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/macintosh|mac os x/.test(ua)) return "mac";
  if (/windows/.test(ua)) return "windows";
  return "other";
}

export function UserSetupPage({ onCompleted }: UserSetupPageProps) {
  const token = getAuthToken();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [paydayOfMonth, setPaydayOfMonth] = useState("25");
  const [accountEnabled, setAccountEnabled] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("BANK");
  const [accountBalance, setAccountBalance] = useState("0");
  const [goals, setGoals] = useState<GoalDraft[]>([]);
  const [visualOptions, setVisualOptions] = useState<GoalVisualOption[]>([]);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushReady, setPushReady] = useState(false);
  const [pushError, setPushError] = useState("");
  const [vpnLoading, setVpnLoading] = useState(false);
  const [vpnReady, setVpnReady] = useState(false);
  const [vpnError, setVpnError] = useState("");
  const [vpnSetupData, setVpnSetupData] = useState<VpnSetupData | null>(null);

  const platform = detectPlatform();

  useEffect(() => {
    if (!token) return;
    apiRequest<{ options: GoalVisualOption[] }>("/api/goals/visual-options", { token })
      .then((data) => setVisualOptions(data.options ?? []))
      .catch(() => setVisualOptions([]));
  }, [token]);

  useEffect(() => {
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setPushSupported(supported);
    if (!supported) return;
    void isPushSubscribed().then(setPushReady).catch(() => setPushReady(false));
  }, []);

  const addGoal = () => {
    if (goals.length >= 3) return;
    setGoals((c) => [...c, { title: "", targetAmount: "", deadline: "", visualOptionId: "" }]);
  };

  const updateGoal = (index: number, key: keyof GoalDraft, value: string) => {
    setGoals((c) => c.map((g, i) => (i === index ? { ...g, [key]: value } : g)));
  };

  const removeGoal = (index: number) => {
    setGoals((c) => c.filter((_, i) => i !== index));
  };

  const requestPushPermission = async () => {
    if (!token || !pushSupported) return;
    setPushLoading(true);
    setPushError("");
    try {
      const ok = await subscribePush(token);
      if (!ok) {
        setPushError("通知の許可が得られませんでした。ブラウザ設定を確認してください。");
        return;
      }
      setPushReady(true);
    } catch (nextError) {
      setPushError(nextError instanceof Error ? nextError.message : "通知の設定に失敗しました");
    } finally {
      setPushLoading(false);
    }
  };

  const createVpnProfile = async () => {
    if (!token) return;
    setVpnLoading(true);
    setVpnError("");
    try {
      const data = await apiRequest<VpnSetupData>("/api/vpn/devices", {
        method: "POST",
        token,
        body: { platform, deviceName: `${platform} 初期設定デバイス` }
      });
      setVpnSetupData(data);
      setVpnReady(true);
      if (platform === "ios" || platform === "mac") {
        window.location.href = data.mobileconfigUrl;
      }
    } catch (nextError) {
      setVpnError(nextError instanceof Error ? nextError.message : "プロファイルの作成に失敗しました");
    } finally {
      setVpnLoading(false);
    }
  };

  const completeSetup = async () => {
    if (!token) { setError("セッションが切れました。再度ログインしてください。"); return; }
    setLoading(true); setError("");
    try {
      await apiRequest<{ success: boolean }>("/api/users/me/complete-setup", {
        method: "POST", token,
        body: {
          paydayOfMonth: Number(paydayOfMonth),
          initialAccount: accountEnabled
            ? { name: accountName || "メインの口座", type: accountType, balance: Number(accountBalance) }
            : undefined,
          goals: goals
            .filter((g) => g.title.trim() && g.targetAmount)
            .map((g) => ({
              title: g.title, targetAmount: Number(g.targetAmount),
              ...(g.deadline ? { deadline: g.deadline } : {}),
              ...(g.visualOptionId ? { visualOptionId: g.visualOptionId } : {})
            }))
        }
      });
      await onCompleted();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "初期設定に失敗しました");
    } finally { setLoading(false); }
  };

  return (
    <div className="wizard-wrap">
      <div className="wizard-card">
        {/* Brand */}
        <div className="row">
          <div className="auth-logo__mark">
            <span className="material-symbols-outlined">savings</span>
          </div>
          <span className="auth-logo__name">貯めログ</span>
        </div>

        {/* Step indicator */}
        <div className="wizard-steps">
          {stepLabels.map((label, index) => (
            <div className={`wizard-step-dot ${step >= index + 1 ? "on" : ""}`} key={label} title={label} />
          ))}
          <span className="wizard-step-label">
            {step} / {stepLabels.length} — {stepLabels[step - 1]}
          </span>
        </div>

        {/* Step 1: Welcome */}
        {step === 1 ? (
          <div className="wizard-pane form-stack">
            <div>
              <h2 className="page-h1">ようこそ</h2>
              <p className="text-sm">1 分ほどで終わる初期設定です。給料日・口座・プロファイル・目標を設定します。後から変更もできます。</p>
            </div>
            <button className="btn btn--fill btn--block" onClick={() => setStep(2)} type="button">
              はじめる
            </button>
          </div>
        ) : null}

        {/* Step 2: Payday */}
        {step === 2 ? (
          <div className="wizard-pane form-stack">
            <div>
              <h2 className="section-h2">給料日を設定</h2>
              <p className="text-sm">毎月何日に給料が入りますか？この日を基準に期間を管理します。</p>
            </div>
            <label className="field">
              <span className="field__label">毎月何日？</span>
              <select value={paydayOfMonth} onChange={(e) => setPaydayOfMonth(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>{day}日</option>
                ))}
              </select>
            </label>
            <div className="btn-row">
              <button className="btn btn--out" onClick={() => setStep(1)} type="button">戻る</button>
              <button className="btn btn--fill" onClick={() => setStep(3)} type="button">次へ</button>
            </div>
          </div>
        ) : null}

        {/* Step 3: Account */}
        {step === 3 ? (
          <div className="wizard-pane form-stack">
            <h2 className="section-h2">最初の口座</h2>
            <label className="toggle-row">
              <input checked={accountEnabled} onChange={(e) => setAccountEnabled(e.target.checked)} type="checkbox" />
              最初の口座を登録する
            </label>
            {accountEnabled ? (
              <div className="form-grid">
                <label className="field">
                  <span className="field__label">口座名</span>
                  <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="三井住友銀行" />
                </label>
                <label className="field">
                  <span className="field__label">種別</span>
                  <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                    <option value="BANK">銀行口座</option>
                    <option value="CASH">現金</option>
                    <option value="CREDIT">クレジットカード</option>
                  </select>
                </label>
                <label className="field field--wide">
                  <span className="field__label">現在残高</span>
                  <input type="number" inputMode="numeric" min="0" value={accountBalance} onChange={(e) => setAccountBalance(e.target.value)} placeholder="0" />
                </label>
              </div>
            ) : null}
            <div className="btn-row">
              <button className="btn btn--out" onClick={() => setStep(2)} type="button">戻る</button>
              <button className="btn btn--fill" onClick={() => setStep(4)} type="button">次へ</button>
            </div>
          </div>
        ) : null}

        {/* Step 4: Profile (VPN guide) */}
        {step === 4 ? (
          <div className="wizard-pane form-stack">
            <div>
              <h2 className="section-h2">通知とフィルタリング設定</h2>
              <p className="text-sm">
                ここで通知許可とプロファイル作成まで完了できます。あとで設定画面からやり直すこともできます。
              </p>
            </div>

            <div className="wizard-action-stack">
              <section className="wizard-action-card">
                <div className="wizard-action-card__head">
                  <div>
                    <p className="eyebrow">通知</p>
                    <h3 className="wizard-action-card__title">リマインダーを有効にする</h3>
                  </div>
                  <span className={`badge ${pushReady ? "badge--in" : ""}`}>{pushReady ? "完了" : "未設定"}</span>
                </div>
                <p className="text-sm">給料日やレポート更新をすぐ受け取れるようにします。</p>
                {pushSupported ? (
                  <button className="btn btn--fill" disabled={pushLoading || pushReady} onClick={() => void requestPushPermission()} type="button">
                    {pushReady ? "通知を有効化済み" : pushLoading ? "通知を確認中..." : "通知を許可する"}
                  </button>
                ) : (
                  <p className="text-sm">この端末ではプッシュ通知に対応していません。</p>
                )}
                {pushError ? <Feedback kind="err">{pushError}</Feedback> : null}
              </section>

              <section className="wizard-action-card">
                <div className="wizard-action-card__head">
                  <div>
                    <p className="eyebrow">プロファイル</p>
                    <h3 className="wizard-action-card__title">VPN と証明書を入れる</h3>
                  </div>
                  <span className={`badge ${vpnReady ? "badge--in" : ""}`}>{vpnReady ? "作成済み" : "未作成"}</span>
                </div>
                <p className="text-sm">
                  プロファイルには VPN、フィルタリング証明書、貯めログのホーム画面アイコンが含まれます。
                </p>
                <button className="btn btn--fill" disabled={vpnLoading} onClick={() => void createVpnProfile()} type="button">
                  {vpnLoading ? "プロファイルを作成中..." : vpnSetupData ? "もう一度ダウンロードする" : "このデバイスにプロファイルを作成"}
                </button>
                {vpnSetupData ? (
                  <div className="wizard-inline-list">
                    <a className="btn btn--out" href={vpnSetupData.mobileconfigUrl}>
                      ダウンロードリンクを開く
                    </a>
                    <span className="text-xs">接続先: {vpnSetupData.vpnIp}</span>
                  </div>
                ) : null}
                {vpnError ? <Feedback kind="err">{vpnError}</Feedback> : null}
              </section>
            </div>

            <div className="wizard-action-card wizard-action-card--muted">
              <p className="eyebrow">案内</p>
              {platform === "ios" ? (
                <ol className="wizard-list">
                  <li>「通知を許可する」を押して、iPhone 側の許可ダイアログで許可します。</li>
                  <li>「このデバイスにプロファイルを作成」を押すと、`.mobileconfig` のダウンロードが始まります。</li>
                  <li>インストール後、設定アプリの VPN から接続できます。</li>
                  <li>Safari の共有メニューからホーム画面に追加すると、Web アプリも置けます。</li>
                </ol>
              ) : platform === "mac" ? (
                <ol className="wizard-list">
                  <li>通知を許可したあと、プロファイルをダウンロードします。</li>
                  <li>`.mobileconfig` を開いてインストールします。</li>
                  <li>システム設定の VPN から接続します。</li>
                </ol>
              ) : (
                <p className="text-sm">
                  この端末ではプロファイル作成後にダウンロードリンクを表示します。必要ならあとで設定画面から再取得できます。
                </p>
              )}
            </div>

            <div className="btn-row">
              <button className="btn btn--out" onClick={() => setStep(3)} type="button">戻る</button>
              <button className="btn btn--fill" onClick={() => setStep(5)} type="button">次へ</button>
            </div>
          </div>
        ) : null}

        {/* Step 5: Goals */}
        {step === 5 ? (
          <div className="wizard-pane form-stack">
            <div>
              <h2 className="section-h2">目標を設定</h2>
              <p className="text-sm">最大 3 件まで追加できます。後から変更できます。</p>
            </div>
            {goals.map((goal, index) => (
              <div key={index} className="card form-stack">
                <div className="form-grid">
                  <label className="field"><span className="field__label">目標名</span><input value={goal.title} onChange={(e) => updateGoal(index, "title", e.target.value)} placeholder="新しいMacBook" /></label>
                  <label className="field"><span className="field__label">目標金額</span><input type="number" inputMode="numeric" min="1" value={goal.targetAmount} onChange={(e) => updateGoal(index, "targetAmount", e.target.value)} placeholder="150000" /></label>
                  <div className="field--wide">
                    <DateField
                      label="期限（任意）"
                      onChange={(value) => updateGoal(index, "deadline", value)}
                      value={goal.deadline}
                    />
                  </div>
                  {visualOptions.length > 0 ? (
                    <label className="field field--wide">
                      <span className="field__label">イメージ選択（任意）</span>
                      <select value={goal.visualOptionId} onChange={(e) => updateGoal(index, "visualOptionId", e.target.value)}>
                        <option value="">なし</option>
                        {visualOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.title}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <button className="btn btn--del btn--sm" onClick={() => removeGoal(index)} type="button">削除</button>
              </div>
            ))}
            {goals.length < 3 ? (
              <button className="btn btn--out" onClick={addGoal} type="button">
                <span className="material-symbols-outlined">add</span>
                目標を追加
              </button>
            ) : null}
            <div className="btn-row">
              <button className="btn btn--out" onClick={() => setStep(4)} type="button">戻る</button>
              <button className="btn btn--fill" disabled={loading} onClick={() => void completeSetup()} type="button">
                {loading ? "保存中..." : "設定を完了する"}
              </button>
            </div>
          </div>
        ) : null}

        {error ? <Feedback kind="err">{error}</Feedback> : null}
      </div>
    </div>
  );
}
