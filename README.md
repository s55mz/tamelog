# 貯めログ

招待制の家計・貯金支援アプリです。記録、口座管理、目標管理、通知、AI相談、管理者機能を 1 つのリポジトリで管理しています。

運用まわりのメモは `docs/` にまとめます。サーバー再構築の整理は [docs/server-rebuild.md](./docs/server-rebuild.md) を参照してください。

## 主な機能

- 初回セットアップ
- 招待制の登録 / ログイン
- 収入、支出、貯金、口座移動の記録
- 口座、カテゴリ、貯金目標の管理
- レポート、進捗確認、AI相談
- 衝動買い保留リスト
- 通知、Web Push、VPN、メール取り込み
- 管理者向けのユーザー管理、招待管理、OpenAI キー設定

## 技術スタック

- Frontend: React 19 + Vite + TypeScript
- Backend: Hono + TypeScript
- Database: PostgreSQL + Prisma

## 起動

```bash
npm install
npm run db:generate
npm run dev
```

開発時の想定 URL:

- Client: `http://localhost:5173`
- Server: `http://localhost:3000`

## 環境変数

`.env.example` をベースに `.env` を用意します。

```env
DATABASE_URL="postgresql://..."
PORT=3000
JWT_SECRET="replace-this"
ALLOWED_ORIGINS="http://localhost:5173"
OPENAI_API_KEY=""
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
VPN_HELPER_COMMAND=""
VITE_API_URL="http://localhost:3000"
```

## ディレクトリ構成

```text
.
├── client/              # React + Vite フロントエンド
│   ├── src/
│   │   ├── pages/       # 画面単位のページ
│   │   ├── components/  # 共通 UI
│   │   ├── hooks/       # React hooks
│   │   └── lib/         # API, format, storage などの共通処理
│   └── public/          # クライアント静的ファイル
├── server/              # Hono API サーバー
│   ├── src/
│   │   ├── routes/      # API ルート
│   │   ├── middleware/  # 認証、権限制御
│   │   └── lib/         # DB, mail, push, goals などの共通処理
│   └── dist/            # サーバービルド成果物
├── prisma/              # Prisma schema
├── img/                 # PWA 用画像、目標イラスト、manifest, service worker
├── develop/             # 開発用データ
├── docs/                # 運用・再構築ドキュメント
├── package.json         # workspace ルート
└── .env.example         # 環境変数サンプル
```

## 主要ページ

- `DashboardPage`: ホーム、残高、最近の記録、未整理候補
- `RecordPage`: 記録入力
- `LedgerPage`: 家計簿一覧
- `GoalsPage`: 貯金目標管理
- `ProgressPage`: 進捗確認
- `ChatPage`: AI相談
- `AdminPage`: 管理者設定

## 主要 API

- `/api/setup`
- `/api/auth`
- `/api/dashboard`
- `/api/records`
- `/api/accounts`
- `/api/goals`
- `/api/analysis`
- `/api/chat`
- `/api/admin`
- `/api/push`
- `/api/vpn`
- `/api/mailbox`
- `/api/webmail`

## よく使うコマンド

```bash
npm run dev
npm run build
npm run typecheck
npm run db:generate
npm run db:push
npm run db:migrate
```

## VPN 運用メモ

`/api/vpn/devices` は strongSwan の EAP シークレット更新が必要です。API プロセスが `/etc/ipsec.d/eap-users.secrets` を直接更新できない本番では、root 権限で実行される helper を別途配置し、`VPN_HELPER_COMMAND` にその実行パスを設定します。

リポジトリには helper のたたき台として [server/scripts/vpn-helper.js](/Users/soramizukuki/projects/tamelog_renewal/server/scripts/vpn-helper.js) を置いています。例えば root で `/usr/local/bin/tamelog-vpn-helper` に配置して実行権限を付け、API からその wrapper を呼ぶ構成を前提にしています。
