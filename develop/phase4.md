# Phase 4 記録

更新日: 2026-03-12

## ステータス

- 完了

## 目的

- 目標、ホーム、進捗の体験を実装する

## 計画

- `GET /api/users/me/stats` を実装する
- `GET /api/dashboard` を実装する
- 目標進捗の集計と注目目標ロジックを共通化する
- ホーム `/` を API 連動の画面に置き換える
- 進捗 `/progress` の最小画面を追加する
- ダッシュボードと進捗の正常系を確認する

## 実行

- `GET /api/users/me/stats` を実装
- `GET /api/dashboard` を実装
- 目標進捗の計算と注目目標スコア計算を `lib/goals.ts` に共通化
- 既存の `DashboardPage` をホーム画面向けの内容へ置き換え
- `ProgressPage` を追加して `/progress` ルートを実装
- ダッシュボードから `/progress` への導線を追加
- `npm run typecheck` と `npm run build` を実行
- `dashboard` と `users/me/stats` の正常系を API で確認

## 結果

- やったこと:
  - ホーム専用 API を追加
  - 今期集計 API を追加
  - 注目目標と進捗表示の共通計算を追加
  - ホーム画面と進捗画面の最小 UI を追加
- 確認結果:
  - `npm run typecheck` 成功
  - `npm run build` 成功
  - `GET /api/dashboard` 正常系確認
  - `GET /api/users/me/stats` 正常系確認
- 残課題:
  - 注目目標スコアは簡易実装で、厳密な優先度補正や同点処理は未調整
  - 進捗画面の「推移」タブ相当は未実装
  - AI 分析タブは案内表示のみ
  - 進捗画像アセットの実ファイルは未配置
