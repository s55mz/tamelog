import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { EmptyState } from "../components/ui";
import { apiRequest } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type WaitingItem = { id: string; name: string; price: number; message: string | null; canDecide: boolean };
type HistoryItem = { id: string; name: string; price: number; message: string | null; status: string; decisionAt: string | null };

type ImpulsePageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

const statusLabel: Record<string, string> = { BOUGHT: "購入", SKIPPED: "見送り" };

export function ImpulsePage({ user, onLogout }: ImpulsePageProps) {
  const token = getAuthToken();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [waiting, setWaiting] = useState<WaitingItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [formOpen, setFormOpen] = useState(false);

  const loadItems = async () => {
    if (!token) return;
    const data = await apiRequest<{ waiting: WaitingItem[]; history: HistoryItem[] }>("/api/impulse-items", { token });
    setWaiting(data.waiting);
    setHistory(data.history);
  };

  useEffect(() => { void loadItems(); }, [token]);

  const createItem = async () => {
    if (!token) return;
    await apiRequest("/api/impulse-items", {
      method: "POST", token,
      body: { name, price: Number(price), message: message || null }
    });
    setName(""); setPrice(""); setMessage(""); setFormOpen(false);
    await loadItems();
  };

  const decideItem = async (id: string, status: "BOUGHT" | "SKIPPED") => {
    if (!token) return;
    await apiRequest(`/api/impulse-items/${id}`, { method: "PUT", token, body: { status } });
    await loadItems();
  };

  return (
    <AppLayout
      onLogout={onLogout}
      subtitle="衝動買いを一度止めて、時間を置いて判断するためのリストです。"
      title="保留リスト"
      user={user}
    >
      {/* ── Add form ───────────────────────────────────── */}
      <div>
        <div className="row row--spread">
          <p className="eyebrow">欲しいものを 24 時間保留する</p>
          <button className="btn btn--fill btn--sm" onClick={() => setFormOpen(!formOpen)} type="button">
            <span className="material-symbols-outlined">add</span>
            追加
          </button>
        </div>

        {formOpen ? (
          <div className="card form-stack">
            <div className="form-grid">
              <label className="field">
                <span className="field__label">商品名</span>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">価格</span>
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
              </label>
              <label className="field field--wide">
                <span className="field__label">メモ</span>
                <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="本当に必要？など" />
              </label>
            </div>
            <div className="btn-row">
              <button className="btn btn--fill" onClick={() => void createItem()} type="button">保留する</button>
              <button className="btn btn--out" onClick={() => setFormOpen(false)} type="button">キャンセル</button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Waiting list ───────────────────────────────── */}
      <div>
        <p className="eyebrow">待機中</p>
        {waiting.length ? (
          <div className="form-stack">
            {waiting.map((item) => (
              <div className="card" key={item.id}>
                <div className="row row--spread">
                  <div>
                    <p className="entry__title">{item.name}</p>
                    <p className="entry__amount entry__amount--positive">{formatCurrency(item.price)}</p>
                    {item.message ? <p className="entry__sub">{item.message}</p> : null}
                  </div>
                  {item.canDecide ? (
                    <span className="badge badge--in">判定OK</span>
                  ) : (
                    <span className="badge badge--move">冷却中</span>
                  )}
                </div>
                {item.canDecide ? (
                  <div className="btn-row">
                    <button className="btn btn--del btn--sm" onClick={() => void decideItem(item.id, "BOUGHT")} type="button">買った</button>
                    <button className="btn btn--out btn--sm" onClick={() => void decideItem(item.id, "SKIPPED")} type="button">見送る</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>待機中のアイテムはありません。</EmptyState>
        )}
      </div>

      {/* ── History ────────────────────────────────────── */}
      {history.length > 0 ? (
        <div>
          <p className="eyebrow">履歴</p>
          <div className="entry-list">
            {history.map((item) => (
              <div className="entry" key={item.id}>
                <div className="entry__body">
                  <p className="entry__title">{item.name}</p>
                </div>
                <span className="entry__amount">{formatCurrency(item.price)}</span>
                <span className={`badge ${item.status === "BOUGHT" ? "badge--out" : "badge--in"}`}>
                  {statusLabel[item.status] ?? item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
