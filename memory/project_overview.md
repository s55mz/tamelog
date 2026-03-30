---
name: Project Overview
description: 貯めログ：招待制家計・貯金支援アプリの全体像（サーバー構成含む）
type: project
---

# 貯めログ (TameLog) — プロジェクト概要

## アプリ概要
招待制の家計・貯金管理PWA。ダークテーマ「夜の帳簿」。
URL: https://finance-pro.space

## アーキテクチャ
- **フロントエンド**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **バックエンド**: Hono (Node.js) on port 3001
- **DB**: PostgreSQL 16（ローカル、ユーザー `tamelog` / DB `tamelogdb`）
- **Webサーバー**: Nginx（リバースプロキシ + SPA配信）
- **ビルドシステム**: npm workspaces（`client/` + `server/`）
- **ORM**: Prisma 6

## サーバー情報
- IP: 160.251.203.86
- OS: Ubuntu (Linux 6.8.0-90)
- アプリ配置: `/var/www/tamelog/`
  - `/var/www/tamelog/server/` — APIサーバー（Node dist/index.js）
  - `/var/www/tamelog/frontend/` — ビルド済みフロントエンド
  - `/var/www/tamelog/logs/` — api.log / api-error.log
- サービスユーザー: `tamelog` (uid=999)
- systemdサービス: `tamelog-api.service`（自動起動・Restart=always）

## APIルート一覧（/api/...）
`setup`, `auth`, `users`, `dashboard`, `admin`, `chat`, `analysis`, `ocr`,
`impulse-items`, `accounts`, `records`, `account-transfers`, `goals`,
`categories`, `csv`, `push`, `vpn`, `candidates`, `ingest`, `mailbox`,
`webmail`, `notifications`

## クライアントページ
Dashboard, Inbox, Record, Goals, Ledger, Accounts, Progress, Impulse, Chat,
Settings, Invite(admin), Admin(admin), Mailbox, Notifications, More, WebMail,
Login, Register, Setup, UserSetup, NotificationPrompt, BlockedPage

## DB主要モデル
User, Invitation, SystemConfig, Account, Category, Goal, DailyRecord,
GoalRecord, AccountTransfer, ImpulseItem, AIAnalysis, UserPreference,
UserBlockSetting, ServiceCategory, ServiceDomain, UserBlockSchedule,
VpnClient, PushSubscription, InboundMailbox, InboundMessage,
UserMailScript, ActionCandidate, EmailVerificationCode,
AppNotification, CandidateResolutionLog, VpnDnsLog

## 特殊機能：VPN + サイトブロック
- WireGuard系VPN（10.10.10.x サブネット）でクライアントをサーバー経由にする
- `mitmproxy`（transparent mode port 8080/4443）でHTTP(S)トラフィックを傍受
- `/opt/mitm-filter.py` がVPN IPに対して「ブロック対象ドメイン」を API から取得し HTTP 451 を返す
- DNS フィルタ (`/opt/tamelog-dns.py`) も稼働中
- ユーザーはスケジュールでECサイト等をブロック可能（衝動買い防止）
- ブロック時にPush通知を送信

## メール自動記帳
- `inbox.finance-pro.space` 宛のメールをPostfix経由で受信
- `/api/ingest` でAIが金額・店舗を抽出し自動でDailyRecord作成
- 処理結果をメールで本人に通知
- UserMailScript でユーザーがカスタムJS解析スクリプトを書ける

## 現在のサーバー状態（2026-03-30時点）
- APIサーバー正常稼働中（PID 95367、Mar29起動）
- Nginx正常稼働中
- PostgreSQL 16正常稼働中
- エラーログ: VPN helper の hostname resolution 失敗あり（`sudo: unable to resolve host vm-25b69893-e6`）
  → `/etc/ipsec.d/eap-users.secrets` にアクセスできない問題
- Cron: 毎日03:00 DNS分類、毎週土曜21:00 週次通知

**Why:** サーバー構成とアプリ全体を把握するため2026-03-30に調査
**How to apply:** デプロイ・修正時はssh key `/Users/soramizukuki/projects/tamelog_renewal/server.pem` で root@160.251.203.86 に接続
