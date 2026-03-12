# 貯めログ DB設計

更新日: 2026-03-12

この文書は、`frame.md` と `REQUIREMENTS.md` をもとにした DB 設計書です。
Prisma / PostgreSQL 実装の基準として使います。

## 1. 設計方針

- DB は PostgreSQL を前提とする
- ORM は Prisma を前提とする
- タイムゾーンは JST 運用だが、DB の `DateTime` は UTC 保存でもよい
- 集計の基準日は `periodId` で持つ
- 進捗は `GoalRecord` 集計で算出し、`Goal.currentAmount` は持たない
- 残高は `Account.balance` に保持する
- 記録系の作成、編集、削除はすべてトランザクションで処理する
- ユーザーデータは必ず `userId` 境界を持つ

## 2. 命名方針

- Prisma model 名は単数形 PascalCase
- DB テーブル名は Prisma 既定でもよいが、必要なら `@@map` で snake_case に寄せる
- ID は `String @id @default(cuid())` を基本とする
- 金額は `Int` で円単位管理にする
- 状態値は enum を優先する

## 3. enum 定義

### 3.1 UserRole

- `ADMIN`
- `USER`

### 3.2 AccountType

- `BANK`
- `CASH`
- `CREDIT`

### 3.3 RecordType

- `INCOME`
- `EXPENSE`
- `SAVING`

補足:

- 口座移動は `DailyRecord` ではなく `AccountTransfer` で管理する

### 3.4 CategoryType

- `INCOME`
- `EXPENSE`

### 3.5 InvitationStatus

- `ACTIVE`
- `USED`
- `EXPIRED`
- `REVOKED`

### 3.6 ImpulseStatus

- `WAITING`
- `BOUGHT`
- `SKIPPED`

### 3.7 UserStatus

- `ACTIVE`
- `SUSPENDED`

### 3.8 GoalVisualCategory

- `ITEMS`
- `VEHICLES`
- `TRAVEL`
- `LIFE_EVENT`
- `EDUCATION`
- `HOBBY`
- `OTHER`

### 3.9 GoalVisualTheme

- `SOFT`
- `POP`
- `CALM`

## 4. モデル一覧

### 4.1 User

用途:

- 認証主体
- 給料日と初期設定状態の保持
- 管理者ロール管理

主カラム:

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `id` | String | 必須 | 主キー |
| `name` | String | 必須 | 表示名 |
| `email` | String | 必須 | 一意 |
| `passwordHash` | String | 必須 | bcrypt ハッシュ |
| `role` | UserRole | 必須 | 権限 |
| `status` | UserStatus | 必須 | 利用状態 |
| `setupCompleted` | Boolean | 必須 | 初期設定完了 |
| `paydayOfMonth` | Int | 必須 | 1-31 |
| `streakDays` | Int | 必須 | 連続記録日数キャッシュ |
| `lastRecordedAt` | DateTime? | 任意 | 最終記録日 |
| `createdAt` | DateTime | 必須 | 作成日時 |
| `updatedAt` | DateTime | 必須 | 更新日時 |

制約:

- `email` は unique
- `paydayOfMonth` は 1-31

補足:

- `streakDays` はキャッシュ値
- 連続記録は将来的に再計算可能な構造を維持する

### 4.2 Invitation

用途:

- 招待制登録

主カラム:

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `id` | String | 必須 | 主キー |
| `email` | String | 必須 | 招待対象メール |
| `token` | String | 必須 | 招待トークン |
| `status` | InvitationStatus | 必須 | 状態 |
| `expiresAt` | DateTime | 必須 | 有効期限 |
| `usedAt` | DateTime? | 任意 | 使用日時 |
| `revokedAt` | DateTime? | 任意 | 手動失効日時 |
| `invitedByUserId` | String | 必須 | 作成者 |
| `createdAt` | DateTime | 必須 | 作成日時 |
| `updatedAt` | DateTime | 必須 | 更新日時 |

制約:

- `token` unique
- `email + status=ACTIVE` の重複作成はアプリ側で抑止

### 4.3 Account

用途:

- 残高の保持
- 記録や移動の対象口座

主カラム:

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `id` | String | 必須 | 主キー |
| `userId` | String | 必須 | 所有者 |
| `name` | String | 必須 | 口座名 |
| `type` | AccountType | 必須 | 口座種別 |
| `balance` | Int | 必須 | 円単位 |
| `isPrimary` | Boolean | 必須 | デフォルト口座 |
| `sortOrder` | Int | 必須 | 並び順 |
| `createdAt` | DateTime | 必須 | 作成日時 |
| `updatedAt` | DateTime | 必須 | 更新日時 |

制約:

- `userId, name` の組み合わせは unique 推奨

補足:

- `CREDIT` の `balance` は未払い利用額
- 記録や移動が紐付く場合は削除不可

### 4.4 Category

用途:

- 収入 / 支出カテゴリ

主カラム:

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `id` | String | 必須 | 主キー |
| `userId` | String | 必須 | 所有者 |
| `name` | String | 必須 | 表示名 |
| `type` | CategoryType | 必須 | 収入か支出か |
| `icon` | String? | 任意 | 絵文字や icon key |
| `sortOrder` | Int | 必須 | 並び順 |
| `isDefault` | Boolean | 必須 | 初期カテゴリ由来か |
| `createdAt` | DateTime | 必須 | 作成日時 |
| `updatedAt` | DateTime | 必須 | 更新日時 |

制約:

- `userId, type, name` unique 推奨

削除ルール:

- 既存記録が紐付くカテゴリは削除可だが、削除時は記録側の `categoryId` を `null` にするか、アプリ側で削除不可にする
- v1 は安全側で「記録に使われていたら削除不可」を推奨

### 4.5 Goal

用途:

- 貯金目標の管理

主カラム:

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `id` | String | 必須 | 主キー |
| `userId` | String | 必須 | 所有者 |
| `title` | String | 必須 | 目標名 |
| `targetAmount` | Int | 必須 | 目標額 |
| `deadline` | DateTime? | 任意 | 期限 |
| `note` | String? | 任意 | 補足 |
| `visualCategory` | GoalVisualCategory | 必須 | 画像カテゴリ |
| `visualSubcategory` | String | 必須 | 画像サブカテゴリ |
| `visualTheme` | GoalVisualTheme | 必須 | 画像テーマ |
| `visualLocked` | Boolean | 必須 | 手動固定か |
| `isArchived` | Boolean | 必須 | 非表示化用 |
| `createdAt` | DateTime | 必須 | 作成日時 |
| `updatedAt` | DateTime | 必須 | 更新日時 |

制約:

- `targetAmount > 0`

補足:

- `currentAmount` は持たない
- `visualLocked = false` のときは AI 再分類を許可できる

### 4.6 GoalVisualAsset

用途:

- 目標進捗画像のアセット定義

主カラム:

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `id` | String | 必須 | 主キー |
| `category` | GoalVisualCategory | 必須 | 画像カテゴリ |
| `subcategory` | String | 必須 | 画像サブカテゴリ |
| `theme` | GoalVisualTheme | 必須 | テーマ |
| `step` | Int | 必須 | 1-5 |
| `imagePath` | String | 必須 | 画像パス |
| `altText` | String | 必須 | 代替テキスト |
| `headlineText` | String | 必須 | 画像に添える短い文 |
| `createdAt` | DateTime | 必須 | 作成日時 |
| `updatedAt` | DateTime | 必須 | 更新日時 |

制約:

- `step` は 1-5
- `category, subcategory, theme, step` unique

補足:

- 達成時は別画像を持ってもよいが、v1 は `step = 5` + UI 演出で代替可能
- `headlineText` はホームの注目目標カードで画像の近くに表示する
- 例: `旅行の準備をしよう`

### 4.7 GoalRecord

用途:

- 目標への積立履歴

主カラム:

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `id` | String | 必須 | 主キー |
| `goalId` | String | 必須 | 対象目標 |
| `userId` | String | 必須 | 所有者 |
| `dailyRecordId` | String? | 任意 | 元の貯金記録 |
| `amount` | Int | 必須 | 積立額 |
| `recordDate` | DateTime | 必須 | 実行日 |
| `periodId` | String | 必須 | 給料日基準期間 |
| `createdAt` | DateTime | 必須 | 作成日時 |
| `updatedAt` | DateTime | 必須 | 更新日時 |

制約:

- `amount > 0`

補足:

- `dailyRecordId` を持たせることで、貯金記録編集時の追跡がしやすい

### 4.8 DailyRecord

用途:

- 収入、支出、貯金の本体記録

主カラム:

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `id` | String | 必須 | 主キー |
| `userId` | String | 必須 | 所有者 |
| `accountId` | String | 必須 | 対象口座 |
| `categoryId` | String? | 任意 | 対象カテゴリ |
| `goalId` | String? | 任意 | 貯金時の対象目標 |
| `type` | RecordType | 必須 | 記録種別 |
| `amount` | Int | 必須 | 金額 |
| `memo` | String? | 任意 | メモ |
| `recordDate` | DateTime | 必須 | 記録日 |
| `periodId` | String | 必須 | 給料日基準期間 |
| `createdAt` | DateTime | 必須 | 作成日時 |
| `updatedAt` | DateTime | 必須 | 更新日時 |

制約:

- `amount > 0`
- `goalId` は `type = SAVING` のときだけ使用
- `categoryId` は `INCOME` / `EXPENSE` で任意

### 4.9 AccountTransfer

用途:

- 口座間移動

主カラム:

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `id` | String | 必須 | 主キー |
| `userId` | String | 必須 | 所有者 |
| `fromAccountId` | String | 必須 | 移動元 |
| `toAccountId` | String | 必須 | 移動先 |
| `amount` | Int | 必須 | 金額 |
| `memo` | String? | 任意 | メモ |
| `recordDate` | DateTime | 必須 | 移動日 |
| `periodId` | String | 必須 | 給料日基準期間 |
| `createdAt` | DateTime | 必須 | 作成日時 |
| `updatedAt` | DateTime | 必須 | 更新日時 |

制約:

- `amount > 0`
- `fromAccountId != toAccountId`

### 4.10 ImpulseItem

用途:

- 衝動買い待機と判定

主カラム:

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `id` | String | 必須 | 主キー |
| `userId` | String | 必須 | 所有者 |
| `name` | String | 必須 | 商品名 |
| `price` | Int | 必須 | 価格 |
| `message` | String? | 任意 | 補足メッセージ |
| `status` | ImpulseStatus | 必須 | 状態 |
| `createdAt` | DateTime | 必須 | 登録日時 |
| `decisionAt` | DateTime? | 任意 | 判定日時 |
| `updatedAt` | DateTime | 必須 | 更新日時 |

制約:

- `price > 0`

### 4.11 AIAnalysis

用途:

- 月ごとの AI 分析結果保存

主カラム:

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `id` | String | 必須 | 主キー |
| `userId` | String | 必須 | 所有者 |
| `targetMonth` | String | 必須 | `YYYY-MM` |
| `periodId` | String | 必須 | 対象期間基準 |
| `content` | String | 必須 | 分析本文 |
| `generatedAt` | DateTime | 必須 | 生成日時 |
| `createdAt` | DateTime | 必須 | 作成日時 |
| `updatedAt` | DateTime | 必須 | 更新日時 |

制約:

- `userId, targetMonth` unique

### 4.12 SystemConfig

用途:

- システム共通設定

設計方針:

- 小規模構成なので key-value で持つ
- Prisma では 1 テーブル 1 レコード 1 設定でもよい

推奨カラム:

| カラム | 型 | 必須 | 内容 |
|---|---|---|---|
| `key` | String | 必須 | 主キー |
| `value` | String | 必須 | 値 |
| `updatedAt` | DateTime | 必須 | 更新日時 |

主なキー:

- `app_name`
- `default_payday`
- `smtp_host`
- `smtp_port`
- `smtp_user`
- `smtp_pass`
- `smtp_from`
- `openai_api_key`

## 5. リレーション

### 5.1 User 中心

- `User` 1:N `Account`
- `User` 1:N `Category`
- `User` 1:N `Goal`
- `User` 1:N `DailyRecord`
- `User` 1:N `AccountTransfer`
- `User` 1:N `ImpulseItem`
- `User` 1:N `AIAnalysis`
- `User` 1:N `Invitation`

### 5.2 Goal 系

- `Goal` 1:N `GoalRecord`
- `GoalVisualAsset` は画像セットの辞書テーブルとして持つ
- `Goal` 自体には `visualCategory` `visualSubcategory` `visualTheme` を保持する
- `DailyRecord` 0..1 : N `GoalRecord` ではなく、実装は `GoalRecord.dailyRecordId` で 1 対 0..1 を推奨

### 5.3 Account 系

- `Account` 1:N `DailyRecord`
- `Account` 1:N `AccountTransfer` as `fromAccount`
- `Account` 1:N `AccountTransfer` as `toAccount`

## 6. インデックス方針

最低限必要:

- `User.email`
- `Invitation.token`
- `Invitation.email`
- `Account.userId`
- `Category.userId, type`
- `Goal.userId`
- `Goal.visualCategory, Goal.visualSubcategory, Goal.visualTheme`
- `DailyRecord.userId, recordDate`
- `DailyRecord.userId, periodId`
- `AccountTransfer.userId, recordDate`
- `GoalRecord.goalId, periodId`
- `ImpulseItem.userId, status`
- `AIAnalysis.userId, targetMonth`

## 7. 削除ルール

- `User` 削除は原則 v1 では物理削除せず `status = SUSPENDED`
- `Account` は記録や移動がある場合削除不可
- `Category` は使用中なら削除不可
- `Goal` は削除可。ただし関連 `GoalRecord` は cascade delete
- `Invitation` は物理削除不要。状態更新で管理

## 8. トランザクション設計

### 8.1 DailyRecord 作成

1. `periodId` 計算
2. `DailyRecord` 作成
3. `Account.balance` 更新
4. `type = SAVING` かつ `goalId` があれば `GoalRecord` 作成
5. 必要なら `User.lastRecordedAt` `streakDays` 更新

### 8.2 DailyRecord 編集

1. 旧記録取得
2. 旧記録による残高影響を打ち消す
3. 旧 `GoalRecord` を削除または更新
4. 新内容で `DailyRecord` 更新
5. 新内容で残高反映
6. 新しい `GoalRecord` を作成または更新

### 8.3 DailyRecord 削除

1. 対象記録取得
2. 残高への影響を逆方向に反映
3. 関連 `GoalRecord` 削除
4. `DailyRecord` 削除

### 8.4 AccountTransfer 作成

1. `periodId` 計算
2. 移動元残高減算
3. 移動先残高加算
4. `AccountTransfer` 作成

### 8.5 AccountTransfer 編集 / 削除

- 旧移動をいったん戻してから、新内容を適用する

## 9. `periodId` 計算ルール

### 9.1 基本

- フォーマットは `YYYY-MM-DD`
- ユーザーの `paydayOfMonth` を基準に算出
- 該当月にその日がない場合は末日に丸める

### 9.2 実装上の補助関数

必要関数:

- `getEffectivePayday(year, month, paydayOfMonth): number`
- `getPeriodId(date, paydayOfMonth): string`
- `getPeriodRange(periodId): { start, end }`

## 10. Prisma 実装時の注意

- `Decimal` は使わず `Int` で統一
- `Date` 文字列は API 層で `YYYY-MM-DD` を受け、サーバーで `DateTime` 化する
- `SystemConfig` の秘密値は API レスポンスでそのまま返しすぎない
- `smtp_pass` と `openai_api_key` はマスク返却を検討する

## 11. 初期データ

セットアップ直後に必要:

- 管理者ユーザー 1 件
- `SystemConfig.app_name`
- デフォルト給料日

一般ユーザー登録直後に必要:

- 収入カテゴリ初期セット
- 支出カテゴリ初期セット

画像アセット初期データ:

- 各 `category/subcategory/theme/step` の画像パス
- 各 `category/subcategory/theme/step` の `headlineText`
- `other/generic` の 1-5
- `default_generic_complete`

## 12. 将来拡張を見越した余白

- 通知購読テーブル
- AI 相談履歴テーブル
- メール送信履歴テーブル
- 監査ログテーブル

これらは v1 では作らない。
