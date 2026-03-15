# 貯めログ デザイン計画 — SHIZUKU (雫)

## コンセプト

「SHIZUKU」— 水滴のように透明感があり、清潔で静かなデザイン。
日本語ネイティブのタイポグラフィと、クールトーンのミニマリズムで構成。

**前デザインとの差異**:
| 項目 | 旧 (KAZE v2) | 新 (SHIZUKU) |
|------|-------------|-------------|
| サイドバー | ダーク (#1B1F23) | ライトグレー (#F8FAFC) |
| 見出しフォント | Playfair Display | Shippori Mincho (和文明朝) |
| 本文フォント | DM Sans | M PLUS 2 (和文ゴシック) |
| 数値フォント | JetBrains Mono | IBM Plex Mono |
| 背景 | ウォームペーパー (#F9F8F6) | クールホワイト (#FFFFFF) |
| アクセント | ブライトグリーン (#0C9D58) | エメラルド (#059669) |
| 色温度 | 暖色系 | 寒色系 (Slate) |
| 影 | 多用 | 最小限、ボーダー主体 |
| 角丸 | 大きめ (r5=24px) | 控えめ (r5=18px) |

---

## カラーシステム

### ベース
```
--bg:       #FFFFFF     (純白)
--bg-1:     #FFFFFF     (カード)
--bg-2:     #F8FAFC     (サーフェス/サイドバー)
--bg-3:     #F1F5F9     (くぼみ/セグメント背景)
```

### テキスト (Slate系)
```
--text:     #0F172A     (メインテキスト — Slate 900)
--text-2:   #64748B     (セカンダリ — Slate 500)
--text-3:   #94A3B8     (プレースホルダ — Slate 400)
```

### ボーダー
```
--border:    #E2E8F0    (通常 — Slate 200)
--border-hi: #CBD5E1    (強調 — Slate 300)
```

### セマンティックカラー
```
--emerald:       #059669   (収入/貯金/ポジティブ)
--emerald-light: #D1FAE5   (エメラルド背景)
--red:           #DC2626   (支出/エラー)
--red-light:     #FEE2E2   (レッド背景)
--blue:          #2563EB   (移動/情報)
--blue-light:    #DBEAFE   (ブルー背景)
--amber:         #D97706   (警告/目標)
--amber-light:   #FEF3C7   (アンバー背景)
```

---

## タイポグラフィ

### フォントスタック
| 用途 | フォント | ウェイト | 使用箇所 |
|------|---------|---------|---------|
| 見出し | Shippori Mincho | 700-800 | page-h1, section-h2, auth-title, ブランド名 |
| 本文/UI | M PLUS 2 | 300-700 | body, ボタン, ラベル, ナビ |
| 数値/金額 | IBM Plex Mono | 400-600 | stat__value, entry__amount, keypad |
| 日本語FB | Hiragino Sans → Noto Sans JP | — | フォールバック |

### フォントサイズ
```
ページ見出し:   28px (PC) / 22px (SP)
セクション見出し: 17px
本文:           15px
ラベル:          12px
エイブロウ:      11px (uppercase)
バッジ:          10px (uppercase)
```

---

## レイアウト

### PC (> 960px)
```
┌─────────┬──────────────────────────────┐
│ Sidebar │ Page Area                    │
│  240px  │  max-width: 880px            │
│ #F8FAFC │  padding: 32px 48px          │
│         │                              │
│ ブランド │  ┌ page-h1 ──────────────┐   │
│ + 記録CTA│  │                      │   │
│ ───────  │  └──────────────────────┘   │
│ ナビ     │  ┌ card ────────────────┐   │
│         │  │                      │   │
│         │  └──────────────────────┘   │
│ ───────  │                              │
│ ユーザー │                              │
└─────────┴──────────────────────────────┘
```

### SP (≤ 960px)
```
┌──────────────────────┐
│ Topbar (sticky)      │
│ frosted glass        │
├──────────────────────┤
│                      │
│ Page Body            │
│ padding: 16px        │
│ max-width: 720px     │
│                      │
│                      │
├──────────────────────┤
│ Tabbar (fixed)       │
│ 4タブ + frosted      │
└──────────────────────┘
```

### ナビゲーション構成

**PC サイドバー:**
- ブランドロゴ (Shippori Mincho)
- +記録 CTA (エメラルドボタン)
- セクション: ホーム / ためる (目標・保留) / ふり返る (家計簿・進捗・AI相談) / 設定
- ユーザー情報 (フッター)

**SP タブバー:**
- 4タブ: いま / 記録 (強調) / ためる / その他
- その他 → シートメニュー

---

## コンポーネント設計

### カード
- 背景: 白 (#FFFFFF)
- ボーダー: 1px solid #E2E8F0
- 角丸: 14px
- パディング: 20px
- 影: なし (ボーダーのみ)

### ボタン
| バリアント | 背景 | テキスト | ボーダー |
|-----------|------|---------|---------|
| fill | #059669 (emerald) | 白 | なし |
| out | 白 | #0F172A | #CBD5E1 |
| ghost | 透明 | #059669 | なし |
| del | #FEE2E2 | #DC2626 | rgba |

- min-height: 44px (タッチターゲット)
- border-radius: 10px
- font-weight: 600

### フォーム
- input padding: 11px 16px
- border: 1.5px solid #E2E8F0
- border-radius: 6px
- focus: emerald border + 3px ring

### エントリリスト
- ボーダー分離型 (カード型ではなくリスト型)
- border-bottom: 1px solid #E2E8F0
- hover: #F8FAFC 背景

### プログレスバー
- 高さ: 6px
- 背景: #F1F5F9
- フィル: emerald / red / amber

### バッジ
- 背景: セマンティックカラーの light バリアント
- テキスト: セマンティックカラー
- 角丸: 9999px (pill)

---

## モバイル仕様

### タッチターゲット
- ボタン/リンク: min 44x44px
- タブバーアイテム: min 52px高
- エントリ: min 56px高

### フロストグラス
- Topbar: rgba(255,255,255,0.88) + blur(20px) saturate(1.4)
- Tabbar: rgba(255,255,255,0.92) + blur(20px) saturate(1.4)
- Chat input: rgba(255,255,255,0.90) + blur(16px)

### セーフエリア
- Topbar: padding-top に env(safe-area-inset-top)
- Tabbar: padding-bottom に env(safe-area-inset-bottom)
- Page body: padding-bottom に tabbar高 + safe-area

---

## アニメーション

| 要素 | 種類 | 時間 |
|------|------|------|
| ページ遷移 | translateY(6px) + opacity | 250ms ease-out |
| タブバー表示 | translateY(10px) + opacity | 250ms ease-out |
| シート | translateY(100%) → 0 | 350ms cubic-bezier |
| ボタン hover | background-color | 150ms |
| ボタン active | scale(0.97) | instant |
| プログレスバー | width | 500ms ease |

### prefers-reduced-motion
全アニメーション/トランジションを 0.01ms に短縮。

---

## アクセシビリティ

- カラーコントラスト: WCAG AA 以上 (テキスト 4.5:1)
- フォーカスリング: emerald 3px ring
- タッチターゲット: 最小 44x44px
- sr-only クラス: スクリーンリーダー用非表示テキスト
- キーボードナビ: tab 順序 = 視覚順序

---

## ファイル構成

```
client/
├── index.html              (最小HTML)
├── src/
│   ├── styles.css           (SHIZUKU デザインシステム)
│   ├── main.tsx             (エントリポイント)
│   ├── App.tsx              (ルーティング)
│   ├── components/
│   │   ├── AppLayout.tsx    (Shell/Sidebar/Tabbar)
│   │   ├── Markdown.tsx     (マークダウンレンダラ)
│   │   └── ui.tsx           (共通UIコンポーネント)
│   ├── pages/               (各ページ)
│   └── lib/                 (API, 型定義, ユーティリティ)
```
