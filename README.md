# 貯めログ

ADHD 傾向のあるユーザーでも続けやすいことを重視した、家計・貯金支援アプリの設計リポジトリです。

現時点では、実装コードより先に仕様と運用方針を整理しています。
最初に見る文書は [app_about/frame.md](./app_about/frame.md) です。

## このリポジトリの現在地

- 状態: 設計整理済み、実装前
- 最優先文書: `app_about/frame.md`
- 実装補助仕様: `app_about/REQUIREMENTS.md`
- 実装方針: フロントと API を同一リポジトリで管理

## 文書構成

- [app_about/frame.md](./app_about/frame.md)
  - 最優先文書
  - ワイヤーフレーム基準の画面仕様と確定判断
- [app_about/REQUIREMENTS.md](./app_about/REQUIREMENTS.md)
  - 実装補助仕様
  - API、データモデル、実装ルール
- [app_about/CONCERNS.md](./app_about/CONCERNS.md)
  - 現時点で残っている課題だけを管理
- [app_about/DEVELOPMENT.md](./app_about/DEVELOPMENT.md)
  - 実装の進め方
- [app_about/DEPLOYMENT.md](./app_about/DEPLOYMENT.md)
  - ローカル開発と本番運用の方針

## 基本方針

- 画面の判断は `frame.md` を基準にする
- 仕様の重複を避ける
- v1 では日本国内利用を前提にする
- 導入障壁を上げる設定は初回セットアップに入れすぎない

## 次にやること

1. `frame.md` を基準に画面を実装単位へ分割する
2. `REQUIREMENTS.md` をもとにデータモデルを作る
3. API と UI を実装する
