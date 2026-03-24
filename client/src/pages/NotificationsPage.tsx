import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AppLayout } from "../components/AppLayout";
import { apiRequest } from "../lib/api";
import { useAutoRefresh } from "../lib/autoRefresh";
import { formatDate } from "../lib/format";
import { getAuthToken } from "../lib/storage";
import { useToast } from "../lib/toast";
import type { AppUser } from "../lib/types";

type AppNotification = {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  isRead: boolean;
  createdAt: string;
};

type NotificationsPageProps = {
  user: AppUser;
  onLogout: () => Promise<void>;
};

export function NotificationsPage({ user, onLogout }: NotificationsPageProps) {
  const token = getAuthToken();
  const toast = useToast();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  async function load() {
    try {
      const res = await apiRequest<{ notifications: AppNotification[]; unreadCount: number }>(
        "/api/notifications",
        { token }
      );
      setNotifications(res.notifications ?? []);
    } catch {
      toast("読み込みに失敗しました", "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useAutoRefresh(load);

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await apiRequest("/api/notifications/read-all", { method: "POST", token });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      toast("更新に失敗しました", "err");
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleClick(notif: AppNotification) {
    // 既読にする
    if (!notif.isRead) {
      await apiRequest(`/api/notifications/${notif.id}/read`, { method: "PATCH", token }).catch(() => {});
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, isRead: true } : n));
    }
    // URLがあればナビゲート
    if (notif.url && notif.url !== "/notifications") {
      navigate(notif.url);
    }
  }

  async function deleteNotif(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await apiRequest(`/api/notifications/${id}`, { method: "DELETE", token }).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <AppLayout onLogout={onLogout} title="お知らせ" user={user}>
      <div className="notif-page">
        <div className="notif-page__bar">
          <p className="notif-page__count">
            {unreadCount > 0 ? (
              <><span className="notif-page__unread-num">{unreadCount}</span> 件の未読</>
            ) : (
              "すべて既読"
            )}
          </p>
          {unreadCount > 0 && (
            <button
              className="btn btn--ghost btn--sm"
              disabled={markingAll}
              onClick={() => void markAllRead()}
              type="button"
            >
              すべて既読にする
            </button>
          )}
        </div>

        {loading && <p className="empty">読み込み中...</p>}

        {!loading && notifications.length === 0 && (
          <div className="empty">
            <span className="material-symbols-outlined">notifications_none</span>
            <p>お知らせはありません</p>
          </div>
        )}

        {!loading && notifications.length > 0 && (
          <div className="notif-list">
            {notifications.map((notif) => (
              <button
                className={`notif-item${notif.isRead ? " notif-item--read" : ""}`}
                key={notif.id}
                onClick={() => void handleClick(notif)}
                type="button"
              >
                <div className="notif-item__dot-wrap">
                  {!notif.isRead && <span className="notif-item__dot" />}
                </div>
                <div className="notif-item__body">
                  <p className="notif-item__title">{notif.title}</p>
                  {notif.body && <p className="notif-item__text">{notif.body}</p>}
                  <p className="notif-item__date">{formatDate(notif.createdAt)}</p>
                </div>
                <button
                  className="notif-item__del"
                  onClick={(e) => void deleteNotif(notif.id, e)}
                  type="button"
                  aria-label="削除"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
