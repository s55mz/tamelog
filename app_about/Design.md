# TameLog — UI/UX デザイン仕様書

更新日: 2026-03-16
バージョン: 2.0 — Native App Redesign

---

## 概要

TameLog (貯めログ) は、家計の記録と貯金目標の管理を日常的に使えるよう設計された招待制 PWA。

このドキュメントは v2.0 における「スマホ Web でネイティブアプリのように感じる UI/UX」への再設計仕様を定義する。

中心思想: **Observe → Act** — 状態を見て、すぐ操作できること。

---

## 現状の問題点

コードを精査した結果、以下の構造的問題が存在する。

### 1. デュアルレンダリング問題

`DashboardPage.tsx` に `home-mobile-overview`（モバイル用）と `home-hero`（デスクトップ用）の両セクションが同時に JSX に存在し、CSS の `display: none` で切り替えている。コードが分断され、メンテナンスコストが高い。

### 2. モバイルでの「デスクトップカード」問題

ヒーローカード・クイックアクションの下にある `home-grid` + `home-panel` セクションがモバイルでも表示される。これらはデスクトップ向けカードスタイル（ヘッダー + コンテンツのパネル構造）のまま1カラムになるだけで、「PCサイトを縦に積んだ」状態。

### 3. ボトムナビの中央 CTA が弱い

現在の `layout-mobile-nav-link--primary` は同サイズのタブにブランドカラーを塗っているだけ。視覚的インパクトが弱く、「記録する」という主要アクションが際立っていない。

### 4. 情報の優先順位が不明確

- 目標カード・口座スナップショット・最近の記録が同じ weight で並ぶ
- 「口座スナップショット」はホームに常時必要ではない（クイックアクションの「口座」タイルで代替可能）
- セクションヘッダーが `label + h3 + button` の3要素で占有面積が大きい

### 5. 記録リストのスタイルが重い

`record-stack-item` が角丸ボーダー付きバブルカードで表示される。リスト表示に対してビジュアルウェイトが重すぎる。

### 6. モバイルナビの「ためる」タブが欠落

現在のボトムナビは「ホーム・家計簿・記録・目標・その他」の5タブだが、実装コードの `mobileNav` に目標 (`/goals`) が4番目として含まれておらず、実際には「ホーム・家計簿・記録・（空）・その他」になっている可能性がある。要確認・修正。

---

## 1. Visual Tone 定義

**"Soft Functional"** — 毎日使っても飽きない、柔らかく実用的な質感。

参照イメージ:
- JR東日本アプリ: 迷わない情報整理、即操作
- d NEOBANK: 上部で大きく状態表示、直下で機能アクセス
- ANAアプリ: 余白・統一感・上質さ
- Monzo: 残高の大きな表示、即 CTA

ビジュアル方向性:
- **背景**: わずかにクールグレー (#F5F6F8) — 白ではなく、落ち着いたアプリ感
- **カード面**: 白 (#FFFFFF) — 背景との微妙なコントラスト
- **ヒーローカード**: ブランドダークグリーン (#1C4733) — アプリの顔、力強く存在感
- **アクセントカラー**: ブランドティール (#2F7D67) のみ主軸で使用
- **数値**: モノスペースフォント、大きく、明確
- **アイコン**: Material Symbols 単色、統一サイズ
- **角丸**: 大きめ (16〜20px)、有機的・柔らかさ
- **影**: 最小限 — 必要な面は境界線で分離
- **色数**: ブランドティール + 意味色 (赤:支出, 青:移動, 橙:警告) のみ

禁止:
- 意味のないグラデーション
- カードの乱立（同じ weight のカードが縦に並ぶだけの SaaS 感）
- 強すぎる影や装飾
- generic AI app 感（purple-on-white 系）

---

## 2. 情報階層の再設計方針

### 設計原則

```
Priority 1: Hero Status    — 今の状態を一目で知る
Priority 2: Quick Actions  — 主要操作に即アクセス
Priority 3: Focus Context  — 目標進捗（常に気にすべき情報）
Priority 4: Recent History — 直近の行動記録
Priority 5: Navigation     — 他画面への導線（固定ボトムナビ）
```

### 情報の取捨選択

**ホームに残す:**
- 口座全体残高 (Hero — 大きく)
- 今期の貯金額・目標進捗率・メイン口座名 (Hero sub-stats)
- 記録・家計簿・目標・口座のクイックアクション
- フォーカス目標の進捗 (コンパクトなタイル)
- 直近5件の記録 (コンパクトなリスト)

**ホームから外す:**
- 口座スナップショット: クイックアクション「口座」タイル + `/accounts` 画面で確認
- ミッション・今日の指針: 低頻度情報。設定・進捗画面で
- 「今期の基準期間ID」: ユーザーにとって意味薄 — 削除

### モバイル vs デスクトップ

**モバイル (< 980px)**: ネイティブアプリ設計。全幅ヒーロー → クイックアクション → コンテキスト情報。
**デスクトップ (≥ 980px)**: 既存のサイドバー + ヘッダー + grid 構造を維持。

---

## 3. ホーム画面の新しい構造案

```
┌─────────────────────────────────┐
│ [Sticky Header — 56px]          │
│  ⊕ TameLog     ホーム    [AB]  │
├─────────────────────────────────┤
│                                 │
│  [Hero Card — Edge-to-Edge]     │
│  おはようございます [給料日15日] │
│                                 │
│  口座の残高                     │
│  ¥ 2 3 4 , 5 0 0               │  ← 52px mono, 白文字
│                                 │
│  ─────────────────────────────  │
│  今期の貯金 │ 目標進捗 │ メイン  │
│  ¥30,000   │  47%    │ 楽天    │
│                                 │
├─────────────────────────────────┤
│  [Quick Actions — 2×2 Grid]     │
│  ┌──────────┐  ┌──────────┐    │
│  │  [icon]  │  │  [icon]  │    │
│  │ 記録する  │  │ 家計簿   │    │
│  └──────────┘  └──────────┘    │
│  ┌──────────┐  ┌──────────┐    │
│  │  [icon]  │  │  [icon]  │    │
│  │  目標    │  │  口座    │    │
│  └──────────┘  └──────────┘    │
│                                 │
├─────────────────────────────────┤
│  フォーカス目標          詳細 → │
│  ┌─────────────────────────────┐│
│  │ タイトル名                  ││
│  │ ████████████░░░░            ││
│  │ 47% 達成   残¥xx,xxx  30日  ││
│  └─────────────────────────────┘│
│                                 │
├─────────────────────────────────┤
│  最近の記録              追加 + │
│  [支出] メモ       ¥3,200  1/15 │
│  ────────────────────────────── │
│  [収入] 給料     ¥120,000  1/15 │
│  ────────────────────────────── │
│  [貯金] 旅行積立  ¥10,000  1/14 │
│                                 │
│  [すべての記録を見る →]          │
│                                 │
│  (bottom nav の余白分)           │
├─────────────────────────────────┤
│ [Bottom Nav — Floating Pill]    │
│  ホーム  家計簿  [⊕]  ためる  その他 │
└─────────────────────────────────┘
```

---

## 4. コンポーネント一覧

### Shell & Navigation

| コンポーネント | クラス | 役割 |
|---|---|---|
| AppShell | `layout-shell` | Mobile-first レイアウトコンテナ |
| MobileHeader | `layout-header-mobilebar` | ホームアイコン / タイトル / アバター |
| BottomNav | `layout-mobile-nav` | 固定ボトムナビ 5タブ + CTA |
| BottomSheet | `layout-mobile-sheet` | その他メニューのスライドアップシート |

### ホーム画面

| コンポーネント | クラス | 役割 | 優先度 |
|---|---|---|---|
| HeroMetricCard | `home-hero-card` | 残高 + sub-stats (edge-to-edge, dark bg) | P1 |
| QuickActionGrid | `home-quick-grid` | 4タイルの 2×2 アクション群 | P2 |
| QuickActionTile | `home-quick-tile` | 単一アクションタイル (icon + label) | P2 |
| SectionHead | `home-section-head` | セクション見出し + アクションリンク | — |
| FocusGoalTile | `home-goal-tile` | フォーカス目標の進捗タイル | P3 |
| RecordList | `home-record-list` | 最近の記録リスト (entry スタイル) | P4 |
| RecordItem | `home-record-item` | 単一記録行 | P4 |
| ContextSection | `home-context-section` | P3/P4 セクションのラッパー | — |

### 各コンポーネントの挙動仕様

**HeroMetricCard:**
- 読み込み中: balance エリアに opacity 0.4 のプレースホルダー
- 残高 0 以下: 残高数値を danger 色で表示
- 目標なし: sub-stats 目標セルに「―」
- 口座なし: メイン口座セルに「未設定」

**QuickActionTile:**
- デフォルト: bg-1 + border
- hover: bg-2 + border-hi
- active/press: transform scale(0.97) + background change

**FocusGoalTile:**
- 目標なし: dashed border の「最初の目標を作る →」プレースホルダー
- 進捗 100%: プログレスバーを amber + 達成ラベル表示
- タップ: `/goals` へ遷移

**RecordItem:**
- タイプ別バッジ: INCOME=badge--in, EXPENSE=badge--out, SAVING=badge--save, TRANSFER=badge--move
- 金額の符号: EXPENSE = `-`, INCOME/SAVING = `+`, TRANSFER = 符号なし

---

## 5. カラートークン

現行 Deep Teal Design System を継承。

```css
/* Brand */
--brand:        #2F7D67;   /* primary — CTA, active, progress */
--brand-strong: #1C4733;   /* hero card bg, emphasis */
--brand-soft:   #E0F0EB;   /* tint bg, active tab bg */

/* Backgrounds */
--bg:           #F5F6F8;   /* app background */
--bg-1:         #FFFFFF;   /* card / surface */
--bg-2:         #EEF1F4;   /* secondary surface */
--bg-3:         #E4E8EE;   /* tertiary, disabled */

/* Text */
--text:         #0F172A;   /* primary ~19:1 */
--text-2:       #475569;   /* secondary ~5:1 */
--text-3:       #94A3B8;   /* muted, decorative only */

/* Borders */
--border:       #E2E8F0;
--border-hi:    #CBD5E1;

/* Semantic */
--amber:        #F59E0B;   /* 貯金, 目標, 警告 */
--amber-soft:   #FEF3C7;
--danger:       #E11D48;   /* 支出, エラー */
--danger-soft:  #FFE4E6;
--info:         #2563EB;   /* 移動, 情報 */
--info-soft:    #DBEAFE;
```

**使用原則:**
- ブランドカラーは CTA・アクティブ状態・プログレスバーのみ
- 意味色はデータ種類を示す時のみ（装飾目的の使用禁止）
- Hero カードは `brand-strong` 背景で白文字
- 装飾目的の新規カラー追加は禁止

---

## 6. タイポグラフィ方針

### フォントスタック

```css
--font-heading: -apple-system, BlinkMacSystemFont,
                "SF Pro Display", "Helvetica Neue",
                "Hiragino Sans", "Yu Gothic UI", "Noto Sans JP", sans-serif;

--font-body:    -apple-system, BlinkMacSystemFont,
                "SF Pro Text", "Helvetica Neue",
                "Hiragino Sans", "Yu Gothic UI", "Noto Sans JP", sans-serif;

--font-mono:    ui-monospace, "SF Mono", "SFMono-Regular",
                "Roboto Mono", "Menlo", monospace;
```

iOS では SF Pro が自動適用され、ネイティブアプリと同等の質感を得られる。
Android では Roboto / Noto Sans JP が適用される。

### サイズスケール

| 用途 | サイズ | Weight | Font |
|---|---|---|---|
| Hero 残高 (モバイル) | 52px (small: 44px) | 700 | mono |
| ページ見出し (デスクトップ) | clamp(32px, 3.5vw, 46px) | 700 | heading |
| セクション見出し | 19px | 700 | heading |
| カードタイトル | 16px | 600 | body |
| リスト本文 | 14–15px | 500–600 | body |
| Sub-stats 値 | 15px | 700 | body |
| Sub-stats ラベル | 11px | 500 | body |
| メタ情報 | 12–13px | 500 | body |
| バッジ | 11px | 700 | body |
| Eyebrow | 11px | 700 | body, 0.08em tracking, uppercase |

**数値表示の原則:**
- 金額はすべて `font-mono` + `font-variant-numeric: tabular-nums`
- 大きな金額 (残高): 52px mono, letter-spacing: -0.04em
- 進捗% など中規模: 20–24px mono
- リスト内の金額: 14–16px mono

---

## 7. Spacing / Radius / Surface ルール

### スペーシング

```css
--s1:  4px;   /* icon margin, micro gap */
--s2:  8px;   /* 密な間隔 */
--s3: 12px;   /* コンポーネント内 gap */
--s4: 16px;   /* 標準パディング */
--s5: 24px;   /* ヒーローカードパディング */
--s6: 32px;   /* セクション間 */
--s7: 48px;   /* 大余白 */
--s8: 64px;   /* ページ上部余白 */
```

モバイルでの標準ページ横パディング: `16px` (--s4)

### 角丸

| 用途 | 値 |
|---|---|
| Quick Action タイル | 20px |
| 汎用カード | 20–24px |
| Hero カード (モバイル) | 0 (edge-to-edge) |
| Hero カード (デスクトップ) | 16px |
| 目標タイル | 16px |
| ボタン standard | 14px |
| ボタン small | 12px |
| バッジ・ピル | 999px |
| ボトムシートパネル | 28px 28px 0 0 |
| ボトムナビ (floating) | 24px |

### Surface ヒエラルキー

```
Level 0: --bg (#F5F6F8)       アプリ背景
Level 1: --bg-1 (#FFFFFF)     カード・パネル面
Level 2: --bg-2 (#EEF1F4)     インプット・セカンダリ面
Level 3: --bg-3 (#E4E8EE)     ターシャリ・ディセーブル
Special: --brand-strong       Hero カード背景
```

### 影の原則

| 用途 | 影 |
|---|---|
| 通常カード | なし (ボーダーのみ) |
| Hero カード | なし (背景色で分離) |
| ボトムナビ floating | `0 8px 24px rgba(15,23,42,0.08)` |
| ホバー時 | なし (背景色変化のみ) |

---

## 8. Bottom Navigation 方針

### 構成

```
ホーム  家計簿  [⊕記録]  ためる  その他
  /    /ledger  /record  /goals  (sheet)
```

### 仕様

- **位置**: `position: fixed`, `bottom: calc(12px + env(safe-area-inset-bottom))`
- **形状**: 角丸ピル型 (border-radius: 24px), left/right 各 12px
- **背景**: `rgba(255,255,255,0.96)` + `backdrop-filter: blur(18px)`
- **ボーダー**: `1px solid var(--border)`
- **シャドウ**: `var(--shadow-md)`
- **高さ**: min-height 56px
- **コンテンツパディング**: `padding-bottom: calc(88px + env(safe-area-inset-bottom))` を layout-main に設定

### タブ仕様

| タブ | ルート | アイコン |
|---|---|---|
| ホーム | `/` | `home` |
| 家計簿 | `/ledger` | `receipt_long` |
| **記録 (CTA)** | `/record` | `add` |
| ためる | `/goals` | `flag` |
| その他 | (sheet open) | `grid_view` |

「記録」タブは `layout-mobile-nav-link--primary` クラスでブランドカラー背景 + 白アイコンで他タブより視覚的に強調。

### その他シートの階層

```
ふり返る
  ├── 進捗        /progress
  ├── AI相談      /chat
  └── 保留リスト  /impulse

アカウント
  ├── 設定       /settings
  └── ログアウト

管理者 (ADMIN ロールのみ)
  ├── 招待管理   /invite
  └── 管理      /admin
```

---

## 9. Customization / 機能の段階開示方針

### 表示頻度による分類

| 頻度 | 機能 | 表示場所 |
|---|---|---|
| 毎日 | 記録, 家計簿, 目標, 口座 | ホーム + ボトムナビ |
| 週1 | 進捗, AI相談 | その他シート上部 |
| 月1 | 保留リスト, 設定 | その他シート下部 |
| 管理者のみ | 招待管理, 管理 | その他シート最下部 |

### 原則

1. **ホームには最重要情報のみ** — Hero + 4クイックアクション + 目標 + 直近記録
2. **ボトムナビは5タブ以下** — オーバーフローはシートへ
3. **低頻度機能は視界に入れない** — 必要な時だけシートから呼び出す
4. **管理者機能はロールベースで表示制御** — 一般ユーザーには非表示

---

## 10. 実装ステップ

### Phase 1: CSS の整備

**対象:** `client/src/styles.css`

- [ ] `home-quick-grid`, `home-quick-tile` の追加 (home-mobile-actions を置き換え)
- [ ] `home-section-head`, `home-section-title`, `home-section-link` の追加
- [ ] `home-goal-tile`, `home-goal-tile__name`, `home-goal-tile__meta` の追加
- [ ] `home-record-list`, `home-record-item` の追加
- [ ] `home-context-section` の追加
- [ ] `home-goal-empty` (dashed プレースホルダー) の追加
- [ ] `home-view-all` (「すべて見る」リンク) の追加

### Phase 2: DashboardPage のリファクタリング

**対象:** `client/src/pages/DashboardPage.tsx`

- [ ] `home-hero` (デスクトップ用セクション) の内容を整理・簡素化
- [ ] `home-mobile-overview` の quick-actions を `home-quick-grid` に置き換え
- [ ] `home-grid` + 口座スナップショットパネルを削除
- [ ] フォーカス目標を `home-goal-tile` コンポーネントに変更
- [ ] 最近の記録を `home-record-item` 行スタイルに変更
- [ ] `home-context-section` で P3/P4 セクションをラップ
- [ ] typeBadge マップを追加 (record-type-pill を badge クラスに統一)

### Phase 3: AppLayout の改善

**対象:** `client/src/components/AppLayout.tsx`

- [ ] `mobileNav` の4番目を `/goals` に変更 (「ためる」タブの確認・修正)
- [ ] シートメニューのナビグループを「ふり返る / アカウント / 管理者」に整理
- [ ] BottomSheet の NavGroup 構成を更新

### Phase 4: 検証

- [ ] iPhone SE (375px) で確認: Hero カード・クイックアクションが画面内に収まるか
- [ ] iPhone Pro (390px) で確認: 標準表示
- [ ] タップターゲット: すべてのインタラクティブ要素が 44px 以上か
- [ ] safe-area-inset: ノッチ付きデバイスでのボトムナビ位置確認
- [ ] 読み込み中: Hero カードにローディング状態が表示されるか

---

## 操作体験のまとめ

| シナリオ | 操作フロー |
|---|---|
| 残高を確認したい | ホーム → Hero Card (0操作) |
| 今日の支出を記録したい | ホーム → [記録する] タイル or ボトムナビ ⊕ |
| 目標の進捗を確認したい | ホーム → FocusGoalTile (1タップで詳細) |
| 過去の家計簿を見たい | ボトムナビ「家計簿」(1タップ) |
| AI に相談したい | ボトムナビ「その他」→ AI相談 |
| 設定を変更したい | ボトムナビ「その他」→ 設定 |

**Observe → Act の保証:**
- アプリを開いた瞬間に残高が見える (0操作)
- 記録は2タップ以内 (ホーム → 記録タイル → フォーム)
- 目標確認は1タップ
- 詳細情報は必要な時だけ深く
