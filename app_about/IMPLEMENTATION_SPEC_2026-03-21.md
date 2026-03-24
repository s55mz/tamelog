# TameLog — 開発向け実装仕様書

更新日: 2026-03-21

関連文書:

- [ui.md](/Users/soramizukuki/projects/tamelog/app_about/ui.md)
- [server.md](/Users/soramizukuki/projects/tamelog/app_about/server.md)

---

## 0. 目的

この仕様書は、TameLog の次フェーズ開発を実装可能な粒度に落としたものです。

今回の方針は次の 3 点です。

1. 家計簿としての正式記録は 1 件ずつ残す
2. 入力ソースはメール / VPN / OCR / 手動入力に広げる
3. ただし正式記帳前に「候補キュー」を挟み、ユーザー確認を必須にする

要するに、

> 手入力中心の家計簿アプリ
> から
> 候補確認中心の家計簿アプリ

へ移行する。

---

## 1. スコープ

### 1.1 今回やること

- 候補キューの追加
- 候補インボックス UI
- クイック記録シート
- メール受信基盤 MVP
- VPN イベントの候補化
- 候補確認からの正式記帳

### 1.2 今回やらないこと

- 銀行 API / カード API の直接連携
- AI による完全自動記帳
- ネイティブアプリ化2
- IMAP クライアント向けのフルメールボックス提供

---

## 2. プロダクト要件

### 2.1 最重要 UX 要件

- ユーザーは毎回「何を記録すべきか」を思い出さなくてよい
- ホームには「今日やるべきこと」が 1 つ出る
- 候補は 1 件ずつ確定できる
- 手動入力は 10 秒以内で終わる

### 2.2 正式記帳の要件

- 正式帳簿は既存の `DailyRecord` / `AccountTransfer` を使う
- 候補と正式記録は分ける
- 候補は正式記帳前に必ず確認できる
- 候補ソースを追跡できる

---

## 3. 開発の中心概念

### 3.1 正式記録

- `DailyRecord`
- `AccountTransfer`
- `GoalRecord`

### 3.2 候補

正式記帳前の中間状態。

ソース例:

- メール通知
- VPN ブロック / 警告イベント
- OCR 読み取り結果
- 手動下書き

### 3.3 ソース監査

候補は必ず「何から作られたか」を持つ。

例:

- `MAIL`
- `VPN`
- `OCR`
- `MANUAL`

---

## 4. DB 変更仕様

Prisma に以下のモデルを追加する。

### 4.1 enum 追加

```prisma
enum CandidateSourceType {
  MAIL
  VPN
  OCR
  MANUAL
}

enum CandidateType {
  EXPENSE
  INCOME
  TRANSFER
  SAVING
  IMPULSE
  EVENT
}

enum CandidateStatus {
  PENDING
  NEEDS_INPUT
  DEFERRED
  CONFIRMED
  IGNORED
  EXPIRED
}

enum CandidateConfidence {
  HIGH
  MEDIUM
  LOW
}

enum InboundMailboxStatus {
  ACTIVE
  DISABLED
}

enum InboundMessageParseStatus {
  RECEIVED
  PARSED
  FAILED
  DUPLICATE
}
```

### 4.2 `InboundMailbox`

用途:

- ユーザーごとの受信先メールアドレスを管理

想定:

```prisma
model InboundMailbox {
  id        String               @id @default(cuid())
  userId    String               @unique
  address   String               @unique
  token     String               @unique
  status    InboundMailboxStatus @default(ACTIVE)
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt

  user      User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages   InboundMessage[]
}
```

### 4.3 `InboundMessage`

用途:

- 受信した生メールの保管
- 再解析
- 監査

想定:

```prisma
model InboundMessage {
  id            String                    @id @default(cuid())
  mailboxId     String
  sourceType    String
  fromAddress   String
  subject       String
  messageId     String?
  receivedAt    DateTime
  rawText       String?
  rawHtml       String?
  rawHeaders    Json?
  parsedJson    Json?
  parseStatus   InboundMessageParseStatus @default(RECEIVED)
  parseError    String?
  createdAt     DateTime                  @default(now())
  updatedAt     DateTime                  @updatedAt

  mailbox       InboundMailbox            @relation(fields: [mailboxId], references: [id], onDelete: Cascade)
  candidates    ActionCandidate[]

  @@index([mailboxId, receivedAt])
  @@index([messageId])
}
```

### 4.4 `ActionCandidate`

用途:

- 正式記帳前の候補キュー

想定:

```prisma
model ActionCandidate {
  id                  String              @id @default(cuid())
  userId              String
  sourceType          CandidateSourceType
  sourceRefId         String?
  candidateType       CandidateType
  status              CandidateStatus     @default(PENDING)
  confidence          CandidateConfidence @default(LOW)
  occurredAt          DateTime
  amount              Int?
  currency            String?             @default("JPY")
  merchantRaw         String?
  merchantNormalized  String?
  title               String
  memoDraft           String?
  direction           String?
  accountId           String?
  categoryId          String?
  goalId              String?
  needsUserInput      Boolean             @default(false)
  aiSummary           String?
  aiExtractedJson     Json?
  confirmedRecordId   String?
  confirmedTransferId String?
  ignoredReason       String?
  deferredUntil       DateTime?
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  account     Account?        @relation(fields: [accountId], references: [id], onDelete: SetNull)
  category    Category?       @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  goal        Goal?           @relation(fields: [goalId], references: [id], onDelete: SetNull)
  inboxMessage InboundMessage? @relation(fields: [sourceRefId], references: [id], onDelete: SetNull)

  @@index([userId, status, occurredAt])
  @@index([userId, sourceType])
}
```

### 4.5 `CandidateResolutionLog`

用途:

- 誰が何をどう確定 / 無視したかの履歴

```prisma
model CandidateResolutionLog {
  id           String   @id @default(cuid())
  candidateId   String
  userId       String
  action       String
  payloadJson  Json?
  createdAt    DateTime @default(now())
}
```

---

## 5. メール受信方式

### 5.1 結論

メールは **フルメールサーバー** としては作らない。
**受信専用ゲートウェイ** として構築する。

### 5.2 採用構成

```text
MX: inbox.finance-pro.space
  -> same VPS
  -> Postfix (inbound only)
  -> virtual alias / pipe transport
  -> tamelog-mail-ingest worker
  -> DB保存 + 候補生成
```

### 5.3 採用理由

- IMAP 提供が不要
- 送信機能が不要
- ユーザーは「転送するだけ」でよい
- VPS 1 台でも運用可能

### 5.4 非採用

- Dovecot を含むフルメールボックス
- 各ユーザーにログインさせるメール UI
- 受信メールをそのままユーザーに読ませる設計

### 5.5 実装構成

#### DNS

- `inbox.finance-pro.space` に A レコード
- `MX inbox.finance-pro.space`
- PTR はできれば設定

#### Postfix

用途は inbound only。

必要設定:

- `mydestination` は絞る
- `virtual_alias_maps` を使う
- 受信後は local mailbox に残さず pipe で worker に渡す
- relay させない

#### 受信アドレス形式

初期案:

- `mail+<token>@inbox.finance-pro.space`

または

- `<token>@inbox.finance-pro.space`

推奨:

- `<token>@inbox.finance-pro.space`

理由:

- 銀行側の転送設定で扱いやすい
- plus addressing 非対応のサービスを避けられる

#### 受信フロー

```text
SMTP受信
  -> Postfix
  -> token から mailbox 特定
  -> worker へ raw MIME を渡す
  -> InboundMessage 保存
  -> parse job enqueue
```

### 5.6 worker 実装

新規プロセス:

- `tamelog-mail-ingest`

役割:

- stdin で受けた raw MIME を保存
- envelope recipient から mailbox を特定
- parse queue へ積む

Node 実装で十分。

ライブラリ候補:

- `mailparser`

---

## 6. メール解析仕様

### 6.1 基本方針

ルールベース優先、AI 補助は後段。

順序:

1. 送信元判定
2. 件名判定
3. regex で金額 / 日時 / 店舗抽出
4. 足りない場合のみ AI 補助

### 6.2 対応レベル

#### レベルA: 高信頼

条件:

- 金額あり
- 日時あり
- 利用先または摘要あり

結果:

- `ActionCandidate(status=PENDING, confidence=HIGH)`

#### レベルB: 中信頼

条件:

- 取引発生はわかる
- 金額が欠ける or 店舗が弱い

結果:

- `ActionCandidate(status=NEEDS_INPUT, confidence=MEDIUM, needsUserInput=true)`

#### レベルC: 低信頼

条件:

- 何か起きたことしかわからない

結果:

- 候補化するが確定不可
- インボックス表示のみ

### 6.3 オーソリ通知の扱い

重要:

- オーソリ通知は正式記帳に直結させない
- `暫定候補` として扱う
- 後続の確定明細メールが来たら統合できる構造にする

必要な追加項目:

- `authorizationCode`
- `merchantRaw`
- `isProvisional`

### 6.4 送信元別 parser

初期はコードにハードコードでよい。

構成案:

```text
server/src/lib/mail/
  index.ts
  detectSource.ts
  parsers/
    sbiDebit.ts
    sbiDeposit.ts
    genericForward.ts
```

戻り値:

```ts
type ParsedMailCandidate = {
  sourceType: "BANK_MAIL" | "CARD_MAIL" | "GENERIC";
  title: string;
  occurredAt?: string;
  amount?: number;
  currency?: string;
  merchantRaw?: string;
  provisional?: boolean;
  candidateType?: "EXPENSE" | "INCOME" | "EVENT";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  needsUserInput: boolean;
  rawSummary: string;
};
```

---

## 7. AI 補助仕様

### 7.1 AI を使う場面

- 店舗名の正規化
- カテゴリ推定
- 候補一覧の短い要約
- regex で拾えなかった補助抽出

### 7.2 AI に渡す入力

- 件名
- text body の主要部分
- parser の一次抽出結果
- ユーザーのカテゴリ一覧

### 7.3 AI の出力

```json
{
  "merchant_normalized": "Suica",
  "suggested_category_name": "交通費",
  "candidate_type": "EXPENSE",
  "confidence": "high",
  "summary": "交通系の少額支出候補です"
}
```

### 7.4 AI の制約

- 金額を「推測だけ」で埋めない
- 複数取引を勝手に 1 件へまとめない
- 自動確定しない

---

## 8. VPN 候補化仕様

### 8.1 現状

`/api/vpn/internal/block-notify` は push を送るだけ。

### 8.2 修正

push 前に `ActionCandidate` を作成する。

候補例:

```text
sourceType: VPN
candidateType: IMPULSE
title: "ECサイトへのアクセス"
status: PENDING
confidence: MEDIUM
needsUserInput: true
```

### 8.3 UI 操作

- `買った`
- `見送った`
- `24時間保留`

`買った` の場合:

- 金額入力
- 種別は `EXPENSE`
- 正式記帳

`見送った` の場合:

- 候補を `IGNORED` ではなく `resolved: skipped` 相当で履歴化してよい

---

## 9. API 変更仕様

### 9.1 候補 API

#### `GET /api/candidates`

クエリ:

- `status`
- `sourceType`
- `limit`

返却:

- 候補一覧
- `summary`
- `counts`

#### `GET /api/candidates/:id`

返却:

- 候補詳細
- ソース情報
- AI提案
- 修正用初期値

#### `POST /api/candidates/:id/confirm`

入力:

- `recordType`
- `amount`
- `accountId`
- `categoryId`
- `memo`
- `recordDate`
- `goalId`

動作:

- `DailyRecord` または `AccountTransfer` を作成
- 候補を `CONFIRMED`
- resolution log 追加

#### `POST /api/candidates/:id/defer`

入力:

- `deferredUntil`

#### `POST /api/candidates/:id/ignore`

入力:

- `reason`

### 9.2 メール受信 API

#### `POST /internal/mail/inbound`

用途:

- mail ingest worker 専用

認証:

- internal secret

入力:

- `recipient`
- `rawMime`
- `headers`

### 9.3 設定 API

#### `GET /api/users/me/mailbox`

返却:

- `address`
- `status`
- `receivedCount7d`
- `candidateCount7d`

#### `POST /api/users/me/mailbox/regenerate`

用途:

- 受信アドレス再発行

---

## 10. フロントエンド変更仕様

### 10.1 Bottom Navigation

現行:

- ホーム
- 家計簿
- 記録
- AI
- その他

変更後:

- ホーム
- インボックス
- `+`
- 家計簿
- その他

### 10.2 新規ページ

#### `InboxPage`

表示:

- 今日の未整理件数
- AI要約
- `要確認`
- `保留中`
- `最近確定`

#### `CandidateReviewSheet`

表示:

- 候補の主要情報
- 修正可能項目
- `確定`
- `あとで`
- `無視`

#### `MailboxSettingsSection`

表示:

- 専用受信アドレス
- コピー
- 再発行
- 転送ガイド

### 10.3 既存ページ修正

#### Home

- 最上段を `今日やること` に変更
- 未整理件数を最優先表示
- 今日の候補プレビューを出す

#### Record

- ページ本体より `QuickRecordSheet` へ主導線を移す

#### Ledger

- 正式に確定した記録のみ表示
- 候補は表示しない

#### Settings

- メール取込セクション追加
- 候補通知設定追加

---

## 11. リリース順

### Phase 1

- DB に `ActionCandidate`
- 候補 API
- Inbox UI
- VPN 候補化

### Phase 2

- クイック記録シート
- Home 再設計

### Phase 3

- `InboundMailbox`
- Postfix inbound only
- raw mail 保存
- parser MVP

### Phase 4

- AI 補助
- Settings の mailbox UI
- 夜のまとめ通知

### Phase 5

- オーソリ通知と確定通知のマッチング
- source trace 表示

---

## 12. 受け入れ条件

### 候補キュー

- VPN イベントから候補が作られる
- 候補を確定すると正式記帳が作られる
- 候補を無視 / 保留できる

### メール

- 受信専用アドレスがユーザーごとに発行される
- 転送メール 1 通から `InboundMessage` が保存される
- 高信頼メールは候補化される
- 金額不明メールは `needsUserInput=true` で候補化される

### UI

- ホームで未整理件数が見える
- 候補インボックスから 1 件確定できる
- 手動記録はページ遷移なしでできる

---

## 13. 最初に着手すべき実装

優先順位はこれで固定してよい。

1. Prisma に `ActionCandidate` 系を追加
2. `GET /api/candidates` と `POST /api/candidates/:id/confirm`
3. `InboxPage` と `CandidateReviewSheet`
4. VPN の `block-notify` から候補を作る
5. `QuickRecordSheet`
6. `InboundMailbox` と受信アドレス UI
7. Postfix inbound only
8. メール parser MVP

この順なら、メール基盤が完成する前でも、
候補中心 UX を先に成立させられる。





┌────────┬──────────┬─────────────────────────┬────────┐                
  │ タイプ │ ホスト名 │           値            │ 優先度 │
  ├────────┼──────────┼─────────────────────────┼────────┤                
  │ A      │ inbox    │ 160.251.203.86          │ —      │  
  ├────────┼──────────┼─────────────────────────┼────────┤                
  │ MX     │ inbox    │ inbox.finance-pro.space │ 10     │                
  └────────┴──────────┴─────────────────────────┴────────┘   