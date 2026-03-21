import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { OnboardingShell } from "../components/OnboardingShell";
import { Feedback } from "../components/ui";
import { useMobileViewport } from "../hooks/useMobileViewport";
import { clearNotificationPromptDefer, deferNotificationPrompt } from "../lib/onboarding";
import { isPushSubscribed, subscribePush } from "../lib/push";

export function NotificationPromptPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const { keyboardOpen } = useMobileViewport();
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const canPush = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(canPush);
    if (!canPush) {
      return;
    }

    void isPushSubscribed()
      .then((subscribed) => {
        if (subscribed && Notification.permission === "granted") {
          clearNotificationPromptDefer();
          navigate("/", { replace: true });
        }
      })
      .catch(() => undefined);
  }, [navigate]);

  const handleEnable = async () => {
    setLoading(true);
    setError("");
    try {
      const success = supported ? await subscribePush(token) : false;
      if (!success) {
        setError("通知を有効にできませんでした。ブラウザ設定も確認してください。");
        return;
      }
      clearNotificationPromptDefer();
      navigate("/", { replace: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "通知の設定に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleLater = () => {
    deferNotificationPrompt();
    navigate("/", { replace: true });
  };

  return (
    <OnboardingShell
      flowLabel="通知設定"
      footer={
        <>
          <button className="btn btn--fill btn--block" disabled={loading || !supported} onClick={() => void handleEnable()} type="button">
            {loading ? "通知を確認中..." : "通知を有効にする"}
          </button>
          <button className="btn btn--ghost btn--block" onClick={handleLater} type="button">
            あとで
          </button>
        </>
      }
      keyboardOpen={keyboardOpen}
      progressLabel="1 / 1"
      progressValue={100}
      title="通知"
    >
      <div className="setup-native__copy-block">
        <p className="setup-native__eyebrow">Reminder</p>
        <h1 className="setup-native__title">リマインドを受け取りませんか？</h1>
        <p className="setup-native__copy">
          給料日や大事なタイミングを通知できます。いきなり OS の許可を出さず、ここから必要なときだけ有効化できます。
        </p>
      </div>

      <div className="setup-native__summary">
        <div className="setup-native__summary-item">
          <strong>給料日通知</strong>
          <span>期間の切り替わりを見逃しにくくします。</span>
        </div>
        <div className="setup-native__summary-item">
          <strong>レポート更新</strong>
          <span>月次の変化をすぐに確認できます。</span>
        </div>
      </div>

      <p className="setup-native__section-note">通知が不要な場合は、あとで設定から有効化できます。</p>

      {!supported ? (
        <Feedback kind="err">この端末では Web プッシュ通知に対応していません。</Feedback>
      ) : null}
      {error ? <Feedback kind="err">{error}</Feedback> : null}
    </OnboardingShell>
  );
}
