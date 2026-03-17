import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout";
import { ReceiptCamera } from "../components/ReceiptCamera";
import { DateTimeField } from "../components/TemporalFields";
import { LoadingSpinner } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import { useToast } from "../lib/toast";
import type { AppUser } from "../lib/types";

type Account = { id: string; name: string; type: string; balance: number };
type Category = { id: string; name: string; type: string };
type Goal = { id: string; title: string };
type RecordMode = "INCOME" | "EXPENSE" | "SAVING" | "TRANSFER";

type RecordPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

const modeConfig: Record<RecordMode, { label: string; color: string; icon: string }> = {
  INCOME:   { label: "収入",   color: "var(--jade)",  icon: "arrow_downward" },
  EXPENSE:  { label: "支出",   color: "var(--coral)", icon: "arrow_upward" },
  SAVING:   { label: "貯金",   color: "var(--amber)", icon: "savings" },
  TRANSFER: { label: "移動",   color: "var(--sky)",   icon: "swap_horiz" }
};

const EMOTIONS = ["嬉しい", "衝動的", "不安", "必要", "疲れた", "後悔"];

type OcrResult = {
  amount: number | null;
  date: string | null;
  time: string | null;
  vendor: string | null;
  type: "INCOME" | "EXPENSE";
  categoryId: string | null;
};

type OcrConfirmState = {
  open: boolean;
  result: OcrResult | null;
};

function nowDatetimeLocal() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

async function optimizeImage(file: File): Promise<{ imageBase64: string; mimeType: string; previewUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = dataUrl;
  });

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("画像変換に失敗しました");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const previewUrl = canvas.toDataURL("image/jpeg", 0.84);
  return {
    imageBase64: previewUrl.split(",")[1] ?? "",
    mimeType: "image/jpeg",
    previewUrl
  };
}

export function RecordPage({ user, onLogout }: RecordPageProps) {
  const token = getAuthToken();
  const toast = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [mode, setMode] = useState<RecordMode>("EXPENSE");
  const [recordTab, setRecordTab] = useState<"manual" | "ocr">("manual");
  const [error, setError] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPhase, setOcrPhase] = useState("");
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState("");
  const [ocrConfirm, setOcrConfirm] = useState<OcrConfirmState>({ open: false, result: null });
  const [showEmotions, setShowEmotions] = useState(false);
  const [form, setForm] = useState({
    accountId: "",
    categoryId: "",
    amount: "",
    payee: "",
    datetime: nowDatetimeLocal(),
    fromAccountId: "",
    toAccountId: "",
    goalId: "",
    emotions: [] as string[]
  });

  useEffect(() => {
    if (!token) return;
    void Promise.all([
      apiRequest<{ accounts: Account[] }>("/api/accounts", { token }),
      apiRequest<{ categories: Category[] }>("/api/categories", { token }),
      apiRequest<{ goals: Goal[] }>("/api/goals", { token })
    ]).then(([accountsData, categoriesData, goalsData]) => {
      setAccounts(accountsData.accounts);
      setCategories(categoriesData.categories);
      setGoals(goalsData.goals);
      setForm((current) => ({
        ...current,
        accountId: current.accountId || accountsData.accounts[0]?.id || "",
        fromAccountId: current.fromAccountId || accountsData.accounts[0]?.id || "",
        toAccountId:
          current.toAccountId ||
          accountsData.accounts[1]?.id ||
          accountsData.accounts[0]?.id ||
          ""
      }));
    });
  }, [token]);

  const keypadValues = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"];

  const appendAmount = (value: string) => {
    if (value === "del") {
      setForm((current) => ({ ...current, amount: current.amount.slice(0, -1) }));
      return;
    }
    setForm((current) => ({
      ...current,
      amount: `${current.amount}${value}`.replace(/^0+(?=\d)/, "")
    }));
  };

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.type === mode),
    [categories, mode]
  );

  const toggleEmotion = (value: string) => {
    setForm((current) => ({
      ...current,
      emotions: current.emotions.includes(value)
        ? current.emotions.filter((e) => e !== value)
        : [...current.emotions, value]
    }));
  };

  const resetInputFields = () => {
    setForm((current) => ({
      ...current,
      amount: "",
      payee: "",
      categoryId: "",
      goalId: "",
      emotions: [],
      datetime: nowDatetimeLocal()
    }));
    setShowEmotions(false);
  };

  // ── OCR ─────────────────────────────────────────────
  const runOcr = async ({
    imageBase64,
    mimeType,
    previewUrl
  }: {
    imageBase64: string;
    mimeType: string;
    previewUrl?: string;
  }) => {
    if (!token) return;
    setOcrLoading(true);
    setOcrPhase("画像を整えています");
    setError("");
    try {
      if (previewUrl) {
        setOcrPreviewUrl(previewUrl);
      }

      setOcrPhase("レシートを解析しています");
      const data = await apiRequest<OcrResult>("/api/ocr", {
        method: "POST",
        token,
        body: {
          imageBase64,
          mimeType,
          categories: categories.map((c) => ({ id: c.id, name: c.name, type: c.type }))
        }
      });

      setOcrPhase("カテゴリと日時を反映しています");
      const detectedType = data.type ?? "EXPENSE";
      setMode(detectedType);

      const ocrDatetime = data.date
        ? `${data.date}T${data.time ?? "00:00"}`
        : nowDatetimeLocal();

      // Only use AI categoryId if it matches the detected type (prevents INVALID_CATEGORY error)
      const validOcrCategoryId = data.categoryId &&
        categories.some((c) => c.id === data.categoryId && c.type === detectedType)
          ? data.categoryId
          : "";

      setOcrConfirm({ open: true, result: data });
      setForm((current) => ({
        ...current,
        amount: data.amount ? String(data.amount) : current.amount,
        payee: data.vendor ?? current.payee,
        datetime: ocrDatetime,
        categoryId: validOcrCategoryId,
        emotions: []
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR処理に失敗しました");
    } finally {
      setOcrLoading(false);
      setOcrPhase("");
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    event.target.value = "";
    try {
      const optimized = await optimizeImage(file);
      await runOcr(optimized);
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像の準備に失敗しました");
    }
  };

  const isValid = () => {
    if (!form.amount || Number(form.amount) <= 0) return false;
    if (mode === "INCOME" || mode === "EXPENSE") {
      if (!form.accountId) return false;
      if (recordTab !== "ocr" && !form.payee.trim()) return false;
    }
    if (mode === "SAVING" || mode === "TRANSFER") {
      if (!form.fromAccountId || !form.toAccountId) return false;
    }
    if (!form.datetime) return false;
    return true;
  };

  const submitRecord = async () => {
    if (!token || !isValid()) return;
    setError("");

    const dt = new Date(form.datetime);
    const recordDate = form.datetime.slice(0, 10);
    const recordedAt = dt.toISOString();

    try {
      if (mode === "INCOME" || mode === "EXPENSE") {
        await apiRequest("/api/records", {
          method: "POST",
          token,
          body: {
            type: mode,
            accountId: form.accountId,
            categoryId: form.categoryId || null,
            goalId: null,
            amount: Number(form.amount),
            memo: form.payee.trim() || null,
            recordDate,
            recordedAt,
            emotions: form.emotions
          }
        });
      } else {
        await apiRequest("/api/account-transfers", {
          method: "POST",
          token,
          body: {
            fromAccountId: form.fromAccountId,
            toAccountId: form.toAccountId,
            goalId: mode === "SAVING" ? form.goalId || null : null,
            kind: mode === "SAVING" ? "SAVING" : "TRANSFER",
            amount: Number(form.amount),
            memo: form.payee.trim() || null,
            recordDate,
            recordedAt
          }
        });
      }

      toast(mode === "TRANSFER" ? "口座移動を保存しました" : "記録を保存しました");
      setOcrConfirm({ open: false, result: null });
      resetInputFields();
      navigate(-1);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存に失敗しました");
    }
  };

  const cfg = modeConfig[mode];
  const amountNum = Number(form.amount || 0);

  // OCR用のカテゴリ（現在のmode=INCOME/EXPENSEでフィルタ）
  const ocrModeCategories = filteredCategories;

  return (
    <AppLayout
      onLogout={onLogout}
      subtitle="今日の動きを、あとで迷わない粒度で残します。"
      title="記録"
      user={user}
    >
      {/* Hidden file input for OCR */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => void handleFileChange(e)}
      />

      {/* ── Tab switcher ────────────────────────────────── */}
      <div className="seg">
        <button
          className={`seg__btn${recordTab === "manual" ? " on" : ""}`}
          onClick={() => setRecordTab("manual")}
          type="button"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>edit</span>
          手動記録
        </button>
        <button
          className={`seg__btn${recordTab === "ocr" ? " on" : ""}`}
          onClick={() => setRecordTab("ocr")}
          type="button"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>receipt_long</span>
          レシート読み取り
        </button>
      </div>

      {/* ══════════════ OCR TAB ══════════════ */}
      {recordTab === "ocr" ? (
        <>
          {/* カメラ: 確認フォーム表示中は非表示 */}
          {!ocrConfirm.open ? (
            <>
              <ReceiptCamera
                disabled={ocrLoading}
                onCapture={(payload) => runOcr(payload)}
              />

              {/* Upload button */}
              <button
                className="btn btn--out"
                disabled={ocrLoading}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: "100%",
                  minHeight: "100px",
                  flexDirection: "column",
                  gap: "var(--s2)",
                  fontSize: "15px",
                  borderStyle: "dashed"
                }}
                type="button"
              >
                {ocrLoading ? (
                  <LoadingSpinner label="読み取り中" />
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: "36px", color: "var(--amber)" }}>
                      add_photo_alternate
                    </span>
                    <span>画像ライブラリから選択</span>
                  </>
                )}
              </button>

              {ocrLoading ? (
                <div className="card form-stack" style={{ background: "var(--bg-2)" }}>
                  <LoadingSpinner label={ocrPhase || "読み取り中"} />
                  <p className="text-sm">レシートを解析しています。少々お待ちください。</p>
                </div>
              ) : (
                <p className="text-xs" style={{ textAlign: "center" }}>
                  レシートや領収書を撮影すると、金額・日付・店名を自動入力します
                </p>
              )}
            </>
          ) : null}

          {/* OCR確認後: 編集フォーム */}
          {ocrConfirm.open ? (
            <>
              {/* 読み取り完了バナー */}
              <div className="ok-msg" style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "18px", flexShrink: 0 }}>
                  check_circle
                </span>
                <span>読み取り完了 — 内容を確認して保存してください</span>
              </div>

              {ocrPreviewUrl ? (
                <div className="receipt-camera__preview">
                  <img alt="読み取ったレシート" src={ocrPreviewUrl} />
                </div>
              ) : null}

              {/* 収入 / 支出 切り替え */}
              <div className="two-up" style={{ gap: "var(--s2)" }}>
                {(["EXPENSE", "INCOME"] as RecordMode[]).map((item) => {
                  const c = modeConfig[item];
                  const active = mode === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setMode(item);
                        setForm((f) => ({ ...f, categoryId: "" }));
                      }}
                      className="mode-btn mode-btn--row"
                      style={active ? { borderColor: c.color, background: `${c.color}18`, color: c.color, fontWeight: 700 } : undefined}
                    >
                      <span className="material-symbols-outlined">{c.icon}</span>
                      {c.label}
                    </button>
                  );
                })}
              </div>

              {/* 金額 */}
              <div className="card">
                <label className="field">
                  <span className="field__label">金額</span>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0"
                    style={{ fontSize: "24px", fontWeight: 700, textAlign: "right" }}
                  />
                </label>
              </div>

              {/* 必須フィールド */}
              <div className="card form-stack">
                <label className="field">
                  <span className="field__label">
                    口座 <span className="field__required">必須</span>
                  </span>
                  <select
                    value={form.accountId}
                    onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field__label">取引先</span>
                  <input
                    value={form.payee}
                    onChange={(e) => setForm({ ...form, payee: e.target.value })}
                    placeholder="店名・取引先名"
                  />
                </label>

                <DateTimeField
                  label="日時"
                  onChange={(next) => setForm({ ...form, datetime: next })}
                  required
                  value={form.datetime}
                />
              </div>

              {/* カテゴリ */}
              {ocrModeCategories.length > 0 ? (
                <div>
                  <p className="field__label" style={{ marginBottom: "var(--s2)" }}>
                    カテゴリ
                    {form.categoryId ? (
                      <span style={{ marginLeft: "var(--s2)", fontSize: "11px", color: "var(--amber)", fontWeight: 600 }}>
                        · AI自動選択
                      </span>
                    ) : null}
                  </p>
                  <div className="chip-group">
                    <button
                      className={`chip ${form.categoryId === "" ? "on" : ""}`}
                      onClick={() => setForm({ ...form, categoryId: "" })}
                      type="button"
                    >
                      なし
                    </button>
                    {ocrModeCategories.map((category) => (
                      <button
                        className={`chip ${form.categoryId === category.id ? "on" : ""}`}
                        key={category.id}
                        onClick={() => setForm({ ...form, categoryId: category.id })}
                        type="button"
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 気持ち（任意） */}
              <div>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setShowEmotions((prev) => !prev)}
                  type="button"
                  style={{ fontSize: "12px", color: "var(--text-2)", padding: "0", marginBottom: showEmotions ? "var(--s2)" : 0 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                    {showEmotions ? "expand_less" : "expand_more"}
                  </span>
                  気持ちを記録する（任意）
                  {form.emotions.length > 0 ? (
                    <span style={{ marginLeft: "4px", color: "var(--amber)", fontWeight: 700 }}>
                      · {form.emotions.length}件
                    </span>
                  ) : null}
                </button>
                {showEmotions ? (
                  <div className="chip-group">
                    {EMOTIONS.map((em) => (
                      <button
                        className={`chip ${form.emotions.includes(em) ? "on" : ""}`}
                        key={em}
                        onClick={() => toggleEmotion(em)}
                        type="button"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* 保存ボタン */}
              <button
                className="btn btn--fill btn--lg btn--block"
                disabled={!isValid()}
                onClick={() => void submitRecord()}
                style={{ background: cfg.color, borderColor: cfg.color }}
                type="button"
              >
                {cfg.label}として保存する
              </button>

              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setOcrConfirm({ open: false, result: null });
                  setOcrPreviewUrl("");
                  resetInputFields();
                }}
                type="button"
                style={{ alignSelf: "center", fontSize: "12px", color: "var(--text-3)" }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>add_photo_alternate</span>
                別の画像を読み取る
              </button>
            </>
          ) : null}

          {error ? <p className="err-msg">{error}</p> : null}
        </>
      ) : null}

      {/* ══════════════ MANUAL TAB ══════════════ */}
      {recordTab === "manual" ? (
        <>
          {/* ── Mode selector ──────────────────────────────── */}
          <div className="four-up" style={{ gap: "var(--s2)" }}>
            {(["INCOME", "EXPENSE", "SAVING", "TRANSFER"] as RecordMode[]).map((item) => {
              const c = modeConfig[item];
              const active = mode === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  className="mode-btn mode-btn--col"
                  style={active ? { borderColor: c.color, background: `${c.color}18`, color: c.color, fontWeight: 700 } : undefined}
                >
                  <span className="material-symbols-outlined">{c.icon}</span>
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* ── Amount display (mobile: big display + keypad) ── */}
          <div className="record-amount-display">
            <p
              style={{
                fontSize: "clamp(44px, 12vw, 72px)",
                fontWeight: 800,
                letterSpacing: "-0.04em",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
                color: amountNum > 0 ? cfg.color : "var(--text-3)",
                transition: "color 0.2s",
                fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', 'DM Mono', monospace"
              }}
            >
              {amountNum > 0 ? formatCurrency(amountNum) : "¥ —"}
            </p>
          </div>

          {/* ── Amount input (PC: keyboard input) ────────────── */}
          <div className="record-amount-input">
            <label className="field">
              <span className="field__label">金額</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/^0+(?=\d)/, "") })}
                placeholder="0"
                style={{ fontSize: "20px", fontWeight: 700 }}
              />
            </label>
          </div>

          {/* ── Keypad (mobile only) ───────────────────────── */}
          <div className="keypad">
            {keypadValues.map((value) => (
              <button
                className="keypad__key"
                key={value}
                onClick={() => appendAmount(value)}
                type="button"
              >
                {value === "del" ? (
                  <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>backspace</span>
                ) : (
                  value
                )}
              </button>
            ))}
          </div>

          {/* ── Required fields ────────────────────────────── */}
          <div className="card form-stack">
            {(mode === "INCOME" || mode === "EXPENSE") ? (
              <label className="field">
                <span className="field__label">
                  口座 <span style={{ color: "var(--coral)", fontSize: "11px" }}>必須</span>
                </span>
                <select
                  value={form.accountId}
                  onChange={(event) => setForm({ ...form, accountId: event.target.value })}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {(mode === "SAVING" || mode === "TRANSFER") ? (
              <div className="form-grid">
                <label className="field">
                  <span className="field__label">
                    {mode === "SAVING" ? "元口座" : "移動元"} <span style={{ color: "var(--coral)", fontSize: "11px" }}>必須</span>
                  </span>
                  <select
                    value={form.fromAccountId}
                    onChange={(event) => setForm({ ...form, fromAccountId: event.target.value })}
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">
                    {mode === "SAVING" ? "着地口座" : "移動先"} <span style={{ color: "var(--coral)", fontSize: "11px" }}>必須</span>
                  </span>
                  <select
                    value={form.toAccountId}
                    onChange={(event) => setForm({ ...form, toAccountId: event.target.value })}
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
                {mode === "SAVING" ? (
                  <label className="field">
                    <span className="field__label">目標</span>
                    <select
                      value={form.goalId}
                      onChange={(event) => setForm({ ...form, goalId: event.target.value })}
                    >
                      <option value="">選択しない</option>
                      {goals.map((goal) => (
                        <option key={goal.id} value={goal.id}>{goal.title}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}

            <label className="field">
              <span className="field__label">
                取引先 <span style={{ color: "var(--coral)", fontSize: "11px" }}>必須</span>
              </span>
              <input
                value={form.payee}
                onChange={(event) => setForm({ ...form, payee: event.target.value })}
                placeholder="店名・取引先名"
              />
            </label>

            <DateTimeField
              label="日時"
              onChange={(next) => setForm({ ...form, datetime: next })}
              required
              value={form.datetime}
            />
          </div>

          {/* ── Category chips ──────────────────────────────── */}
          {(mode === "INCOME" || mode === "EXPENSE") && filteredCategories.length > 0 ? (
            <div>
              <p className="field__label" style={{ marginBottom: "var(--s2)" }}>カテゴリ</p>
              <div className="chip-group">
                <button
                  className={`chip ${form.categoryId === "" ? "on" : ""}`}
                  onClick={() => setForm({ ...form, categoryId: "" })}
                  type="button"
                >
                  なし
                </button>
                {filteredCategories.map((category) => (
                  <button
                    className={`chip ${form.categoryId === category.id ? "on" : ""}`}
                    key={category.id}
                    onClick={() => setForm({ ...form, categoryId: category.id })}
                    type="button"
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Emotion chips (collapsible) ─────────────────── */}
          {(mode === "INCOME" || mode === "EXPENSE") ? (
            <div>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setShowEmotions((prev) => !prev)}
                type="button"
                style={{ fontSize: "12px", color: "var(--text-2)", padding: "0", marginBottom: showEmotions ? "var(--s2)" : 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                  {showEmotions ? "expand_less" : "expand_more"}
                </span>
                気持ちを記録する（任意）
                {form.emotions.length > 0 ? (
                  <span style={{ marginLeft: "4px", color: "var(--amber)", fontWeight: 700 }}>
                    · {form.emotions.length}件選択中
                  </span>
                ) : null}
              </button>
              {showEmotions ? (
                <div className="chip-group">
                  {EMOTIONS.map((em) => (
                    <button
                      className={`chip ${form.emotions.includes(em) ? "on" : ""}`}
                      key={em}
                      onClick={() => toggleEmotion(em)}
                      type="button"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── Save button ────────────────────────────────── */}
          <button
            className="btn btn--fill btn--lg btn--block"
            disabled={!isValid()}
            onClick={() => void submitRecord()}
            style={{ background: cfg.color, borderColor: cfg.color }}
            type="button"
          >
            {cfg.label}を保存する
          </button>

          {error ? <p className="err-msg">{error}</p> : null}
        </>
      ) : null}
    </AppLayout>
  );
}
