# Phase 3 記録

更新日: 2026-03-12

## ステータス

- 進行中

## 目的

- 口座、記録、残高更新の中核機能を実装する

## 計画

- `DailyRecord`, `GoalRecord`, `AccountTransfer` を Prisma schema に追加する
- `periodId` 計算と残高反映の共通処理を追加する
- `GET/POST/PUT/DELETE /api/records` を実装する
- `GET/POST /api/account-transfers` を実装する
- `PUT/DELETE /api/accounts/:id` を実装する
- `GET /api/goals/:id/records` を実装する
- フロントに `/record`, `/ledger`, `/accounts` の最小画面を追加する
- API とビルドの正常系を確認する

## 実行

- Prisma schema に `RecordType`, `DailyRecord`, `GoalRecord`, `AccountTransfer` を追加
- `periodId` 計算関数を追加
- 記録の残高反映と所有権確認の共通処理を追加
- `GET/POST/PUT/DELETE /api/records` を実装
- `GET/POST /api/account-transfers` を実装
- `PUT/DELETE /api/accounts/:id` を実装
- `GET /api/goals/:id/records` を実装
- フロントに `/record`, `/ledger`, `/accounts` の最小画面を追加
- ダッシュボードから各画面への導線を追加
- Prisma Client 再生成、型チェック、DB 反映、ビルドを実行
- 記録作成、編集、削除、口座移動、家計簿取得、口座更新、口座削除の正常系を確認

## 結果

- やったこと:
  - 記録系と口座移動系の DB モデルを追加
  - 記録 CRUD と口座移動 API を追加
  - 口座の更新・削除 API を追加
  - 目標積立履歴 API を追加
  - 記録画面、家計簿画面、口座画面の最小 UI を追加
- 確認結果:
  - `npm run db:generate` 成功
  - `npm run typecheck` 成功
  - `npm run db:push` 成功
  - `npm run build` 成功
  - `POST /api/records` の正常系確認
  - `PUT /api/records/:id` の正常系確認
  - `DELETE /api/records/:id` の正常系確認
  - `GET /api/records` の正常系確認
  - `POST /api/account-transfers` の正常系確認
  - `GET /api/account-transfers` の正常系確認
  - `PUT /api/accounts/:id` の正常系確認
  - `DELETE /api/accounts/:id` の正常系確認
  - `GET /api/goals/:id/records` の正常系確認
- 残課題:
  - `RecordPage`、`LedgerPage`、`AccountsPage` は最小 UI で、編集・削除操作までは画面未対応
  - 口座削除の制約確認は API 側で実装済みだが、UI からはまだ触れない
  - 記録編集時の全ケース検証は未実施
  - 家計簿画面の表示整形はまだ簡易版
