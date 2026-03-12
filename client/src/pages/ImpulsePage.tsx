import { useEffect, useState } from "react";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";
import type { AppUser } from "../lib/types";

type WaitingItem = {
  id: string;
  name: string;
  price: number;
  message: string | null;
  canDecide: boolean;
};

type HistoryItem = {
  id: string;
  name: string;
  price: number;
  message: string | null;
  status: string;
  decisionAt: string | null;
};

type ImpulsePageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function ImpulsePage({ user, onLogout }: ImpulsePageProps) {
  const token = getAuthToken();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [waiting, setWaiting] = useState<WaitingItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadItems = async () => {
    if (!token) {
      return;
    }

    const data = await apiRequest<{ waiting: WaitingItem[]; history: HistoryItem[] }>("/api/impulse-items", { token });
    setWaiting(data.waiting);
    setHistory(data.history);
  };

  useEffect(() => {
    void loadItems();
  }, [token]);

  const createItem = async () => {
    if (!token) {
      return;
    }

    await apiRequest("/api/impulse-items", {
      method: "POST",
      token,
      body: {
        name,
        price: Number(price),
        message: message || null
      }
    });

    setName("");
    setPrice("");
    setMessage("");
    await loadItems();
  };

  const decideItem = async (id: string, status: "BOUGHT" | "SKIPPED") => {
    if (!token) {
      return;
    }

    await apiRequest(`/api/impulse-items/${id}`, {
      method: "PUT",
      token,
      body: { status }
    });
    await loadItems();
  };

  return (
    <AppLayout onLogout={onLogout} subtitle="買う前に 24 時間おいて判断するための待機スペースです。" title="衝動買いチェック" user={user}>
      <section className="content-section">
        <article className="surface-card form-card">
          <p className="section-label">New Item</p>
          <div className="stack compact">
          <label className="field">
            <span>商品名</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            <span>価格</span>
            <input type="number" value={price} onChange={(event) => setPrice(event.target.value)} />
          </label>
          <label className="field">
            <span>ひとことメモ</span>
            <input value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <button className="button" onClick={createItem} type="button">
            登録する
          </button>
          </div>
        </article>
      </section>

      <section className="content-section">
        <div className="section-heading-row"><div><p className="section-label">Waiting</p><h2 className="section-title">待機中</h2></div></div>
        <div className="goal-list">
          {waiting.map((item) => (
            <article className="goal-row-card" key={item.id}>
              <strong>{item.name}</strong>
              <p>{item.price} 円</p>
              {item.message && <p>{item.message}</p>}
              {item.canDecide ? (
                <div className="button-row">
                  <button className="button" onClick={() => decideItem(item.id, "BOUGHT")} type="button">
                    買った
                  </button>
                  <button className="button button-secondary" onClick={() => decideItem(item.id, "SKIPPED")} type="button">
                    見送った
                  </button>
                </div>
              ) : (
                <p>24 時間待機後に判定できます。</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading-row"><div><p className="section-label">History</p><h2 className="section-title">履歴</h2></div></div>
        <div className="goal-list">
          {history.map((item) => (
            <article className="goal-row-card" key={item.id}>
              <strong>{item.name}</strong>
              <p>{item.price} 円 / {item.status}</p>
              {item.message && <p>{item.message}</p>}
            </article>
          ))}
        </div>
      </section>
    </AppLayout>
  );
}
