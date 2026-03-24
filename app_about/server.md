# TameLog — サーバー再設計メモ

更新日: 2026-03-21

---

## 0. この文書の目的

この文書は、現在の VPS 構成メモを土台にしつつ、
**今後の TameLog サーバーが何を担うべきか**を整理し直したものです。

前提は以下です。

- 家計簿アプリとして、最終的な記録は 1 件ずつ持ちたい
- 銀行 API / カード API の本格自動連携は現実的に難しい
- クライアントは Web / PWA 前提
- VPN / Web Push / OCR / AI はすでに資産としてある
- ユーザーに「毎回アプリを開いて手入力」を強いる設計は継続しにくい

結論として、サーバーの中心責務は次の形に寄せる。

> 正式な家計簿レコードを保存する前に、
> 外部イベントをいったん「候補」として受け取り、
> AI と最小確認で 1 件ずつ確定させる

---

## 1. サーバーの役割

今後の TameLog サーバーは、単なる API サーバーではなく次の 5 層を持つ。

1. 通常アプリ API
2. VPN / フィルタリング基盤
3. 通知基盤
4. メール受信ゲートウェイ
5. 候補整理・確定記帳パイプライン

現在すでに 1, 2, 3 は一部実装済みで、4, 5 を追加するのが本設計の中心。

---

## 2. 現状認識

### 2.1 すでにあるもの

- Web フロント配信
- Node / Hono API
- PostgreSQL + Prisma
- Web Push
- OCR
- AI レポート / AI 相談
- VPN クライアント配布
- ブロック通知

コードベース上も、家計簿本体の主要モデルはすでにある。

- `DailyRecord`
- `AccountTransfer`
- `GoalRecord`
- `PushSubscription`
- `VpnClient`
- `ImpulseItem`

[schema.prisma](/Users/soramizukuki/projects/tamelog/prisma/schema.prisma)

### 2.2 今の課題

- 手入力前提だと継続しにくい
- メール通知は取引発生のヒントにはなるが、そのまま正式記帳には使えない
- オーソリ段階の通知は後で金額や加盟店名が変わることがある
- 入出金通知には金額がないケースがある
- VPN 由来のイベント、メール由来のイベント、手動入力が別々に存在している

つまり、今の問題は「どう自動記帳するか」ではなく、
**どうやって記録候補を取りこぼさず集めるか**である。

---

## 3. 設計方針

### 3.1 正式帳簿と入力ソースを分離する

正式な家計簿データは、従来どおり `DailyRecord` / `AccountTransfer` を正とする。

ただし、そこへ直接書き込むのは次の 2 系統だけに限定する。

- ユーザーが明示的に手動保存したもの
- 候補をユーザーが確定したもの

メール、VPN、OCR、AI はすべて「候補生成側」で使う。

### 3.2 AI は補助役に限定する

AI の役割は次に絞る。

- メール本文の構造化補助
- カテゴリ推定
- 店舗名の正規化
- 候補の要約
- 重複候補の関連付け補助

AI に任せないもの:

- 正式金額の最終決定
- 確定記帳の自動実行
- 複数取引の完全自動分割

### 3.3 ユーザーには「確認」だけを求める

サーバーは入力を減らす。
クライアントは「ゼロから書かせる」のではなく、候補を見せて確定させる。

理想の体験:

- 通知や転送メールで候補ができる
- ユーザーは金額や分類を少し直す
- 1 件ずつ正式記帳される

---

## 4. 目指す全体構成

```text
Internet
  |
  +-- Cloudflare Tunnel / nginx
  |     -> frontend
  |     -> /api/* -> Node API
  |
  +-- SMTP inbound (new)
  |     -> user-specific alias
  |     -> mail ingest worker
  |
  +-- Web Push
  |
  +-- IKEv2/IPsec VPN
        -> DNS filter
        -> block notify

Node API / Worker responsibilities:
  - auth / dashboard / records / goals / chat
  - vpn device/profile management
  - inbound mail parsing
  - candidate generation
  - AI-assisted extraction / normalization
  - candidate confirmation -> final bookkeeping record

Database:
  - existing bookkeeping tables
  - new inbound mail / candidate tables
  - event-source audit trail
```

---

## 5. 主要コンポーネント

### 5.1 通常アプリ API

既存の Hono API を継続利用する。

主な責務:

- 認証
- ダッシュボード
- 記録作成 / 更新 / 削除
- 目標管理
- AI 相談
- 分析
- 通知購読
- VPN 管理

### 5.2 VPN / ブロック通知

VPN は今後も「記帳」ではなく「行動イベントの発火源」として使う。

すでに `block-notify` はあるため、ここから候補生成へ接続できる。

現状:

- ブロック時に push 送信可能
- 家計状況に応じて文面を変えている

[vpn.ts](/Users/soramizukuki/projects/tamelog/server/src/routes/vpn.ts#L392)

今後:

- push だけで終わらせず、`ActionCandidate` を作る
- 種別は `BLOCKED_ACCESS`, `EC_ATTEMPT`, `PAYMENT_ATTEMPT` など
- ユーザーが後で `買った / 見送った / 保留` を選べるようにする

### 5.3 メール受信ゲートウェイ

新規追加する中核コンポーネント。

役割:

- ユーザーごとの受信アドレスを発行
- 銀行 / カード / 決済通知メールを受信
- 生メールを保存
- パーサへ渡す

ここで重要なのは、**メールサーバー全体を重く運用しすぎないこと**。

初期方針:

- 送信専用基盤とは分離
- 受信専用サブドメインを使う
- 各ユーザーに専用 alias を発行
- 受信時は mailbox 保管よりアプリへの取り込みを優先

例:

- `u_xxx@inbox.finance-pro.space`
- `mail+<token>@inbox.finance-pro.space`

### 5.4 候補整理パイプライン

メールや VPN や OCR 由来のイベントを、正式帳簿へ入れる前に処理する。

処理段階:

1. 受信
2. 正規化
3. 候補生成
4. AI 補助
5. ユーザー確認
6. 正式記帳

---

## 6. 新しいデータモデル

既存の `DailyRecord` / `AccountTransfer` は維持する。
その前段に、次のモデルを追加する。

### 6.1 `InboundMailbox`

ユーザーごとの受信口。

用途:

- どのメールアドレスがどのユーザーに紐づくか
- 有効 / 無効
- 送信元ホワイトリストの管理

想定カラム:

- `id`
- `userId`
- `address`
- `token`
- `status`
- `createdAt`
- `updatedAt`

### 6.2 `InboundMessage`

受信した生メールの保存先。

用途:

- 監査
- 再解析
- AI の失敗時の再試行

想定カラム:

- `id`
- `mailboxId`
- `messageId`
- `from`
- `subject`
- `receivedAt`
- `rawText`
- `rawHtml`
- `headersJson`
- `sourceType` (`BANK_MAIL`, `CARD_MAIL`, `MANUAL_FORWARD` など)
- `parseStatus`

### 6.3 `ActionCandidate`

正式記帳前の候補。

これが今回の主役。

想定カラム:

- `id`
- `userId`
- `sourceType`
- `sourceRefId`
- `candidateType`
- `status`
- `occurredAt`
- `direction` (`INCOME`, `EXPENSE`, `TRANSFER`, `UNKNOWN`)
- `amount`
- `currency`
- `merchantRaw`
- `merchantNormalized`
- `memoDraft`
- `categoryId`
- `accountId`
- `confidence`
- `needsUserInput`
- `confirmedRecordId`
- `confirmedTransferId`
- `ignoredReason`
- `createdAt`
- `updatedAt`

### 6.4 `CandidateResolutionLog`

候補がどう確定 / 修正 / 無視されたかの履歴。

用途:

- 誤判定の分析
- AI 改善
- サポート調査

### 6.5 `ParsingRule`

銀行ごとのルールベース抽出定義。

用途:

- 正規表現や送信元ルールを DB 管理
- 銀行やカード会社のメールフォーマット変更に追従

---

## 7. 入力ソース別の扱い

### 7.1 メール通知

メールは「正式記帳」ではなく「候補生成」に使う。

扱いは 3 段階に分ける。

#### A. 金額あり + 加盟店あり

例:

- デビット利用通知
- カード利用通知

この場合:

- `EXPENSE` 候補を自動生成
- ただし `UNCONFIRMED` 状態
- 「未確定利用」のフラグを持たせる

#### B. 取引発生のみわかる

例:

- 振込入金がありました
- 出金がありました
- 口座引落がありました

この場合:

- 正式記帳しない
- `needsUserInput = true` の候補だけ作る
- UI では「金額だけ入れて確定してください」にする

#### C. 情報が曖昧

この場合:

- 候補化はするが低信頼度
- 自動記帳禁止
- 通知または候補一覧にだけ出す

### 7.2 VPN イベント

VPN は支出そのものではなく「浪費行動の兆候」として扱う。

例:

- EC サイトへのアクセス
- 決済サイトへのアクセス
- ブロックされたアクセス

この場合:

- `ActionCandidate` を作る
- 直接 `DailyRecord` は作らない
- 「買った / 見送った / 保留」で後から評価する

### 7.3 手動入力 / OCR

これは従来どおり即時記帳可能。

ただし将来的には、OCR も内部的には候補経由に寄せてもよい。

---

## 8. AI の役割

### 8.1 ルールベースを先に使う

メール処理は必ず次の順で行う。

1. 送信元判定
2. ルールベース抽出
3. 足りない部分だけ AI 補助

理由:

- 金額抽出は deterministic にしたい
- AI だけで全抽出すると監査性が弱い
- コストも上がる

### 8.2 AI がやること

- メール本文から候補メモを整える
- `SUICA MOBILE PAYMENT` を交通系候補に寄せる
- 送信元ごとの文面差分を吸収する
- 「これは未確定利用通知っぽい」などの判定補助
- 候補一覧の要約

### 8.3 AI 出力の保存

推奨:












- 抽出 JSON
PC
- reasoning の短い要約
- version
- promptTemplateVersion

を保存して、後から追跡できるようにする。

---

## 9. 候補から正式記帳までの流れ

### 9.1 メール経由

```text
銀行/カード通知メール受信
  -> InboundMessage 保存
  -> ルールベース抽出
  -> 必要時 AI 補助
  -> ActionCandidate 作成
  -> push / UI で確認依頼
  -> user confirms
  -> DailyRecord or AccountTransfer 作成
```

### 9.2 VPN 経由

```text
VPN blocked / warned event
  -> ActionCandidate 作成
  -> push
  -> user chooses:
       - 買った
       - 見送った
       - 24時間保留
  -> 必要時のみ DailyRecord 化
```

### 9.3 夜のまとめ確認

```text
scheduled job
  -> 未整理候補を集計
  -> 1件ずつではなく要約を作る
  -> push "今日の未整理 3 件"
  -> 候補確認画面へ誘導
```

---

## 10. API 追加方針

### 10.1 受信系

- `POST /api/mail/inbound`
  - SMTP 受信ワーカー内部用
- `POST /api/mail/parse/:id`
  - 再解析用

### 10.2 候補系

- `GET /api/candidates`
- `GET /api/candidates/:id`
- `POST /api/candidates/:id/confirm`
- `POST /api/candidates/:id/ignore`
- `POST /api/candidates/:id/defer`
- `POST /api/candidates/:id/convert-to-record`

### 10.3 管理系

- `GET /api/admin/mailboxes`
- `POST /api/admin/mailboxes`
- `GET /api/admin/inbound-messages`
- `GET /api/admin/candidate-stats`
- `POST /api/admin/parsing-rules`

---

## 11. 運用構成の考え方

### 11.1 単一ホスト継続は可能

現時点では 1 台構成を維持してよい。

この VPS はすでに次を兼務している。

1. Web 配信
2. API
3. PostgreSQL
4. VPN
5. DNS フィルタ
6. Web Push

ここにメール受信まで載せること自体は可能。

### 11.2 ただし責務分離は意識する

同一ホストでも、プロセス責務は分ける。

- `tamelog-api`
- `tamelog-mail-ingest`
- `tamelog-candidate-worker`
- `tamelog-dns`
- `tamelog-block-https`

### 11.3 現在のホスト構成メモ

現行構成の要点だけ残す。

- 公開入口は Cloudflare Tunnel + nginx
- API は Node / Hono + Prisma
- DB は PostgreSQL
- VPN は strongSwan IKEv2
- DNS フィルタと block-notify が存在
- WebClip 付き mobileconfig を生成している

[vpn.ts](/Users/soramizukuki/projects/tamelog/server/src/routes/vpn.ts#L140)

---

## 12. 実装優先順位

### Phase 1: 候補キュー導入

最優先。

- `ActionCandidate` モデル追加
- 候補一覧 API
- 確定 / 無視 / 保留 API
- VPN イベントから候補作成

### Phase 2: メール受信 MVP

- 受信専用アドレス発行
- 生メール保存
- 送信元別の基本パーサ
- 金額あり通知だけ候補化

### Phase 3: AI 補助

- 店舗名正規化
- カテゴリ推定
- 要約生成
- 重複候補の関連付け

### Phase 4: 夜のまとめ確認

- 未整理候補集計ジョブ
- push で再確認
- 候補数 badge / ホーム導線

### Phase 5: 明細確定との突合

- 未確定通知と確定通知のマッチング
- 仮候補の更新
- 二重記帳防止

---

## 13. 重要な判断

### 採用する

- 1 件ずつの正式記帳
- メール受信を入力チャネルにする
- AI を補助に使う
- 候補キューを正式な前段に置く

### 採用しない

- 銀行 API 前提の設計
- AI 完全自動記帳
- メールをそのまま帳簿として信じる設計
- すべてを即時確定する設計

---

## 14. 最終イメージ

TameLog のサーバーは、今後こういう役割になる。

> Web 家計簿 API
> + VPN 行動イベント基盤
> + 受信メール整理基盤
> + AI 補助つき候補管理基盤

ユーザー体験としては、

- 銀行やカードの通知は専用メールへ転送
- サーバーが候補に変換
- AI が見やすく整理
- ユーザーが少し確認
- 1 件ずつ正式記帳される

これなら、家計簿アプリとしての厳密さを維持しながら、
「アプリを毎回自力で開いて全部入力する」負荷をかなり下げられる。

