# tamelog プロジェクト メモ

## デザインシステム (CLEAR — 2026-03-14 完全再構築)

### コンセプト
「CLEAR」: ライトモード × ウォームブルーアクセント × オレンジ(目標) × iOS-nativeな感触
ユーザーのイメージ: 「きっちり+やわらかい+クール+たのしい」のバランス型、ライトモード、差し色1色寄り

### カラートークン
- `--bg: #F2F2F7` (iOS grouped background)
- `--bg-1: #FFFFFF` / `--bg-2: #F2F2F7` / `--bg-3: #E5E5EA`
- `--amber: #2F7DF6` (ウォームブルー、主アクセント ※変数名は互換のため維持)
- `--jade: #30D158` (iOS green / 収入)
- `--coral: #FF3B30` (iOS red / 支出)
- `--sky: #5AC8FA` (iOS light blue / 移動)
- `--orange: #FF9500` (iOS orange / 目標・貯金)
- `--text: #1C1C1E` / `--text-2: #636366` / `--text-3: #AEAEB2`
- `--border: rgba(0,0,0,0.08)` / `--border-hi: rgba(0,0,0,0.15)`
- シャドウ: `--shadow-xs`, `--shadow-sm`, `--shadow` (暗くしすぎない)
- ブランドマーク: `linear-gradient(135deg, #2F7DF6, #5BA3FF)` + blue glow

### フォント
- `-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic UI", "Noto Sans JP", sans-serif`
- Google Fonts は廃止 (Material Symbols アイコンのみ維持)

### ユーザーの色の好みメモ
- 青系(A)メインで、少しオレンジ(D)のニュアンス
- ライトモード(B)
- 差し色1色+ほぼ白黒グレー(B寄りのほんの少しAC)
- 数字は大きくドーンと(A)

### 主要コンポーネントクラス
- レイアウト: `shell`, `sidebar`, `page-area`, `topbar`, `page-body`, `tabbar`, `tabbar__item`
- カード: `card`, `card--flush` (白+shadow-sm)
- ボタン: `btn btn--fill`, `btn--out`, `btn--ghost`, `btn--del`, `btn--icon`, `btn--sm`
- フォーム: `field`, `field__label`, `field--wide`, `toggle-row`, `toggle-list`
- 選択: `chip`(pill形状), `chip.on`, `seg`, `seg__btn`, `seg__btn.on`
- データ表示: `entry`, `entry-list`, `stat`, `stat__value--amber/jade/coral/orange`
- バッジ: `badge--in`, `badge--out`, `badge--save`, `badge--move`, `badge--goal`
- プログレス: `prog`, `prog__fill`, `prog--jade`, `prog--coral`, `prog--orange`
- グリッド: `two-up`, `three-up`, `four-up`, `auto-grid`, `hero-split`
- フォームグリッド: `form-stack`, `form-grid`
- 認証: `auth-wrap`, `auth-card`, `auth-logo`, `auth-form-card`
- ウィザード: `wizard-wrap`, `wizard-card`, `wizard-steps`, `wizard-step-dot`, `.on`
- フィードバック: `ok-msg`, `err-msg`, `empty`
- その他: `eyebrow`, `page-h1`, `mini-row`, `bar-row`, `bar-stack`, `analysis-block`

### ナビゲーション設計
- PC: `sidebar` 220px (日本語ラベル、白背景+shadow)
- SP: `tabbar` 4タブ(ホーム/記録/口座/目標) + シートメニュー(メニュー5番目)
- タブバー: blur背景+上部ボーダー、アクティブ=ブルー

### ui.tsx エクスポート
Card, SectionHead, Stat, Feedback, EmptyState, AuthFrame, StatusMessage (alias), Panel (alias), SectionHeading (alias), MetricCard (alias)

## プロジェクト構造
- フロント: `/client/src/`
- スタイル: `client/src/styles.css`
- 共通コンポーネント: `client/src/components/AppLayout.tsx`, `client/src/components/ui.tsx`
- ページ: `client/src/pages/`

## ビルドコマンド
- `npm run build --workspace client` で型チェック+ビルド
- `npx tsc --noEmit` で型チェックのみ
