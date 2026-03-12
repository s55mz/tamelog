# Phase 0 記録

更新日: 2026-03-12

## ステータス

- 完了

## 目的

- フロント、API、DB 基盤を同一リポジトリで起動できる状態を作る

## やったこと

- ルートの npm workspaces を追加
- `client` と `server` の 2 パッケージ構成を作成
- ルートに共通 `package.json` を作成
- ルートに `.gitignore` を追加
- ルートに `.env.example` を追加
- `prisma/schema.prisma` を追加
- `client` を `Vite + React + TypeScript` で初期化
- `server` を `Node.js + Hono + TypeScript` で初期化
- フロントの最小トップ画面を作成
- API の最小エンドポイントとして `/api/health` を追加
- API の仮エンドポイントとして `/api/setup/status` を追加
- `npm install` を実行
- `npm run typecheck` を通した
- `npm run build` を通した
- ローカル起動で `/api/health` の応答を確認した

## 追加した主なファイル

- `package.json`
- `.gitignore`
- `.env.example`
- `prisma/schema.prisma`
- `client/package.json`
- `client/vite.config.ts`
- `client/src/App.tsx`
- `client/src/main.tsx`
- `client/src/styles.css`
- `server/package.json`
- `server/src/index.ts`

## 確認結果

- フロントの本番ビルドが作成できる
- サーバーの本番ビルドが作成できる
- API のヘルスチェックが返る

## 次フェーズへの引き継ぎ

- Phase 1 で `User`, `Invitation`, `SystemConfig` を実装する
- Phase 1 でセットアップ API と認証 API を実装する
- Phase 1 で `SetupWizard`, `LoginPage`, `RegisterPage` を実装する
