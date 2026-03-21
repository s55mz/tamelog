import type { ReactNode } from "react";

type OnboardingShellProps = {
  title: string;
  flowLabel: string;
  progressLabel: string;
  progressValue: number;
  keyboardOpen?: boolean;
  onBack?: () => void;
  bodyClassName?: string;
  footerClassName?: string;
  children: ReactNode;
  footer: ReactNode;
};

export function OnboardingShell({
  title,
  flowLabel,
  progressLabel,
  progressValue,
  keyboardOpen = false,
  onBack,
  bodyClassName = "",
  footerClassName = "",
  children,
  footer
}: OnboardingShellProps) {
  return (
    <div className="wizard-wrap wizard-wrap--native">
      <div className={`setup-native ${keyboardOpen ? "setup-native--keyboard" : ""}`.trim()}>
        <div className="setup-native__header">
          <div className="setup-native__nav">
            {onBack ? (
              <button className="setup-native__back" onClick={onBack} type="button">
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
            ) : (
              <div className="setup-native__back setup-native__back--placeholder" aria-hidden="true" />
            )}
            <div className="setup-native__nav-copy">
              <span className="setup-native__nav-title">{flowLabel}</span>
              <span className="setup-native__progress-label">{progressLabel}</span>
            </div>
          </div>
          <div className="setup-native__progress">
            <span style={{ width: `${Math.max(0, Math.min(progressValue, 100))}%` }} />
          </div>
          <p className="setup-native__step-title">{title}</p>
        </div>

        <div className={`setup-native__body ${bodyClassName}`.trim()}>{children}</div>

        <div className={`setup-native__footer ${footerClassName}`.trim()}>{footer}</div>
      </div>
    </div>
  );
}

type SelectionItem = {
  id: string;
  label: string;
  hint: string;
};

export function OnboardingSelectionList({
  items,
  selectedId,
  onSelect
}: {
  items: SelectionItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="setup-native__choices" role="listbox" aria-label="選択項目">
      {items.map((item) => (
        <button
          className={`setup-native__choice ${selectedId === item.id ? "is-active" : ""}`.trim()}
          key={item.id}
          onClick={() => onSelect(item.id)}
          role="option"
          aria-selected={selectedId === item.id}
          type="button"
        >
          <span className="setup-native__choice-copy">
            <strong>{item.label}</strong>
            <span>{item.hint}</span>
          </span>
          <span className="setup-native__choice-check" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
