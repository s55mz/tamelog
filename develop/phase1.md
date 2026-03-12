# Phase 1 記録

更新日: 2026-03-12

## ステータス

- 完了

## 目的

- 初回セットアップ、認証、招待登録の基盤を実装する

## やったこと

- Prisma schema に `User`, `Invitation`, `SystemConfig` を追加
- `UserRole`, `UserStatus`, `InvitationStatus` enum を追加
- Prisma Client 生成と `db push` を実行
- `bcryptjs` を使ったパスワードハッシュ処理を追加
- `jsonwebtoken` を使った JWT 発行と検証を追加
- 認証 middleware を追加
- DB 接続共通処理と Prisma Client 共通化を追加
- セットアップ API を実装
- 認証 API を実装
- フロントに `react-router-dom` を導入
- `SetupPage` を実装
- `LoginPage` を実装
- `RegisterPage` を実装
- ログイン後の確認用として `DashboardPage` を実装
- 起動時にセットアップ状態とログイン状態を読む bootstrap 処理を追加
- `.env` を作成してローカル開発用設定を配置

## 追加した DB モデル

- `User`
- `Invitation`
- `SystemConfig`

## 追加した enum

- `UserRole`
- `UserStatus`
- `InvitationStatus`

## 実装した API

- `GET /api/setup/status`
- `POST /api/setup/test-db`
- `POST /api/setup/install`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/logout`

## 実装した画面

- `SetupPage`
- `LoginPage`
- `RegisterPage`
- `DashboardPage`

## 導入したライブラリ

- `bcryptjs`
- `jsonwebtoken`
- `zod`
- `react-router-dom`

## 確認結果

- `npm install` 成功
- `npm run typecheck` 成功
- `npm run db:generate` 成功
- `npm run db:push` 成功
- `GET /api/setup/status` が `installed: true`, `dbReady: true` を返すことを確認
- `POST /api/setup/test-db` が成功を返すことを確認
- `POST /api/auth/login` の正常系を確認
- `GET /api/auth/me` の正常系を確認
- テスト用招待データを投入して `POST /api/auth/register` の正常系を確認

## 残課題

- 招待発行 API と招待管理画面は Phase 5 範囲
- `UserSetupWizard` と `users/me` 系 API は Phase 2 で実装する
- 現在の確認は API 疎通中心で、画面の E2E 確認は未実施
