# Phase 12 記録

更新日: 2026-03-13

## ステータス

- 完了

## 計画

- 既存フロントの構成と `styles.css` / `AppLayout.tsx` 依存を確認し、延命せずに捨てる対象を明確化する
- 新しいデザインコンセプトを 1 つ定義し、共通レイアウト、デザイントークン、タイポグラフィ、ボタン、フォーム、カード、ナビゲーションを新規実装する
- ホーム、目標、記録、家計簿、口座、設定を中心に、補助画面と認証導線も同じデザインシステムへ統一する
- 旧デザインの残骸を確認し、`build` / `typecheck` を通したうえで結果を記録する

## 実行

- 参照資料 `app_about/frame.md` と `app_about/apple-ui-report.md` を読み、現状が「家計簿中心の情報設計 + 既存サイドバー / 下部ナビ」であることを確認した
- 旧デザインの主要依存として、既存配色、余白スケール、丸みの強いカード、`AppLayout.tsx` のサイドバー構成、`styles.css` の共通クラス群を廃棄対象に設定した
- コンセプトを `Motion Ledger Console` と定義し、口座変動を主役にしたコントロールデッキ型の PC UI と、PWA / ネイティブ寄りドック型の SP UI を新規設計した
- `client/src/components/AppLayout.tsx` を全面置換し、旧ナビ構成を使わない新しいレール / ドック / シートメニュー構造へ変更した
- `client/src/components/ui.tsx` と `client/src/lib/format.ts` を追加し、新しい panel、section heading、metric、auth frame、書式化処理を共通化した
- `client/src/styles.css` を全面置換し、デザイントークン、背景、タイポグラフィ、フォーム、ボタン、カード、ナビゲーション、モバイル挙動を 1 から定義した
- 次の画面を DOM 構造ごと再設計した
  - `client/src/pages/DashboardPage.tsx`
  - `client/src/pages/GoalsPage.tsx`
  - `client/src/pages/RecordPage.tsx`
  - `client/src/pages/LedgerPage.tsx`
  - `client/src/pages/AccountsPage.tsx`
  - `client/src/pages/ProgressPage.tsx`
  - `client/src/pages/SettingsPage.tsx`
  - `client/src/pages/AdminPage.tsx`
  - `client/src/pages/InvitePage.tsx`
  - `client/src/pages/ImpulsePage.tsx`
  - `client/src/pages/ChatPage.tsx`
  - `client/src/pages/LoginPage.tsx`
  - `client/src/pages/RegisterPage.tsx`
  - `client/src/pages/SetupPage.tsx`
  - `client/src/pages/UserSetupPage.tsx`
- `rg` で旧 UI クラス残骸の参照が残っていないことを確認した
- `npm run build --workspace client`
- `npm run typecheck --workspace client`
- `npm run build`
- `npm run typecheck`

## 結果

- 完全に捨てたもの:
  - 既存のベージュ系配色とやわらかい家計簿トーン
  - 既存のサイドバー / 旧モバイル下部ナビ構成
  - 既存のカード形状、余白、旧クラス名ベースの UI 骨格
  - 既存 `styles.css` を前提にした見た目の再利用
- 新しく定義したもの:
  - `Motion Ledger Console` という単一コンセプト
  - 口座変動を主役にした情報階層
  - PC のコントロールレール + ステージ構成
  - SP のネイティブ寄りドック + シートメニュー構成
  - 新デザイントークン、タイポグラフィ、ボタン、フォーム、カード、メトリクス、タイムライン、テンキー、認証レイアウト
  - 目標画面のメイン目標中心レイアウトと進捗イラストの強調
  - 記録画面のテンキー主導 UI と口座増減ベースの入力フロー
- 確認結果:
  - `npm run build --workspace client` 成功
  - `npm run typecheck --workspace client` 成功
  - `npm run build` 成功
  - `npm run typecheck` 成功

---

# Phase 12 追加: AMBER VAULT 全再構築

更新日: 2026-03-14

## 計画

- 「Motion Ledger Console」デザインは既存の延長であると判断し、別物として再設計する
- 旧: cool navy + teal glassmorphism + Google Fonts + 英語ラベル + pill button + hero-grid
- 新コンセプト「AMBER VAULT」: 暖色ダーク × アンバーアクセント × システムフォント × ソリッドサーフェス × ネイティブ下部ナビ

## 削除対象 (明示)

- `--bg: #07111f` (cool navy) — 全廃
- `--accent: #69e5c0` (teal) / `--accent-2: #55a7ff` (blue) — 全廃
- `backdrop-filter: blur(18px)` glassmorphism — 全廃
- `body::before` dot grid overlay — 全廃
- `@import` Google Fonts (Manrope, JetBrains Mono, Noto Sans JP) — 全廃
- 英語ラベル文言: "Motion Ledger Console", "Orbit", "Capture", "Active Surface", "Flow Monitor" 等 — 全廃
- `border-radius: 999px` pill ボタン — 全廃
- `hero-grid` / `hero-panel` 二列ヒーロー構造 — 全廃
- radial-gradient on surfaces — 全廃
- 全 CSS クラス名 (control-rail, panel-surface, segment-switch, rail-link 等) — 全廃

## 実行

- 全ファイルを事前読み込みし、旧クラス依存の全体像を把握
- `styles.css` を1から書き直し: 暖色ダーク (#0E0D0A), amber (#E9A726), jade (#3CB887), coral (#DC5740), システムフォント
- `ui.tsx` を完全刷新: Card, Stat, Feedback, EmptyState, AuthFrame + 後方互換エイリアス
- `AppLayout.tsx` を完全刷新: PC左サイドバー(220px)・モバイル下部タブバー(5項目)・シートメニュー
- 全15画面を新クラス名・新DOM構造で再実装:
  - DashboardPage: 総残高ヒーロー→口座横スクロール→目標カード→最近の記録
  - RecordPage: セグメントタブ→大きな金額表示→フォーム→テンキー→保存ボタン
  - GoalsPage: メイン目標+進捗バー→サマリー3列→目標一覧
  - AccountsPage: 総残高ヒーロー→口座カード→追加フォーム→移動フォーム
  - LedgerPage: 収支貯金サマリー3列→統合タイムライン
  - SettingsPage: プロフィール→通知→カテゴリ管理
  - ProgressPage: 統計4列→セグメントタブ(概要/収支比率/AI分析)
  - ImpulsePage: 追加フォーム→待機中→履歴
  - ChatPage: 返答表示→入力エリア→サジェスト
  - LoginPage / RegisterPage: AuthFrame 新デザイン
  - SetupPage / UserSetupPage: wizard-wrap / wizard-card 新デザイン
  - AdminPage: ユーザー管理+システム状態
  - InvitePage: 招待発行+一覧

## 結果

- TypeScript: エラー 0
- ビルド: 成功 (16.08 kB CSS / 308.63 kB JS gzip: 89 kB)
- 完全に捨てたもの:
  - Cool navy + teal glassmorphism の色体系
  - Google Fonts (Manrope, JetBrains Mono) — アイコン用 Material Symbols のみ残す
  - 英語テック系ラベル ("Console", "Orbit", "Capture" 等)
  - `backdrop-filter: blur` / dot grid overlay
  - `border-radius: 999px` pill shape
  - hero-grid 2カラムヒーロー構造
  - panel-surface / control-rail / rail-link 等 旧CSS クラス名全体
- 新しく定義したもの:
  - AMBER VAULT コンセプト (暖色ダーク × アンバー × ネイティブ感)
  - 新デザイントークン: --bg:#0E0D0A, --amber:#E9A726, --jade:#3CB887, --coral:#DC5740
  - システムフォントスタック (-apple-system, BlinkMacSystemFont 等)
  - ソリッドサーフェス + subtle shadow (glassmorphism廃止)
  - PC: 220px 左サイドバー、日本語ナビ、ユーザー情報footer
  - SP: 5タブ下部ナビ (ホーム/記録/口座/目標/メニュー) + シートメニュー
  - 新クラス体系: card, btn, field, seg, chip, badge, prog, stat, entry-list 等
  - 全ページのDOM構造を機能を保ちながら完全再設計
