# 貯めログ 開発計画

更新日: 2026-03-12

この文書は、`app_about/frame.md` と `app_about/REQUIREMENTS.md` を前提にした実装計画です。
MVP を先に完成させ、その後に AI と通知を拡張します。

## 1. 開発の前提

- 画面仕様の正本は `app_about/frame.md`
- API、DB、業務ルールの正本は `app_about/REQUIREMENTS.md`
- v1 は日本国内利用、JST 固定
- フロントと API は同一リポジトリで管理
- 実装優先は「使える最小構成を先に通す」

## 2. 開発ゴール

### 2.1 MVP ゴール

以下が通れば MVP 完了とする。

- 初回セットアップができる
- 管理者ログインができる
- 招待発行から一般ユーザー登録まで通る
- 一般ユーザー初期設定が完了できる
- 口座、記録、家計簿、目標の基本操作ができる
- ホームと進捗で現在の状況が確認できる
- 管理者が招待管理を行える

### 2.2 次段階ゴール

- 衝動買いチェック
- AI 相談
- AI 分析
- メール通知

## 3. 開発フェーズ

### Phase 0. 基盤準備

目的:

- 実装を始められる土台を作る

作業:

- モノレポ構成または同一リポジトリ内の `client` / `server` 構成を確定
- React + Vite + TypeScript のフロント初期化
- Hono + TypeScript の API 初期化
- Prisma + PostgreSQL 接続設定
- ESLint / Prettier 相当の整備
- `.env.example` の用意
- 開発起動手順の固定

成果物:

- ローカルでフロントと API が起動する
- Prisma が DB 接続できる
- ベースルーティングとヘルスチェックがある

完了条件:

- `GET /api/setup/status` の最低限のモックまたは実装が返る
- 画面側で起動確認できる

### Phase 1. DB と認証基盤

目的:

- ユーザー、招待、認証の基本動線を通す

作業:

- Prisma schema 作成
- 初回 migration 作成
- `User`, `Invitation`, `SystemConfig` の実装
- パスワードハッシュ処理
- JWT 発行、検証 middleware
- ロール判定 middleware

対象 API:

- `GET /api/setup/status`
- `POST /api/setup/test-db`
- `POST /api/setup/install`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/register`

対象画面:

- `SetupWizard`
- `LoginPage`
- `RegisterPage`

完了条件:

- 初回セットアップから管理者作成まで通る
- 管理者ログインができる
- 招待経由の登録ができる

### Phase 2. 一般ユーザー初期設定

目的:

- ログイン後に利用開始できる状態を作る

作業:

- `UserSetupWizard` 実装
- 給料日更新
- 初期口座作成
- 初期目標作成
- デフォルトカテゴリ複製

対象 API:

- `GET /api/users/me`
- `PUT /api/users/me`
- `POST /api/users/me/complete-setup`
- `GET /api/categories`
- `POST /api/accounts`
- `POST /api/goals`

完了条件:

- 初期設定完了フラグが管理できる
- スキップ可の項目を含めて導線が成立する

### Phase 3. 口座と記録の中核機能

目的:

- 家計データが正しく蓄積される状態にする

作業:

- `Account` CRUD
- `DailyRecord` CRUD
- `AccountTransfer` 作成と履歴
- 残高更新トランザクション
- `periodId` 算出
- 記録編集時の差分打ち消し処理

対象 API:

- `GET /api/accounts`
- `POST /api/accounts`
- `PUT /api/accounts/:id`
- `DELETE /api/accounts/:id`
- `GET /api/records`
- `POST /api/records`
- `PUT /api/records/:id`
- `DELETE /api/records/:id`
- `GET /api/account-transfers`
- `POST /api/account-transfers`

対象画面:

- `/record`
- `/accounts`
- `/ledger` の基礎データ部分

完了条件:

- 収入、支出、貯金、移動を保存できる
- 口座残高が一貫する
- 記録一覧と家計簿一覧が表示できる

### Phase 4. 目標とホーム体験

目的:

- このアプリ固有の「貯める体験」を成立させる

作業:

- `Goal` CRUD
- `GoalRecord` 集計
- 進捗率計算
- 注目目標ロジック
- ホーム画面実装
- 進捗画像のフォールバック実装

対象 API:

- `GET /api/goals`
- `POST /api/goals`
- `PUT /api/goals/:id`
- `DELETE /api/goals/:id`
- `GET /api/goals/:id/records`
- `GET /api/users/me/stats`

対象画面:

- `/goals`
- `/`
- `/progress` の概要タブ基礎

完了条件:

- 目標一覧と詳細が見られる
- ホームで注目目標と進捗が見える
- 進捗率が `GoalRecord` 集計で表示される

### Phase 5. 管理者機能と MVP 完了

目的:

- 招待制運用と基本管理を成立させる

作業:

- 招待管理画面
- 管理者画面
- システム設定の保存
- ユーザー一覧、停止処理
- システム情報表示

対象 API:

- `GET /api/admin/users`
- `POST /api/admin/invitations`
- `GET /api/admin/invitations`
- `POST /api/admin/invitations/:id/revoke`
- `POST /api/admin/users/:id/suspend`
- `GET /api/admin/config`
- `PUT /api/admin/config`
- `GET /api/admin/system-info`

対象画面:

- `/invite`
- `/admin`

完了条件:

- 招待の作成、失効、状態確認ができる
- 管理者がユーザー状態と設定を確認できる

### Phase 6. 拡張機能

目的:

- MVP 後の差別化機能を追加する

作業:

- `ImpulseItem` CRUD
- AI 相談
- AI 分析保存
- SMTP 設定
- テストメール送信
- 進捗節目通知、定期通知

対象 API:

- `GET /api/impulse-items`
- `POST /api/impulse-items`
- `PUT /api/impulse-items/:id`
- `DELETE /api/impulse-items/:id`
- `POST /api/chat`
- `GET /api/analysis`
- `POST /api/analysis/generate`
- `POST /api/admin/test-email`

完了条件:

- OpenAI 未設定時のフォールバックを含め動作する
- SMTP 未設定時の案内も実装されている

## 4. 推奨実装順

1. Phase 0 基盤準備
2. Phase 1 DB と認証基盤
3. Phase 2 一般ユーザー初期設定
4. Phase 3 口座と記録の中核機能
5. Phase 4 目標とホーム体験
6. Phase 5 管理者機能
7. MVP 動作確認
8. Phase 6 拡張機能

## 5. 各フェーズのレビュー観点

### 共通

- `frame.md` と画面が一致しているか
- `REQUIREMENTS.md` と API / DB が一致しているか
- `userId` 境界を守れているか
- JST 前提が崩れていないか

### 記録系

- 残高更新がトランザクションで守られているか
- 編集時に旧記録の影響を正しく打ち消しているか
- `periodId` が給料日基準で固定されるか

### 権限系

- 管理者 API がロール確認されているか
- 一般ユーザーから管理画面が見えないか

### AI / 通知系

- 未設定時の利用不可表示があるか
- データ送信範囲が仕様に収まっているか

## 6. テスト計画

### 6.1 最低限の自動テスト

- 認証 API テスト
- セットアップ API テスト
- 記録作成、編集、削除時の残高更新テスト
- `periodId` 算出テスト
- 招待の有効期限と失効テスト
- 権限テスト

### 6.2 画面確認

- セットアップ導線
- ログイン、登録導線
- 初期設定導線
- 記録追加の最短操作
- 口座移動
- 目標作成とホーム反映
- 管理者招待作成

## 7. マイルストーン

### Milestone 1

- Phase 0-1 完了
- 初回セットアップとログインが成立

### Milestone 2

- Phase 2-3 完了
- 一般ユーザーが記録を継続利用できる

### Milestone 3

- Phase 4-5 完了
- MVP 全体が利用可能

### Milestone 4

- Phase 6 完了
- 差別化機能を含む v1 完成
