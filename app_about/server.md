# TameLog サーバー構成分析レポート

> 調査日時: 2026-03-23 13:05 JST
> 対象サーバー: `160.251.203.86` (vm-25b69893-e6)

---

## 1. ハードウェア / 基本スペック

| 項目 | 値 |
|---|---|
| OS | Ubuntu 24.04.3 LTS (Noble Numbat) |
| カーネル | 6.8.0-90-generic |
| 仮想化 | KVM (QEMU Guest, Intel VT-x) |
| CPU | Intel Xeon Icelake × 3コア (各2.0GHz, シングルスレッド/ソケット) |
| L2キャッシュ | 12 MiB (3インスタンス) |
| L3キャッシュ | 48 MiB (3インスタンス) |
| RAM | 1.9 GB (used: 672 MB / available: 1.3 GB) |
| Swap | 2.0 GB (used: 31 MB) |
| ディスク | 99 GB (used: 8.6 GB / free: 86 GB / 10%) |
| 起動時刻 | 2026-03-16 14:22 (稼働 6日22時間) |
| 公開IP | 160.251.203.86/23 |
| IPv6 | 2400:8500:2002:3173:160:251:203:86/64 |
| ゲートウェイ | 160.251.202.1 |

---

## 2. CPU / 負荷状況

```
load average: 0.38, 0.37, 0.32  (1min / 5min / 15min)
Tasks: 169 total, 1 running, 168 sleeping

CPU内訳:
  user:   2.9%
  system: 2.9%
  iowait: 2.9%
  idle:   91.4%
```

**I/O統計 (累計)**

| デバイス | tps | 読み込み | 書き込み |
|---|---|---|---|
| vda (メインディスク) | 4.42 | 14.02 KB/s | 54.41 KB/s |

---

## 3. ネットワーク構成

| インターフェース | アドレス | 用途 |
|---|---|---|
| `lo` | 127.0.0.1/8 | ループバック |
| `eth0` | 160.251.203.86/23 | パブリックIPv4 |
| `eth0` | 2400:8500:...:203:86/64 | パブリックIPv6 |
| *(VPN想定)* | 10.10.10.0/24 | VPNクライアント用内部ネット |

### 開放ポート

| ポート | プロセス | 公開範囲 | 役割 |
|---|---|---|---|
| 22 | sshd | 全体 | SSH管理 |
| 25 | postfix (smtpd) | 全体 | メール受信 (SMTP) |
| 80 | nginx | 全体 | HTTP (メインサイト) |
| 4443 | mitmdump | 全体 | HTTPS ブロックページ (mitmproxy reverse) |
| 8181 | nginx | 全体 | フォールバック用 HTTP |
| 3001 | node | 全体 | TameLog API |
| 5432 | postgres | localhost | PostgreSQL DB |
| 8891 | opendkim | localhost | DKIM署名ミルター |
| 20241 | cloudflared | localhost | Cloudflare トンネル |
| 53 | systemd-resolved | localhost | DNS解決 |

---

## 4. 稼働サービス一覧

### アプリケーション系

| サービス | 状態 | 詳細 |
|---|---|---|
| **Node.js (TameLog API)** | ✅ 稼働中 (PID 301623) | port 3001, nohup起動 (systemdとは別プロセス) |
| **nginx** | ✅ 稼働中 | port 80 / 8181, worker×4 |
| **PostgreSQL 16** | ✅ 稼働中 | localhost:5432, DB: tamelogdb (9.6 MB) |
| **cloudflared** | ✅ 稼働中 | Cloudflare Tunnelでアプリを公開 |
| **tamelog-dns** | ✅ 稼働中 | Python3製DNSフィルタリング, port 53 |
| **tamelog-block-https** | ✅ 稼働中 | mitmdump reverse proxy, port 4443 |
| **tamelog-api.service** | ⚠️ 再起動ループ中 | `EADDRINUSE: port 3001` → 別途nohupプロセスが先に起動済みのため衝突 (再起動回数: 1769回!) |
| **tamelog-mitm.service** | ❌ 再起動ループ中 | `/var/www/tamelog/mitm-filter.py` が存在しない |

### インフラ / セキュリティ系

| サービス | 状態 | 詳細 |
|---|---|---|
| **fail2ban** | ✅ 稼働中 | SSHブルートフォース防御 |
| **postfix** | ✅ 稼働中 | MTA, inbox.finance-pro.space |
| **opendkim** | ✅ 稼働中 | DKIM署名, localhost:8891 |
| **ssh** | ✅ 稼働中 | OpenSSH |
| **cron** | ✅ 稼働中 | 定期タスク |
| **ntpsec** | ✅ 稼働中 | NTP時刻同期 |
| **rsyslog** | ✅ 稼働中 | システムログ |
| **ufw** | ⚠️ unit-not-found | UFWのsystemdユニットが見つからないが iptablesルールは有効 |

---

## 5. アプリケーション構成

### ディレクトリ構造

```
/var/www/tamelog/
├── frontend/          # ビルド済みReact (nginxで配信)
├── server/
│   ├── dist/          # ビルド済みNode.js (index.js)
│   ├── .env           # 環境変数
│   └── package.json
├── assets/
├── icons/
├── manifest.json      # PWAマニフェスト
├── sw.js              # Service Worker
├── tamelog-dns.py     # DNSフィルタリングスクリプト (Python3)
└── mitm-filter.py     # ← 存在しない ⚠️ (tamelog-mitm.serviceが落ちる原因)
```

### バックエンドスタック

| 項目 | 内容 |
|---|---|
| ランタイム | Node.js v20.20.1 |
| フレームワーク | Hono + @hono/node-server |
| ORM | Prisma (@prisma/client ^6.5.0) |
| DB | PostgreSQL 16 (tamelogdb, 9.6 MB) |
| 認証 | JWT (jsonwebtoken) + bcryptjs |
| メール送信 | nodemailer (SMTP) |
| プッシュ通知 | web-push (VAPID) |
| AI | OpenAI API (メール分類) |
| バリデーション | Zod |
| 定期処理 | node-cron |
| その他 | iconv-lite, plist, qrcode |

### 環境変数 (キーのみ)

```
DATABASE_URL
PORT
JWT_SECRET
NODE_ENV
OPENAI_API_KEY
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
INGEST_SECRET
```

### Nginx 設定

```nginx
# メインサイト (port 80)
server_name: finance-pro.space www.finance-pro.space
root: /var/www/tamelog/frontend
client_max_body_size: 12m
location /api/ → proxy_pass http://127.0.0.1:3001

# フォールバック (port 8181)
root: /var/www/tamelog/frontend (SPAフォールバックのみ)
```

---

## 6. メール受信パイプライン

```
外部メール
  → ポート25 (postfix, inbox.finance-pro.space)
    → virtual_transport: tamelog_ingest (カスタムトランスポート)
      → Node.js API (ingestルート)
        → OpenAI APIで取引/非取引を分類
        → tamelogdb に保存
  ↑ opendkim でDKIM署名検証/付与 (ポート8891)
```

---

## 7. VPN / ネットワークフィルタリング構成

```
VPNクライアント (10.10.10.0/24)
  ↓
[tamelog-dns (port 53)]
  → ドメインをAPI参照でブロック/パス判定
  → ブロック対象 → NXDOMAINまたはブロックIPへ誘導

[iptables FORWARD ルール]
  → 10.10.10.0/24 からの通信を許可 (ACCEPT)
  → 443/udp (QUIC) を外部DNSサーバーへ REJECT
    (8.8.8.8, 8.8.4.4, 1.1.1.1, 1.0.0.1, 9.9.9.9, 149.112.112.112)

[tamelog-block-https (port 4443)]
  → mitmdump reverse proxy → port 8181 (nginx SPA)
  → ブロック時にブロックページ表示

[tamelog-mitm.service]  ← ❌ 現在動作していない
  → transparent mode mitmdump (port 8080)
  → /var/www/tamelog/mitm-filter.py が存在せず起動不可
```

---

## 8. セキュリティ状況

### fail2ban (SSHジェイル)

| 項目 | 値 |
|---|---|
| 現在Ban中 | 1 IP (213.209.159.159) |
| 現在失敗中 | 3件 |
| 累計Ban | 113 IP |
| 累計失敗 | 2,314件 |

### SSH設定

```
PermitRootLogin: yes          ← ⚠️ root直接ログイン許可
PasswordAuthentication: yes   ← ⚠️ パスワード認証許可
KbdInteractiveAuthentication: no
```

### ログイン履歴

| 日時 | ユーザー | 接続元 |
|---|---|---|
| 2026-03-23 12:59〜 | root | 60.112.172.127 (現在ログイン中) |
| 2026-03-23 12:51 | root | 60.112.172.127 |
| 2026-03-21 14:21 | root | 60.112.172.127 |
| 2026-03-17 11:40 | root | 60.112.172.127 |
| 2026-03-16 14:22 | (起動) | — |

---

## 9. 定期タスク (systemd timers)

| タイマー | 次回実行 | 役割 |
|---|---|---|
| sysstat-collect | 10分毎 | CPU/IO統計収集 |
| apt-daily | 毎日 | APT更新チェック |
| apt-daily-upgrade | 毎日 | APT自動アップグレード |
| cloudflared-update | 毎日00:00 | cloudflared自動更新 |
| logrotate | 毎日00:00 | ログローテーション |
| e2scrub_all | 週1 (日曜) | fsckファイルシステム検査 |
| fstrim | 週1 (月曜) | SSDトリム |

---

## 10. 問題点まとめ

### ❌ 重大: tamelog-api.service が再起動ループ (1769回)

**原因:** `nohup node dist/index.js` で手動起動したプロセス (PID 301623) がすでにport 3001を使用しているため、systemdのtamelog-api.serviceが起動するたびにEADDRINUSEで即死。

**現状:** APIは実際には動いているが、systemdの管理外。手動プロセスが死んだ場合、systemdサービスが引き継ごうとするがその際も競合状態が続く可能性あり。

### ❌ 重大: tamelog-mitm.service が再起動ループ

**原因:** `/var/www/tamelog/mitm-filter.py` が存在しない。VPNのHTTPSフィルタリング (transparent mitmdump, port 8080) は完全に動いていない。

**影響:** VPNクライアントのHTTPSトラフィックフィルタリングが無効状態。

### ⚠️ 注意: opendkim 起動時競合

起動時にport 8891のEADDRINUSEが複数回発生した形跡あり。現在は稼働中だが不安定な起動シーケンスがある。

### ⚠️ 注意: SSHセキュリティ

`PermitRootLogin yes` + `PasswordAuthentication yes` の組み合わせはブルートフォース攻撃のリスクあり。fail2banで軽減しているが、公開鍵認証のみに絞ることを推奨。

### ⚠️ 注意: システム再起動が推奨されている

ログイン時に `*** System restart required ***` のメッセージが出ている (カーネル/パッケージ更新後の再起動待ち)。

---

## 11. ソフトウェアバージョン

| ソフトウェア | バージョン |
|---|---|
| Node.js | v20.20.1 |
| npm | 10.8.2 |
| Python | 3.12.3 |
| nginx | 1.24.0 |
| PostgreSQL | 16.13 |
| postfix | 3.8.6 |
| cloudflared | (最新自動更新中) |
| mitmproxy | /opt/mitmproxy-venv/ |
