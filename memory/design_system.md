---
name: Design System
description: 貯めログのデザインシステム（夜の帳簿テーマ）— カラー、フォント、コンポーネント方針
type: project
---

# デザインシステム — 夜の帳簿 (Yoru no Chobo) v2

## テーマ
常時ダークモード。チャコール深夜背景 + ミントグリーン/コーラル/ゴールドの3色アクセント。

## カラー (CSS変数)
```
--bg        #0F1118   深夜ベース
--bg-1      #171C28   カード
--bg-2      #1E2435   高め
--bg-3      #252B3E   ホバー
--text      #EBE5D9   温かみオフホワイト
--text-2    #8A90AA
--text-3    #525870
--brand     #4EE28C   ミントグリーン（収入・ブランド）
--coral     #FF6475   コーラル（支出）
--amber     #FFBE55   ゴールド（貯金）
--sky       #5BAAFF   スカイ（移動）
```

## フォント
- 見出し/金額表示: `Noto Serif JP` (var(--font-display))
- 本文UI: `Noto Sans JP`
- 数値等幅: `IBM Plex Mono`

## アイコン
- メインUI: **Lucide React** (AppLayout, Dashboard, BlockedPage など)
- 未移行ページ: Material Symbols Outlined (引き続き読み込み中)

## コンポーネント方針
- shadcn/ui (Radix UI) + Tailwind CSS を優先活用
- BEM CSSクラス (`.btn`, `.card`, `.badge--*` 等) は styles.css に定義し後方互換を維持
- `client/src/components/ui/` 配下のshadcn/uiコンポーネントはダーク対応済み

## 主要ファイル
- `client/src/styles.css` — CSS変数 + 全BEMクラス定義
- `client/tailwind.config.js` — Tailwindカラートークン
- `client/src/components/AppLayout.tsx` — レイアウトシェル (Lucide)
- `client/src/pages/DashboardPage.tsx` — ダッシュボード
- `docs/wireframes.md` — 全画面ワイヤーフレーム

**Why:** 2026-03-28にユーザーが全フロントエンド刷新を依頼
**How to apply:** 新しいページやコンポーネントはこのシステムに従って実装する
