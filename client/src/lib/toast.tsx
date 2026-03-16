import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastItem = { id: number; kind: "ok" | "err"; message: string };
type ToastFn = (message: string, kind?: "ok" | "err") => void;

const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, kind: "ok" | "err" = "ok") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column-reverse",
          gap: "var(--s2)",
          pointerEvents: "none",
          width: "max-content",
          maxWidth: "calc(100vw - 32px)"
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--s2)",
              padding: "12px var(--s5)",
              borderRadius: "var(--r3)",
              background: t.kind === "ok" ? "var(--jade)" : "var(--coral)",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
              animation: "toastIn 0.22s ease",
              whiteSpace: "nowrap"
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
              {t.kind === "ok" ? "check_circle" : "error"}
            </span>
            {t.message}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
