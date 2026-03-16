# 貯めログ 要件定義

更新日: 2026-03-16

## 1. アプリの目的

貯めログは、家計の記録を続けやすくし、貯金目標の達成を支援する招待制アプリです。単なる家計簿ではなく、次の行動を短い導線で回せることを重視します。

- 収入、支出、貯金をすぐ記録する
- 口座残高と今期の収支を把握する
- 貯金目標を作って進捗を見る
- 衝動買いを一度保留する
- AI で相談、振り返りを行う

## 2. 利用者

- 管理者
  - 初回セットアップを行う
  - 招待を発行する
  - OpenAI、プッシュ通知、VPN 関連設定を管理する
- 一般ユーザー
  - 招待経由で登録する
  - 初期設定後に日常利用する

## 3. 利用フロー

1. 未導入時は `/setup` で管理者、アプリ名、給料日を登録する。
2. 導入後は管理者が `/invite` で招待を発行する。
3. 招待されたユーザーは `/register` で登録する。
4. 初回ログイン後は `/user-setup` で給料日、初期口座、初期目標を設定する。
5. 完了後に通常画面を利用する。

## 4. 画面要件

| 画面 | 役割 |
|---|---|
| `/setup` | 初回セットアップ |
| `/login` `/register` | ログイン、招待制登録 |
| `/user-setup` | 給料日、初期口座、初期目標の登録 |
| `/` | ホーム。残高、今期の貯金、注力目標、最近の記録を表示 |
| `/record` | 収入、支出、貯金、口座移動の登録。OCR 入力対応 |
| `/ledger` | 記録一覧、カレンダー、期間やカテゴリでの絞り込み |
| `/accounts` | 口座の追加、編集、削除 |
| `/goals` | 目標の追加、編集、削除、ビジュアル付き進捗表示 |
| `/progress` | 今期の集計と AI レポート表示 |
| `/impulse` | 衝動買い候補を 24 時間保留して判定 |
| `/chat` | 今期の記録を踏まえた AI 相談 |
| `/settings` | プロフィール、カテゴリ、通知、Web Push、ブロック設定、VPN デバイス管理 |
| `/invite` | 招待の発行と失効。管理者専用 |
| `/admin` | ユーザー、OpenAI キー、サービスドメイン、VPN、システム情報の管理。管理者専用 |

## 5. 機能要件

### 5.1 記録と口座

- 記録種別は `INCOME` `EXPENSE` `SAVING`。
- 口座移動は `TRANSFER`、貯金目的の移動は `SAVING` として別管理する。
- 記録、編集、削除時は残高更新まで同一トランザクションで行う。
- 金額は円の整数で扱う。
- `recordDate` とは別に `recordedAt` を保存する。
- 支出、収入記録にはカテゴリを設定できる。
- 貯金記録と貯金移動には目標を紐付けできる。
- 記録には感情タグを付けられる。

### 5.2 目標

- 目標はタイトル、目標金額、期限、メモ、見た目テーマを持つ。
- 進捗額は `GoalRecord` 集計で算出する。
- 目標一覧とホームでは達成率、残額、残日数を表示する。
- 目標ビジュアルは選択式で管理する。

### 5.3 進捗と AI

- 進捗画面では今期の収入、支出、貯金、継続日数を表示する。
- AI チャットは今期の収支と最近の支出を文脈に含める。
- AI レポートは月単位で保存し、同月 3 回まで生成できる。
- OCR はレシート画像から金額、日付、時刻、店名、種別、カテゴリ候補を補完する。
- OpenAI キー未設定時は、AI チャットと AI レポートは簡易応答にフォールバックする。OCR は利用不可。

### 5.4 設定と制御

- 通知設定は日次、週次、目標通知、赤字警告を持つ。
- Web Push の購読、解除に対応する。
- ブロック設定は `EC` と `PAYMENT` の 2 カテゴリを持つ。
- ブロック設定は曜日、開始時刻、終了時刻で管理する。
- ユーザーは VPN デバイスを追加、削除できる。
- 管理者はブロック対象ドメインと VPN クライアントを管理できる。

### 5.5 フィルタリング / VPN の概要　

- この機能は、浪費につながりやすいサービスへのアクセスを時間帯で抑えるための補助機能とする。
- アプリ本体は設定 UI と管理 UI を担当し、実際の通信制御は VPN プロファイルを使う前提とする。
- ユーザーには具体的なドメイン名を見せず、`EC` と `PAYMENT` のカテゴリ単位で設定させる。
- 管理者はカテゴリごとの対象ドメインを管理する。
- ユーザーは設定画面でスケジュール、警告通知、VPN 接続状態を管理する。
- ユーザーは自分のデバイス用 VPN プロファイルを追加し、必要に応じて削除できる。

基本フロー:

1. 管理者が対象カテゴリとドメインを管理する。
2. ユーザーがブロック時間帯を設定する。
3. ユーザーが VPN デバイスを追加し、プロファイルと CA 証明書を取得する。
4. VPN 経由の通信で、設定されたカテゴリに該当するアクセスを制御する。

## 6. データ要件

主要モデルは次のとおりです。

- `User` `Invitation` `SystemConfig`
- `Account` `Category`
- `DailyRecord` `AccountTransfer`
- `Goal` `GoalRecord`
- `ImpulseItem`
- `AIAnalysis`
- `UserPreference` `UserBlockSetting` `UserBlockSchedule`
- `ServiceCategory` `ServiceDomain`
- `VpnClient` `PushSubscription`

## 7. API 要件

API はすべて `/api` 配下の JSON API とし、成功時は `data`、失敗時は `error` を返します。

- セットアップ: `/setup/*`
- 認証: `/auth/*`
- ユーザー: `/users/*`
- ダッシュボード: `/dashboard`
- 記録: `/records`
- 口座移動: `/account-transfers`
- 口座: `/accounts`
- 目標: `/goals`
- カテゴリ: `/categories`
- 衝動買い: `/impulse-items`
- AI: `/chat` `/analysis` `/ocr`
- プッシュ通知: `/push/*`
- VPN: `/vpn/*`
- 管理者: `/admin/*`

フィルタリング / VPN で主に使う API:

- ユーザー設定: `/users/me/block-settings`
- ユーザー VPN: `/vpn/devices` `/vpn/profiles/:token` `/vpn/certs/ca`
- 管理者設定: `/admin/service-categories` `/admin/service-domains`
- 管理者 VPN: `/admin/vpn-clients` `/admin/vpn-status`

## 8. 業務ルール

- 認証は JWT Bearer 方式。
- ユーザーデータは常に `userId` 境界で扱う。
- `periodId` は給料日基準で算出する。
- 招待はメールアドレス固定で 1 回のみ利用できる。
- 管理者専用画面と API は一般ユーザーから参照できない。

## 9. 開発前提

- フロント: React 19 + TypeScript + Vite
- API: Hono + Node.js
- DB: PostgreSQL + Prisma

必要な主な環境変数:

```env
DATABASE_URL=
PORT=3000
JWT_SECRET=
ALLOWED_ORIGINS=
OPENAI_API_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
VITE_API_URL=
```