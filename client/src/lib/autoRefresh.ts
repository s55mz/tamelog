import { useEffect, useRef } from "react";

/**
 * バックグラウンドで定期的にデータを再取得するフック。
 * - ユーザーが input/textarea/select にフォーカス中はスキップ
 * - enabled=false でチャット画面などで無効化可能
 */
export function useAutoRefresh(
  callback: () => void,
  intervalMs = 30_000,
  enabled = true
): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
      const active = document.activeElement;
      const tag = active?.tagName ?? "";
      const isEditing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (active as HTMLElement | null)?.contentEditable === "true";
      if (isEditing) return;
      cbRef.current();
    }, intervalMs);

    const onPtr = () => { cbRef.current(); };
    document.addEventListener("tamelog:refresh", onPtr);

    return () => {
      clearInterval(id);
      document.removeEventListener("tamelog:refresh", onPtr);
    };
  }, [intervalMs, enabled]);
}
