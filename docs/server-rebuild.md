# Server Rebuild

本番サーバーの再構築メモです。マルウェア感染後の復旧を前提に、構成と復旧順序だけを残しています。

## 方針

- 実サーバーの秘密情報はこのリポジトリに置かない
- パスワード、秘密鍵、Tunnel 認証 JSON、証明書秘密鍵は必ず別保管にする
- 復旧時は「最小公開」「鍵認証」「復元後に確認」の順で進める

## 対象構成

- アプリ: `finance-pro.space`
- フロントエンド: React + Vite の SPA
- API: Hono + Node.js
- DB: PostgreSQL
- 付帯機能:
  - Cloudflare Tunnel
  - nginx
  - strongSwan
  - Postfix
  - OpenDKIM
  - Web Push
  - メール取り込み
  - DNS フィルタ
  - ブロックページ

## アプリ関連ディレクトリ

```text
/var/www/tamelog/
├── server/                API サーバー
├── frontend/              ビルド済み SPA
├── logs/                  アプリログ
├── prisma/                Prisma schema / migrate 補助
└── maintenance.flag       メンテナンス切替
```

## 主なサービス

- `tamelog-api.service`
  - Node.js API
  - API ポートはローカル公開
  - PostgreSQL と連携
  - strongSwan の EAP 更新は API から直接 `/etc` を触らせず、root 権限の helper 経由で行う
- `tamelog-dns.service`
  - VPN クライアント向け DNS フィルタ
- `tamelog-block-https.service`
  - HTTPS ブロックページ表示
- `strongswan-starter.service`
  - IKEv2 VPN
- `nginx.service`
  - フロント配信と API リバースプロキシ
- `postgresql@16-main.service`
  - アプリ DB
- `postfix`
  - 受信メール処理
- `opendkim`
  - DKIM 署名
- `cloudflared.service`
  - Tunnel

## 必要な機密情報

以下は必ずリポジトリ外で保管します。

- PostgreSQL 接続情報
- JWT シークレット
- OpenAI API キー
- SMTP 認証情報
- VAPID 鍵
- メール取り込みシークレット
- Cloudflare Tunnel 認証情報
- strongSwan の秘密鍵と EAP 認証情報
- DKIM 秘密鍵
- mitmproxy 証明書一式

## 再構築フェーズ

### 1. 退避

- DB ダンプを取得
- `.env` を安全な場所に退避
- Tunnel 認証情報を退避
- VPN の証明書、秘密鍵、EAP ユーザー情報を退避
- DKIM 鍵を退避
- mitmproxy 証明書を退避
- systemd ユニットを退避
- フロントビルドと Prisma schema を退避

### 2. ベースセットアップ

- OS 更新
- Node.js、nginx、PostgreSQL、fail2ban、UFW、strongSwan、Postfix、OpenDKIM を導入
- Cloudflare Tunnel を導入

### 3. SSH とネットワーク保護

- SSH パスワード認証を無効化
- 可能なら `PermitRootLogin no`
- fail2ban を有効化
- UFW で必要ポートだけ許可
- 可能なら 80/443 の直接公開をやめて Tunnel 経由に寄せる

### 4. データベース復旧

- PostgreSQL ユーザーと DB を作成
- ダンプをリストア
- Prisma の生成と migration を適用

### 5. アプリ配置

- `/var/www/tamelog` を作成
- `server/` と `frontend/` を配置
- `.env` を復元
- `server/scripts/vpn-helper.js` を root 管理の実行ファイルとして配置し、`VPN_HELPER_COMMAND` に wrapper パスを設定
- `npm install`
- `npx prisma generate`
- `npx prisma migrate deploy`
- `npm run build`

### 6. systemd / nginx / Tunnel 復旧

- ユニットファイルを配置
- `daemon-reload`
- 必要サービスを `enable` と `start`
- nginx のサイト設定を復元
- Tunnel 設定を復元

### 7. VPN / メール / MITM 復旧

- strongSwan 設定と鍵を復元
- `VPN_HELPER_COMMAND` から呼ぶ root helper が `add-eap` / `remove-eap` / `ipsec-status` / `wg-dump` を処理できることを確認
- updown スクリプトを配置
- Postfix と OpenDKIM 設定を復元
- メール取り込みスクリプトを配置
- mitmproxy 仮想環境と証明書を復元

## 復旧後チェック

- SSH パスワード認証が無効
- root 直接ログインが無効
- fail2ban が稼働
- アプリのトップが開く
- API が応答する
- DB 接続が正常
- Cloudflare Tunnel が接続済み
- VPN 接続ができる
- DNS フィルタが動作する
- ブロックページが表示される
- メール受信と取り込みが動く
- DKIM が有効
- 不審な `cron` やプロセスが残っていない

## セキュリティの再発防止

- SSH は鍵認証のみ
- root 直ログインを禁止
- 不要ポートを閉じる
- 本番機の秘密情報を Git に入れない
- 復旧後すぐに全パスワードと鍵をローテーションする
- Cloudflare、メール、DB、OpenAI の認証情報をすべて再発行する
- 定期的に `systemctl`, `ss`, `crontab`, `journalctl` を確認する

## ローカルコードベースとの対応

- フロントエンド: [client](/Users/soramizukuki/projects/tamelog_renewal/client)
- API: [server](/Users/soramizukuki/projects/tamelog_renewal/server)
- Prisma schema: [prisma/schema.prisma](/Users/soramizukuki/projects/tamelog_renewal/prisma/schema.prisma)
- DNS / MITM 関連スクリプト: [mitm-filter.py](/Users/soramizukuki/projects/tamelog_renewal/mitm-filter.py)
- VPN helper: [server/scripts/vpn-helper.js](/Users/soramizukuki/projects/tamelog_renewal/server/scripts/vpn-helper.js)

## 注意

今回の計画書にあった固定パスワード、固定シークレット、実 IP、Tunnel ID などはこのドキュメントには残していません。本番再構築時は、感染前の値を復元するのではなく、原則として再発行した値に置き換えてください。
