import { useEffect, useMemo, useState } from "react";

import { OnboardingSelectionList, OnboardingShell } from "../components/OnboardingShell";
import { ProfileInstallGuide } from "../components/ProfileInstallGuide";
import { Feedback } from "../components/ui";
import { useMobileViewport } from "../hooks/useMobileViewport";
import {
  clearSetupDraft,
  clearNotificationPromptDefer,
  deferNotificationPrompt,
  loadSetupDraft,
  saveSetupDraft,
  type SetupDraft,
  type SetupStep
} from "../lib/onboarding";
import { apiRequest } from "../lib/api";
import { isPushSubscribed, subscribePush } from "../lib/push";
import { getAuthToken } from "../lib/storage";

type UserSetupPageProps = {
  onCompleted: () => Promise<void>;
};

type VpnSetupData = {
  id: string;
  vpnIp: string;
  mobileconfigUrl: string;
  platform: string;
};

const stepTitles: Record<SetupStep, string> = {
  welcome: "ようこそ",
  payday: "給料日",
  "account-choice": "口座",
  "account-name": "口座名",
  "account-type": "口座種別",
  "account-balance": "残高",
  "account-review": "確認",
  "profile-installed": "プロファイル",
  "profile-guide": "インストール案内",
  notification: "通知",
  complete: "完了"
};

function detectPlatform(): "ios" | "android" | "mac" | "windows" | "other" {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/macintosh|mac os x/.test(ua)) return "mac";
  if (/windows/.test(ua)) return "windows";
  return "other";
}

function formatBalance(value: string) {
  const amount = Number(value || "0");
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(amount);
}

function sanitizeBalance(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? String(Number(digits)) : "0";
}

function getStepOrder(draft: SetupDraft): SetupStep[] {
  const steps: SetupStep[] = ["welcome", "payday", "account-choice"];

  if (draft.accountEnabled) {
    steps.push("account-name", "account-type", "account-balance", "account-review");
  }

  steps.push("profile-installed");

  if (draft.profileInstalled === false) {
    steps.push("profile-guide");
  }

  steps.push("notification", "complete");
  return steps;
}

function getPreviousStep(draft: SetupDraft) {
  const order = getStepOrder(draft);
  const index = order.indexOf(draft.step);
  return index > 0 ? order[index - 1] : null;
}

export function UserSetupPage({ onCompleted }: UserSetupPageProps) {
  const token = getAuthToken();
  const platform = useMemo(detectPlatform, []);
  const { keyboardOpen, handleFocusIntoView } = useMobileViewport();
  const [draft, setDraft] = useState<SetupDraft>(() => loadSetupDraft());
  const [error, setError] = useState("");
  const [pushSupported, setPushSupported] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushReady, setPushReady] = useState(false);
  const [pushError, setPushError] = useState("");
  const [vpnLoading, setVpnLoading] = useState(false);
  const [vpnReady, setVpnReady] = useState(false);
  const [vpnError, setVpnError] = useState("");
  const [vpnSetupData, setVpnSetupData] = useState<VpnSetupData | null>(null);
  const [completeSaving, setCompleteSaving] = useState(false);
  const [completeReady, setCompleteReady] = useState(false);

  const stepOrder = useMemo(() => getStepOrder(draft), [draft]);
  const stepIndex = Math.max(stepOrder.indexOf(draft.step), 0) + 1;
  const isTextEntryStep = draft.step === "account-name" || draft.step === "account-balance";
  const isSelectionStep =
    draft.step === "account-choice"
    || draft.step === "account-type"
    || draft.step === "profile-installed";
  const bodyClassName = [
    isTextEntryStep ? "setup-native--text-entry" : "",
    isSelectionStep ? "setup-native--selection" : ""
  ].filter(Boolean).join(" ");

  useEffect(() => {
    saveSetupDraft(draft);
  }, [draft]);

  useEffect(() => {
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setPushSupported(supported);
    if (!supported) {
      return;
    }
    void isPushSubscribed().then(setPushReady).catch(() => setPushReady(false));
  }, []);

  useEffect(() => {
    if (!draft.accountEnabled && ["account-name", "account-type", "account-balance", "account-review"].includes(draft.step)) {
      setDraft((current) => ({ ...current, step: "profile-installed", returnStep: null }));
      return;
    }

    if (draft.profileInstalled !== false && draft.step === "profile-guide") {
      setDraft((current) => ({ ...current, step: "notification" }));
    }
  }, [draft.accountEnabled, draft.profileInstalled, draft.step]);

  const updateDraft = (patch: Partial<SetupDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const moveTo = (step: SetupStep, patch?: Partial<SetupDraft>) => {
    setDraft((current) => ({ ...current, ...patch, step }));
    setError("");
  };

  const moveBack = () => {
    const previous = getPreviousStep(draft);
    if (!previous) {
      return;
    }
    moveTo(previous);
  };

  const createVpnProfile = async () => {
    if (!token) {
      setError("セッションが切れました。再度ログインしてください。");
      return;
    }

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

  const requestPushPermission = async () => {
    if (!token || !pushSupported) {
      return false;
    }

    setPushLoading(true);
    setPushError("");
    try {
      const ok = await subscribePush(token);
      if (!ok) {
        setPushError("通知の許可が得られませんでした。ブラウザ設定を確認してください。");
        return false;
      }
      setPushReady(true);
      clearNotificationPromptDefer();
      return true;
    } catch (nextError) {
      setPushError(nextError instanceof Error ? nextError.message : "通知の設定に失敗しました");
      return false;
    } finally {
      setPushLoading(false);
    }
  };

  const saveSetup = async () => {
    if (!token) {
      setError("セッションが切れました。再度ログインしてください。");
      return false;
    }

    setCompleteSaving(true);
    setError("");
    try {
      await apiRequest<{ success: boolean }>("/api/users/me/complete-setup", {
        method: "POST",
        token,
        body: {
          paydayOfMonth: Number(draft.paydayOfMonth),
          initialAccount: draft.accountEnabled
            ? {
                name: draft.accountName.trim() || "メイン口座",
                type: draft.accountType,
                balance: Number(draft.accountBalance || "0")
              }
            : undefined,
          goals: []
        }
      });
      clearSetupDraft();
      setCompleteReady(true);
      moveTo("complete");
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "初期設定に失敗しました");
      return false;
    } finally {
      setCompleteSaving(false);
    }
  };

  const handleFinishWithNotifications = async () => {
    const notificationGranted = await requestPushPermission();
    if (!notificationGranted) {
      return;
    }
    await saveSetup();
  };

  const handleFinishLater = async () => {
    deferNotificationPrompt();
    await saveSetup();
  };

  const renderCurrentStep = () => {
    switch (draft.step) {
      case "welcome":
        return (
          <>
            <div className="setup-native__copy-block">
              <p className="setup-native__eyebrow">Welcome</p>
              <h1 className="setup-native__title">この端末で使うための設定を、短い順番で進めます。</h1>
              <p className="setup-native__copy">
                1画面ずつ必要なことだけ聞きます。途中で閉じても、この続きから再開できます。
              </p>
            </div>
            <div className="setup-native__summary">
              <div className="setup-native__summary-item">
                <strong>給料日を設定</strong>
                <span>期間の基準日として使います。</span>
              </div>
              <div className="setup-native__summary-item">
                <strong>口座情報を確認</strong>
                <span>必要な場合だけ追加します。</span>
              </div>
              <div className="setup-native__summary-item">
                <strong>プロファイルと通知</strong>
                <span>重要な設定だけ最後にまとめます。</span>
              </div>
            </div>
            <p className="setup-native__section-note">必要なのは数ステップだけです。あとから設定画面でも変更できます。</p>
          </>
        );

      case "payday":
        return (
          <>
            <div className="setup-native__copy-block">
              <p className="setup-native__eyebrow">Payday</p>
              <h1 className="setup-native__title">給料日はいつですか？</h1>
              <p className="setup-native__copy">この日を基準に、月の収支や進捗を区切ります。</p>
            </div>
            <label className="field">
              <span className="field__label">毎月の給料日</span>
              <select value={draft.paydayOfMonth} onChange={(event) => updateDraft({ paydayOfMonth: event.target.value })}>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}日
                  </option>
                ))}
              </select>
            </label>
            <p className="setup-native__section-note">この設定を基準に、月の切り替わりとレポート期間を計算します。</p>
          </>
        );

      case "account-choice":
        return (
          <>
            <div className="setup-native__copy-block">
              <p className="setup-native__eyebrow">Account</p>
              <h1 className="setup-native__title">最初の口座を追加しますか？</h1>
              <p className="setup-native__copy">今はスキップしても大丈夫です。あとから設定画面で追加できます。</p>
            </div>
            <OnboardingSelectionList
              items={[
                { id: "enabled", label: "追加する", hint: "口座名、種別、残高を登録します。" },
                { id: "later", label: "あとで", hint: "いまは家計簿だけ先に使い始めます。" }
              ]}
              selectedId={draft.accountEnabled ? "enabled" : "later"}
              onSelect={(id) => updateDraft({ accountEnabled: id === "enabled", returnStep: null })}
            />
          </>
        );

      case "account-name":
        return (
          <>
            <div className="setup-native__copy-block">
              <p className="setup-native__eyebrow">Account Name</p>
              <h1 className="setup-native__title">口座名を入力してください</h1>
              <p className="setup-native__copy">銀行名や普段の呼び名で大丈夫です。</p>
            </div>
            <label className="field">
              <span className="field__label">口座名</span>
              <input
                autoFocus
                enterKeyHint="next"
                placeholder="三井住友銀行"
                value={draft.accountName}
                onChange={(event) => updateDraft({ accountName: event.target.value })}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.key !== "Enter" || !draft.accountName.trim()) {
                    return;
                  }
                  moveTo(draft.returnStep === "account-review" ? "account-review" : "account-type", { returnStep: null });
                }}
              />
            </label>
            <p className="setup-native__section-note">例: 三井住友銀行、生活口座、現金 など</p>
          </>
        );

      case "account-type":
        return (
          <>
            <div className="setup-native__copy-block">
              <p className="setup-native__eyebrow">Account Type</p>
              <h1 className="setup-native__title">どの種類ですか？</h1>
              <p className="setup-native__copy">あとで残高の集計方法に使います。</p>
            </div>
            <OnboardingSelectionList
              items={[
                { id: "BANK", label: "銀行口座", hint: "メインの預金口座向け" },
                { id: "CASH", label: "現金", hint: "手元の現金管理向け" },
                { id: "CREDIT", label: "クレジットカード", hint: "引き落とし前の支出管理向け" }
              ]}
              selectedId={draft.accountType}
              onSelect={(id) => updateDraft({ accountType: id as SetupDraft["accountType"] })}
            />
          </>
        );

      case "account-balance":
        return (
          <>
            <div className="setup-native__copy-block">
              <p className="setup-native__eyebrow">Balance</p>
              <h1 className="setup-native__title">現在の残高を入力してください</h1>
              <p className="setup-native__copy">ざっくりでも構いません。あとから修正できます。</p>
            </div>
            <label className="field">
              <span className="field__label">残高</span>
              <input
                inputMode="numeric"
                enterKeyHint="done"
                placeholder="0"
                value={draft.accountBalance}
                onChange={(event) => updateDraft({ accountBalance: sanitizeBalance(event.target.value) })}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.key !== "Enter") {
                    return;
                  }
                  moveTo("account-review", { returnStep: null });
                }}
              />
            </label>
            <p className="setup-native__value-preview">{formatBalance(draft.accountBalance)}</p>
            <p className="setup-native__section-note">厳密でなくても大丈夫です。あとから修正できます。</p>
          </>
        );

      case "account-review":
        return (
          <>
            <div className="setup-native__copy-block">
              <p className="setup-native__eyebrow">Review</p>
              <h1 className="setup-native__title">口座情報を確認してください</h1>
              <p className="setup-native__copy">違っていれば、その項目だけ戻って修正できます。</p>
            </div>
            <div className="setup-native__review">
              <div className="setup-native__review-row">
                <div>
                  <span>口座名</span>
                  <strong>{draft.accountName || "未入力"}</strong>
                </div>
                <button className="btn btn--ghost btn--sm" onClick={() => moveTo("account-name", { returnStep: "account-review" })} type="button">
                  編集
                </button>
              </div>
              <div className="setup-native__review-row">
                <div>
                  <span>種別</span>
                  <strong>
                    {draft.accountType === "BANK" ? "銀行口座" : draft.accountType === "CASH" ? "現金" : "クレジットカード"}
                  </strong>
                </div>
                <button className="btn btn--ghost btn--sm" onClick={() => moveTo("account-type", { returnStep: "account-review" })} type="button">
                  編集
                </button>
              </div>
              <div className="setup-native__review-row">
                <div>
                  <span>残高</span>
                  <strong>{formatBalance(draft.accountBalance)}</strong>
                </div>
                <button className="btn btn--ghost btn--sm" onClick={() => moveTo("account-balance", { returnStep: "account-review" })} type="button">
                  編集
                </button>
              </div>
            </div>
          </>
        );

      case "profile-installed":
        return (
          <>
            <div className="setup-native__copy-block">
              <p className="setup-native__eyebrow">Profile</p>
              <h1 className="setup-native__title">すでにプロファイルをインストール済みですか？</h1>
              <p className="setup-native__copy">
                新規登録前に入れていれば、そのまま次へ進めます。まだなら今ここで手順を案内します。
              </p>
            </div>
            <OnboardingSelectionList
              items={[
                { id: "installed", label: "はい、入っています", hint: "このままスキップして次へ進みます。" },
                { id: "not-installed", label: "いいえ、まだです", hint: "今ここでダウンロードと有効化を案内します。" }
              ]}
              selectedId={draft.profileInstalled === true ? "installed" : draft.profileInstalled === false ? "not-installed" : null}
              onSelect={(id) => {
                if (id === "installed") {
                  moveTo("notification", { profileInstalled: true });
                  return;
                }
                moveTo("profile-guide", { profileInstalled: false });
              }}
            />
          </>
        );

      case "profile-guide":
        return (
          <>
            <div className="setup-native__copy-block">
              <p className="setup-native__eyebrow">Install Guide</p>
              <h1 className="setup-native__title">プロファイルのインストール方法</h1>
              <p className="setup-native__copy">
                迷わないように、先に流れを見せています。ダウンロード後に設定アプリから有効化してください。
              </p>
            </div>
            <ProfileInstallGuide />
            <div className="setup-native__summary">
              <div className="setup-native__summary-item">
                <strong>このプロファイルに含まれるもの</strong>
                <span>VPN、フィルタリング証明書、貯めログの WebClip です。</span>
              </div>
            </div>
            <div className="wizard-action-stack">
              <button className="btn btn--fill btn--block" disabled={vpnLoading} onClick={() => void createVpnProfile()} type="button">
                {vpnLoading ? "プロファイルを作成中..." : vpnSetupData ? "もう一度ダウンロードする" : "プロファイルをダウンロードする"}
              </button>
              {vpnSetupData ? (
                <a className="btn btn--out btn--block" href={vpnSetupData.mobileconfigUrl}>
                  ダウンロードリンクを開く
                </a>
              ) : null}
            </div>
            {platform === "ios" ? (
              <ol className="wizard-list">
                <li>設定 → 一般 → VPN とデバイス管理 を開きます。</li>
                <li>ダウンロード済みのプロファイル を選び、インストールします。</li>
                <li>設定 → 一般 → 情報 → 証明書信頼設定 を開きます。</li>
                <li>ルート証明書を全面的に信頼 を有効化します。</li>
              </ol>
            ) : (
              <ol className="wizard-list">
                <li>プロファイルをダウンロードします。</li>
                <li>ファイルを開いて案内に従ってインストールします。</li>
                <li>証明書を信頼し、VPN の接続を有効にします。</li>
              </ol>
            )}
            <p className="setup-native__section-note">インストール後は VPN を有効にするとフィルタリングが動作します。</p>
            {vpnError ? <Feedback kind="err">{vpnError}</Feedback> : null}
          </>
        );

      case "notification":
        return (
          <>
            <div className="setup-native__copy-block">
              <p className="setup-native__eyebrow">Notifications</p>
              <h1 className="setup-native__title">リマインドを受け取りますか？</h1>
              <p className="setup-native__copy">
                給料日やレポート更新をお知らせできます。不要ならあとで有効化しても構いません。
              </p>
            </div>
            <div className="setup-native__summary">
              <div className="setup-native__summary-item">
                <strong>給料日のリマインド</strong>
                <span>期間の切り替わりを見逃しにくくします。</span>
              </div>
              <div className="setup-native__summary-item">
                <strong>進捗やレポート更新</strong>
                <span>重要な変化だけを後から確認できます。</span>
              </div>
            </div>
            <p className="setup-native__section-note">不要ならあとで設定から有効化できます。</p>
            {pushReady ? <Feedback kind="ok">通知はすでに有効です。このまま完了できます。</Feedback> : null}
            {pushError ? <Feedback kind="err">{pushError}</Feedback> : null}
            {!pushSupported ? <Feedback kind="err">この端末ではプッシュ通知に対応していません。</Feedback> : null}
          </>
        );

      case "complete":
        return (
          <>
            <div className="setup-native__copy-block">
              <p className="setup-native__eyebrow">Done</p>
              <h1 className="setup-native__title">初期設定が完了しました</h1>
              <p className="setup-native__copy">この端末から、そのまま家計簿を使い始められます。</p>
            </div>
            <div className="setup-native__summary">
              <div className="setup-native__summary-item">
                <strong>給料日</strong>
                <span>毎月 {draft.paydayOfMonth} 日</span>
              </div>
              <div className="setup-native__summary-item">
                <strong>口座設定</strong>
                <span>{draft.accountEnabled ? `${draft.accountName || "メイン口座"} を登録済み` : "あとで追加"}</span>
              </div>
              <div className="setup-native__summary-item">
                <strong>プロファイル</strong>
                <span>{draft.profileInstalled || vpnReady ? "案内済み" : "未設定のまま"}</span>
              </div>
            </div>
          </>
        );
    }
  };

  const renderPrimaryAction = () => {
    switch (draft.step) {
      case "welcome":
        return (
          <button className="btn btn--fill btn--block" onClick={() => moveTo("payday")} type="button">
            はじめる
          </button>
        );

      case "payday":
        return (
          <button className="btn btn--fill btn--block" onClick={() => moveTo("account-choice")} type="button">
            次へ
          </button>
        );

      case "account-choice":
        return (
          <button
            className="btn btn--fill btn--block"
            onClick={() => moveTo(draft.accountEnabled ? "account-name" : "profile-installed")}
            type="button"
          >
            次へ
          </button>
        );

      case "account-name":
        return (
          <button
            className="btn btn--fill btn--block"
            disabled={!draft.accountName.trim()}
            onClick={() => moveTo(draft.returnStep === "account-review" ? "account-review" : "account-type", { returnStep: null })}
            type="button"
          >
            {draft.returnStep === "account-review" ? "確認に戻る" : "次へ"}
          </button>
        );

      case "account-type":
        return (
          <button
            className="btn btn--fill btn--block"
            onClick={() => moveTo(draft.returnStep === "account-review" ? "account-review" : "account-balance", { returnStep: null })}
            type="button"
          >
            {draft.returnStep === "account-review" ? "確認に戻る" : "次へ"}
          </button>
        );

      case "account-balance":
        return (
          <button
            className="btn btn--fill btn--block"
            onClick={() => moveTo(draft.returnStep === "account-review" ? "account-review" : "account-review", { returnStep: null })}
            type="button"
          >
            確認する
          </button>
        );

      case "account-review":
        return (
          <button className="btn btn--fill btn--block" onClick={() => moveTo("profile-installed")} type="button">
            この内容で進む
          </button>
        );

      case "profile-installed":
        return null;

      case "profile-guide":
        return (
          <button className="btn btn--fill btn--block" onClick={() => moveTo("notification", { profileInstalled: true })} type="button">
            インストールできたので次へ
          </button>
        );

      case "notification":
        return (
          <>
            <button
              className="btn btn--fill btn--block"
              disabled={completeSaving || pushLoading || !pushSupported}
              onClick={() => void handleFinishWithNotifications()}
              type="button"
            >
              {pushLoading ? "通知を確認中..." : completeSaving ? "保存中..." : "通知を有効にして完了"}
            </button>
            <button className="btn btn--ghost btn--block" disabled={completeSaving} onClick={() => void handleFinishLater()} type="button">
              {completeSaving ? "保存中..." : "あとで"}
            </button>
          </>
        );

      case "complete":
        return (
          <button
            className="btn btn--fill btn--block"
            disabled={!completeReady}
            onClick={() => void onCompleted()}
            type="button"
          >
            ホームへ進む
          </button>
        );
    }
  };

  return (
    <div onFocusCapture={handleFocusIntoView}>
      <OnboardingShell
        bodyClassName={bodyClassName}
        flowLabel="初期設定"
        footer={renderPrimaryAction()}
        keyboardOpen={keyboardOpen}
        onBack={draft.step === "welcome" || draft.step === "complete" ? undefined : moveBack}
        progressLabel={`${stepIndex} / ${stepOrder.length}`}
        progressValue={(stepIndex / stepOrder.length) * 100}
        title={stepTitles[draft.step]}
      >
        {renderCurrentStep()}
        {error ? <Feedback kind="err">{error}</Feedback> : null}
      </OnboardingShell>
    </div>
  );
}
