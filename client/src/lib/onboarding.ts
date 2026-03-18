export type SetupStep =
  | "welcome"
  | "payday"
  | "account-choice"
  | "account-name"
  | "account-type"
  | "account-balance"
  | "account-review"
  | "profile-installed"
  | "profile-guide"
  | "notification"
  | "complete";

export type SetupDraft = {
  step: SetupStep;
  returnStep: SetupStep | null;
  paydayOfMonth: string;
  accountEnabled: boolean;
  accountName: string;
  accountType: "BANK" | "CASH" | "CREDIT";
  accountBalance: string;
  profileInstalled: boolean | null;
};

const SETUP_DRAFT_KEY = "tamelog_setup_draft";
const NOTIFICATION_PROMPT_KEY = "tamelog_notification_prompt_until";
const NOTIFICATION_PROMPT_DELAY_MS = 3 * 24 * 60 * 60 * 1000;

export const DEFAULT_SETUP_DRAFT: SetupDraft = {
  step: "welcome",
  returnStep: null,
  paydayOfMonth: "25",
  accountEnabled: false,
  accountName: "",
  accountType: "BANK",
  accountBalance: "0",
  profileInstalled: null
};

const stepSet = new Set<SetupStep>([
  "welcome",
  "payday",
  "account-choice",
  "account-name",
  "account-type",
  "account-balance",
  "account-review",
  "profile-installed",
  "profile-guide",
  "notification",
  "complete"
]);

function isStep(value: unknown): value is SetupStep {
  return typeof value === "string" && stepSet.has(value as SetupStep);
}

export function loadSetupDraft(): SetupDraft {
  const raw = localStorage.getItem(SETUP_DRAFT_KEY);

  if (!raw) {
    return DEFAULT_SETUP_DRAFT;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SetupDraft>;
    return {
      ...DEFAULT_SETUP_DRAFT,
      ...parsed,
      step: isStep(parsed.step) ? parsed.step : DEFAULT_SETUP_DRAFT.step,
      returnStep: isStep(parsed.returnStep) ? parsed.returnStep : null,
      accountEnabled: Boolean(parsed.accountEnabled),
      accountType:
        parsed.accountType === "BANK" || parsed.accountType === "CASH" || parsed.accountType === "CREDIT"
          ? parsed.accountType
          : DEFAULT_SETUP_DRAFT.accountType,
      profileInstalled:
        typeof parsed.profileInstalled === "boolean" ? parsed.profileInstalled : DEFAULT_SETUP_DRAFT.profileInstalled
    };
  } catch {
    return DEFAULT_SETUP_DRAFT;
  }
}

export function saveSetupDraft(draft: SetupDraft) {
  localStorage.setItem(SETUP_DRAFT_KEY, JSON.stringify(draft));
}

export function clearSetupDraft() {
  localStorage.removeItem(SETUP_DRAFT_KEY);
}

export function deferNotificationPrompt(delayMs = NOTIFICATION_PROMPT_DELAY_MS) {
  localStorage.setItem(NOTIFICATION_PROMPT_KEY, String(Date.now() + delayMs));
}

export function clearNotificationPromptDefer() {
  localStorage.removeItem(NOTIFICATION_PROMPT_KEY);
}

export function isNotificationPromptDeferred() {
  const raw = localStorage.getItem(NOTIFICATION_PROMPT_KEY);
  const expiresAt = raw ? Number(raw) : NaN;
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
