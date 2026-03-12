import { useEffect, useState } from "react";

import { apiRequest } from "../lib/api";
import { getAuthToken } from "../lib/storage";

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

export function ImpulsePage() {
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
    <main className="screen-shell">
      <section className="panel panel-wide">
        <span className="eyebrow">Impulse</span>
        <h1>衝動買いチェック</h1>

        <div className="stack">
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

        <div className="stack">
          <h2 className="section-subtitle">待機中</h2>
          {waiting.map((item) => (
            <article className="subpanel" key={item.id}>
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

        <div className="stack">
          <h2 className="section-subtitle">履歴</h2>
          {history.map((item) => (
            <article className="subpanel" key={item.id}>
              <strong>{item.name}</strong>
              <p>{item.price} 円 / {item.status}</p>
              {item.message && <p>{item.message}</p>}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
