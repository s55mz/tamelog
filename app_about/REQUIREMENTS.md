# 貯めログ 実装要件

更新日: 2026-03-12

この文書は、`frame.md` で確定した内容を実装向けに整理した補助仕様です。
画面の判断は `frame.md` を優先し、この文書は API、データ、実装単位の補足を担当します。

## 1. 参照ルール

- 画面構成と導線は `frame.md` を優先
- この文書では、実装時に必要なデータと API 契約だけを補足する
- `frame.md` と矛盾した場合は `frame.md` を正とする

## 2. 実装の前提

### 2.1 技術前提

- フロント: React + TypeScript + Vite
- API: Node.js + Hono
- DB: PostgreSQL + Prisma
- 認証: JWT
- AI: OpenAI API
- メール: SMTP

### 2.2 タイムゾーン前提

- 保存、表示、集計の基準はすべて JST
- v1 ではユーザーごとのタイムゾーン切替は持たない

## 3. データモデル

### 3.1 主テーブル

| テーブル | 用途 |
|---|---|
| `User` | ユーザー、ロール、給料日、初期設定完了状態 |
| `Invitation` | 招待トークン |
| `Account` | 口座 |
| `DailyRecord` | 収入、支出、貯金 |
| `AccountTransfer` | 口座移動 |
| `Goal` | 貯金目標 |
| `GoalRecord` | 目標積立履歴 |
| `GoalVisualAsset` | 目標進捗画像セット定義 |
| `Category` | カテゴリ |
| `ImpulseItem` | 衝動買い項目 |
| `AIAnalysis` | AI 分析結果 |
| `SystemConfig` | システム設定 |

### 3.2 設計ルール

- 全ユーザーデータは `userId` を持つ
- `Goal.currentAmount` は持たない
- `Account.balance` は保持する
- 記録と残高更新は同一トランザクションで処理する
- 記録が紐付く口座は削除不可
- 目標画像は `category`, `subcategory`, `theme`, `step` の組み合わせで決定する

### 3.3 カテゴリ

- `type`: `income` または `expense`
- ユーザー作成時にデフォルトカテゴリを複製
- v1 では `name`, `type`, `sortOrder`, `icon` を持つ

推奨デフォルトカテゴリ:

- 支出
  - 食費
  - 日用品
  - 交通費
  - 趣味
  - 衣類
  - 医療
  - 住居
  - 通信
  - その他
- 収入
  - 給料
  - 臨時収入
  - その他

## 4. API 要件

### 4.1 共通

- JSON API
- エラー形式は `{"error":"..."}` を基本とする
- 管理者 API は認証とロール確認が必須
- ID 指定 API は必ず `userId` 境界で検索する

### 4.2 API 一覧

セットアップ:

- `GET /api/setup/status`
- `POST /api/setup/test-db`
- `POST /api/setup/install`

認証:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

ユーザー:

- `GET /api/users/me`
- `PUT /api/users/me`
- `POST /api/users/me/complete-setup`
- `GET /api/users/me/stats`

記録:

- `GET /api/records`
- `POST /api/records`
- `PUT /api/records/:id`
- `DELETE /api/records/:id`

口座移動:

- `GET /api/account-transfers`
- `POST /api/account-transfers`

口座:

- `GET /api/accounts`
- `POST /api/accounts`
- `PUT /api/accounts/:id`
- `DELETE /api/accounts/:id`

目標:

- `GET /api/goals`
- `POST /api/goals`
- `PUT /api/goals/:id`
- `DELETE /api/goals/:id`
- `GET /api/goals/:id/records`

カテゴリ:

- `GET /api/categories`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`
- `POST /api/categories/reset-defaults`

衝動買い:

- `GET /api/impulse-items`
- `POST /api/impulse-items`
- `PUT /api/impulse-items/:id`
- `DELETE /api/impulse-items/:id`

AI:

- `POST /api/chat`
- `GET /api/analysis`
- `POST /api/analysis/generate`

管理者:

- `GET /api/admin/users`
- `POST /api/admin/invitations`
- `GET /api/admin/invitations`
- `POST /api/admin/invitations/:id/revoke`
- `POST /api/admin/users/:id/suspend`
- `GET /api/admin/config`
- `PUT /api/admin/config`
- `POST /api/admin/test-email`
- `GET /api/admin/system-info`

## 5. 業務ロジック補足

### 5.1 `periodId`

- 形式は `YYYY-MM-DD`
- 給料日基準で作成時に確定
- 月末不足日は末日へ丸める

### 5.2 記録編集

- 編集時は旧記録の影響を打ち消してから新記録内容を適用する
- 種別変更、口座変更、金額変更、目標変更を許可する

### 5.3 AI

- AI 相談履歴は保存しない
- AI 分析結果は月単位で保存する
- 1 日 20 回制限
- 目標作成時と目標更新時に、タイトルと任意メモから画像カテゴリを自動推定する
- AI が不明判定なら `other/generic` を返す
- ユーザーは AI 結果を手動修正できる

### 5.4 通知

- v1 はメール通知のみ
- Web Push は将来拡張
- 進捗画像の節目変更に合わせてアプリ内トーストを出す
- メール通知は 10%, 25%, 50%, 75%, 90%, 100% を契機に送信候補とする

## 6. 環境変数

バックエンド:

```env
DATABASE_URL=
PORT=3000
JWT_SECRET=
NODE_ENV=
ALLOWED_ORIGINS=
OPENAI_API_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

フロント:

```env
VITE_API_URL=
```

## 7. 実装優先順位

### 7.1 MVP

- セットアップ
- 認証
- 初期設定
- ホーム
- 記録
- 家計簿
- 口座
- 目標
- 進捗基本集計
- 招待管理

### 7.2 次段階

- 衝動買いチェック
- AI 相談
- AI 分析
- メール通知

## 8. 文書運用

- 画面変更は `frame.md` から直す
- API や DB の変更はこの文書も更新する
- 未決を残す場合だけ `CONCERNS.md` に書く
