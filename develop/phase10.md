# Phase 10 記録

更新日: 2026-03-13

## ステータス

- 完了

## 目的

- 家計簿記録を「どの口座がどう増減したか」を追えるルールへ寄せる
- 貯金も口座間移動として記録し、目標進捗と両立させる
- 家計簿 / 記録 / 口座管理を DADS 寄りの見た目に調整する

## 計画

- `AccountTransfer` を拡張して、通常移動と貯金移動を区別できるようにする
- 記録 API / 台帳表示 / 統計計算を口座変動ベースへ更新する
- 記録画面で `収入 / 支出 / 貯金 / 移動` を扱えるようにする
- 家計簿と口座管理の UI を DADS 寄りの整理された表現に寄せる
- Prisma 反映、型チェック、ビルド、API 確認を行う

## 実行

- `TransferKind` を追加し、`AccountTransfer` で `TRANSFER / SAVING` を区別できるようにした
- 貯金移動に `goalId` を持たせ、保存時に `GoalRecord` も自動で作成するようにした
- `users/me/stats` `dashboard` `chat` `analysis` の貯金集計に、貯金移動の金額を含めるようにした
- 記録画面を `収入 / 支出 / 貯金 / 移動` の 4 モードへ組み替え、貯金を口座間移動として保存するようにした
- 家計簿一覧で移動系を `移動元 / 移動先` の 2 行へ分解し、口座ごとの増減が追える形にした
- 全体スタイルを DADS 寄りの配色、余白、カード、タイポグラフィへ調整した
- Prisma の生成とスキーマ反映、型チェック、ビルド、ローカル API 疎通確認を行った

## 結果

- やったこと:
  - `prisma/schema.prisma` に `TransferKind`、`AccountTransfer.goalId`、`AccountTransfer.kind`、`GoalRecord.accountTransferId` を追加した
  - `server/src/routes/accountTransfers.ts` で貯金移動の作成、目標進捗反映、削除時の巻き戻しに対応した
  - `server/src/routes/users.ts` `server/src/routes/dashboard.ts` `server/src/routes/ai.ts` で貯金移動を統計対象へ含めた
  - `client/src/pages/RecordPage.tsx` を口座増減ベースの入力画面へ作り直した
  - `client/src/pages/LedgerPage.tsx` で `SAVING-OUT / SAVING-IN / MOVE-OUT / MOVE-IN` を表示できるようにした
  - `client/src/styles.css` を DADS 寄りの落ち着いた UI へ調整した
- 確認結果:
  - `npm run db:generate` 成功
  - `npm run db:push -- --accept-data-loss` 成功
  - `npm run typecheck` 成功
  - `npm run build` 成功
  - ローカル API で `SAVING` の口座移動を作成し、`savingTotal` が `200000 -> 201234` に増えることを確認
  - `dashboard.recentRecords` に `SAVING_MOVE:1234` が出ることを確認
  - `GET /api/account-transfers` に `SAVING:1234:iPad` が出ることを確認
  - テストで作成した移動と補助口座は削除し、確認後に元へ戻した
- 残課題:
  - 既存の `DailyRecord.type = SAVING` は後方互換として残っているため、将来的には完全に移行して整理する余地がある
  - `AccountsPage` も台帳と同じ粒度で口座ごとの増減履歴を見せる UI に寄せる余地がある
  - DADS への寄せ方は基礎段階までで、コンポーネント粒度の完全準拠までは未実施
