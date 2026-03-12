# Phase 2 記録

更新日: 2026-03-12

## ステータス

- 完了

## 目的

- 一般ユーザー初期設定を実装する

## やったこと

- Prisma schema に `AccountType`, `CategoryType`, `GoalVisualCategory`, `GoalVisualTheme` を追加
- Prisma schema に `Account`, `Category`, `Goal` モデルを追加
- `users`, `accounts`, `goals`, `categories` の API ルートを追加
- `GET /api/users/me` を初期カテゴリ自動補完込みで実装
- `PUT /api/users/me` をプロフィール更新として実装
- `POST /api/users/me/complete-setup` を実装
- `GET /api/accounts`, `POST /api/accounts` を実装
- `GET /api/goals`, `POST /api/goals` を実装
- `GET /api/categories` を実装
- デフォルトカテゴリ投入の共通処理を追加
- フロントに `UserSetupPage` を追加
- ルーティングを更新して `setupCompleted=false` のユーザーを `UserSetupWizard` へ誘導
- 初期設定完了後に通常画面へ戻る導線を追加

## 確認結果

- `npm run db:generate` 成功
- `npm run typecheck` 成功
- `npm run db:push` 成功
- `npm run build` 成功
- 初期設定未完了ユーザーで `POST /api/users/me/complete-setup` の正常系を確認
- 初期設定前の `GET /api/users/me` で `setupCompleted=false` を確認
- 初期設定後の `GET /api/users/me` で `setupCompleted=true` を確認
- `GET /api/accounts` で初期口座が返ることを確認
- `GET /api/goals` で初期目標が返ることを確認
- `GET /api/categories` でデフォルトカテゴリが返ることを確認

## 残課題

- `GET /api/users/me/stats` は未実装
- `PUT /api/accounts/:id`, `DELETE /api/accounts/:id` は未実装
- `PUT /api/goals/:id`, `DELETE /api/goals/:id`, `GET /api/goals/:id/records` は未実装
- カテゴリの追加、編集、削除、リセット API は未実装
- 初期設定画面の E2E 確認は未実施
