# デプロイ / 実行メモ

更新日: 2026-03-12

この文書は、ローカル開発と本番運用の方針を最小限にまとめたものです。
具体的な実装仕様は `REQUIREMENTS.md` を参照します。

## 1. 対象構成

- フロントエンド: Vite ビルド成果物
- API: Node.js + Hono
- DB: PostgreSQL
- 公開: Nginx から静的配信 + `/api` を API へリバースプロキシ

## 2. ローカル開発

### 2.1 前提

- Node.js 18 以上
- PostgreSQL 14 以上
- npm

### 2.2 開発時ポート

- フロント: `5173`
- API: `3000`
- PostgreSQL: `5432`

### 2.3 推奨環境変数

バックエンド:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/tame_log_dev"
PORT=3000
JWT_SECRET="replace-this"
NODE_ENV="development"
ALLOWED_ORIGINS="http://localhost:5173"
OPENAI_API_KEY=""
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
```

フロント:

```env
VITE_API_URL="http://localhost:3000"
```

ルール:

- 秘密情報の実値は Markdown に書かない
- 環境変数名はここに書いたものへ統一する

### 2.4 初期セットアップ

```bash
npm install
npx prisma migrate dev
npm run dev
```

## 3. 本番方針

### 3.1 推奨構成

- Linux サーバー
- Node.js 18 以上
- PostgreSQL 14 以上
- Nginx
- PM2 などのプロセス管理

### 3.2 Raspberry Pi を使う場合

- 低メモリ機ではフロントの本番ビルドを別マシンで行う
- 本番機では API 実行と DB 運用を主に担当させる
- swap 追加やビルド時間増加を前提にする

### 3.3 セキュリティ方針

- SSH 接続情報やパスワードを文書に書かない
- `JWT_SECRET` は全環境で必須
- 本番の `.env` は Git 管理しない
- DB 初期化のような危険操作は本番では管理画面に置かない

## 4. Nginx 例

```nginx
server {
  listen 80;
  server_name example.com;

  root /var/www/tamelog/dist;
  index index.html;

  location / {
    try_files $uri /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 5. よくある確認項目

- API に接続できない
  - `VITE_API_URL`
  - CORS
  - API ポート
- DB に接続できない
  - `DATABASE_URL`
  - PostgreSQL 起動状態
- ログインできない
  - `JWT_SECRET`
  - 時刻ずれ
- メールが送れない
  - SMTP 設定
  - 送信元アドレス

## 6. 運用メモ

- バックアップ手順は別途追加予定
- 監視方法は本番構成確定後に追加する
- Cloudflare Tunnel を使う場合でも、公開前にローカル / LAN 内で動作確認を済ませる
