# 貯めログ

招待制の家計・貯金支援アプリです。記録、口座管理、目標管理、衝動買い保留、AI相談、管理者設定を 1 つのリポジトリで扱います。

フロントは React + Vite、API は Hono、DB は PostgreSQL + Prisma です。

## 主な機能

- 初回セットアップ
- 招待制ユーザー登録とログイン
- 収入、支出、貯金、口座移動の記録
- 口座、カテゴリ、貯金目標の管理
- 進捗レポートと AI レポート
- 衝動買い保留リスト
- 通知、Web Push、VPN / ブロック設定
- 管理者向けの招待、OpenAI キー、VPN、ユーザー管理

## 起動

```bash
npm install
npm run db:generate
npm run dev
```

必要な環境変数と要件定義は [app_about/REQUIREMENTS.md](./app_about/REQUIREMENTS.md) にまとめています。
