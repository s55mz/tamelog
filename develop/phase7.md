# Phase 7 記録

更新日: 2026-03-13

## ステータス

- 完了

## 目的

- Apple HIG を参考に、PC はサイドバー型、SP はネイティブ風ボトムナビ型へ大幅にデザイン刷新する
- メイン機能として目標画面を実装し、ホームから目標体験をつなげる

## 計画

- `apple-ui-report.md` と `frame.md` を基準にレイアウト方針を固める
- PC 用サイドバーと SP 用ボトムナビ / その他メニューを持つ共通レイアウトを実装する
- 全主要画面を共通レイアウトへ載せ替える
- `GoalsPage` を追加し、一覧・追加・編集・削除・詳細の最小操作を実装する
- ホーム画面を新レイアウトに合わせて再設計する
- グローバルスタイルを Apple 風のマットでシンプルな方向に刷新する
- 型チェックとビルドを通し、目標 API と画面の正常系を確認する

## 実行

- `apple-ui-report.md` と `frame.md` を基準に、PC はサイドバー / SP はボトムナビ + その他シートの共通レイアウトを設計
- `AppLayout` を追加して主要画面を共通レイアウトへ載せ替え
- グローバル CSS を Apple 風のマットで落ち着いたダッシュボード調に刷新
- ホーム画面を新レイアウトに合わせて再構成
- `GoalsPage` を追加
- goals API に更新・削除を追加
- `App.tsx` に `/goals` を追加し、各画面へ `user` と `onLogout` を渡す構成へ整理
- `npm run typecheck` と `npm run build` を実行
- goals API の作成・更新・一覧・削除を確認

## 結果

- やったこと:
  - 共通レイアウト `AppLayout` を追加
  - PC は左サイドバー、SP は下部メニュー + その他シートの構成へ変更
  - ホーム、記録、家計簿、口座、進捗、招待、管理者、衝動買い、AI 相談を新レイアウトへ移行
  - `GoalsPage` を追加し、目標の一覧・追加・編集・削除の最小操作を実装
  - goals API に `PUT /api/goals/:id` と `DELETE /api/goals/:id` を追加
- 確認結果:
  - `npm run typecheck` 成功
  - `npm run build` 成功
  - `POST /api/goals` 正常系確認
  - `PUT /api/goals/:id` 正常系確認
  - `GET /api/goals` 正常系確認
  - `DELETE /api/goals/:id` 正常系確認
- 残課題:
  - `GoalsPage` は最小操作中心で、詳細シートや達成演出は未実装
  - 目標の画像カテゴリ推定はまだ fallback 中心
  - 主要画面の手動 UI 確認は未実施
