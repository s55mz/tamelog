# Apple Human Interface Guidelines 分析レポート

## 概要

この文書は、Apple の Human Interface Guidelines（HIG）をもとに、Apple プラットフォーム向け UI/UX の考え方を整理した実務向けメモです。目的は、HIG の要点を「読んで終わり」にせず、設計レビューや実装判断で使える形に圧縮することです。

HIG は単なる見た目のルール集ではありません。Apple が提供する OS、入力方式、アクセシビリティ設定、標準コンポーネント、通知、ナビゲーション、ウィジェットなどと一体で設計されています。したがって、Apple らしい UI を作るには、独自表現を増やすより先に、標準の構造と振る舞いを尊重する必要があります。

公式の出発点:

- HIG トップ: https://developer.apple.com/design/human-interface-guidelines/
- Design Get Started: https://developer.apple.com/design/get-started/

## 結論

Apple の HIG を実務に落とすと、重要なのは次の 4 点です。

1. 情報の階層を明確にすること
2. プラットフォームごとの入力と利用文脈に適応すること
3. 標準コンポーネントと標準フローを優先すること
4. アクセシビリティと信頼性を初期設計から組み込むこと

見た目だけ Apple 風にしても、ナビゲーション、モーダル、通知、タップ領域、入力方式、読みやすさが崩れていれば HIG に沿っているとは言えません。逆に、標準パターンを適切に使い、階層・入力・可読性・信頼性を守ると、UI 全体の品質はかなり安定します。

## HIG の基本構造

Apple の導線は大きく次の順序で読むと理解しやすくなります。

- Getting started
- Foundations
- Patterns
- Components
- Inputs
- Technologies

これはそのまま設計プロセスにも対応しています。

1. まず利用文脈とプラットフォームを決める
2. 次に原則と土台を確認する
3. よくある課題を標準パターンで解く
4. 必要な部品を標準コンポーネントから選ぶ
5. 入力差分と技術統合を詰める

関連ページ:

- Getting started: https://developer.apple.com/design/human-interface-guidelines/getting-started
- Foundations: https://developer.apple.com/design/human-interface-guidelines/foundations
- Patterns: https://developer.apple.com/design/human-interface-guidelines/patterns
- Components: https://developer.apple.com/design/human-interface-guidelines/components
- Inputs: https://developer.apple.com/design/human-interface-guidelines/inputs
- Technologies: https://developer.apple.com/design/human-interface-guidelines/technologies

## 3つの中核原則

### 1. Hierarchy

Hierarchy は、何が重要で、何が操作可能で、次に何をすべきかをすぐ理解できる状態を指します。Apple の UI は、装飾の強さよりも、レイアウト、余白、タイポグラフィ、グルーピング、標準コンポーネントの役割で階層を作る傾向があります。

実務上の要点:

- 最重要アクションは数を絞る
- ツールバー、タブバー、サイドバーの役割を崩さない
- 情報だけを見せたい場面でアラートを乱用しない
- 強調はサイズや色の暴力ではなく、配置と構造で作る

関連ページ:

- HIG トップ: https://developer.apple.com/design/human-interface-guidelines/
- Alerts: https://developer.apple.com/design/human-interface-guidelines/alerts

### 2. Harmony

Harmony は、ハードウェアとソフトウェア、そして複数デバイス間で体験が自然につながることを意味します。ここでいう調和は、見た目の統一だけではありません。画面サイズ、視聴距離、環境光、表示面、入力方式の違いがあっても、読みやすく使いやすいことが含まれます。

実務上の要点:

- iPhone では片手操作と短時間利用を意識する
- iPad では大画面と複数入力を前提にする
- Mac ではウインドウ操作、ショートカット、密度を重視する
- Watch では数秒で理解できる情報量に抑える
- Vision Pro では快適性と視線移動の負荷を優先する

関連ページ:

- Widgets: https://developer.apple.com/design/human-interface-guidelines/widgets
- Designing for macOS: https://developer.apple.com/design/human-interface-guidelines/designing-for-macos
- Designing for iPadOS: https://developer.apple.com/jp/design/human-interface-guidelines/designing-for-ipados

### 3. Consistency

Consistency は、すべての画面を同じ見た目にすることではなく、目的と操作の意味を一貫させることです。各プラットフォームの慣習に従いながら、同じ機能は同じ期待で扱えるようにします。

実務上の要点:

- iPhone の UI をそのまま Mac に拡大しない
- tvOS や watchOS にスマホ向け設計を持ち込まない
- 同じ機能でも、プラットフォームに合わせて表現は変える
- 独自ナビゲーションや独自メニューは慎重に扱う

関連ページ:

- HIG トップ: https://developer.apple.com/design/human-interface-guidelines/
- Menus: https://developer.apple.com/design/human-interface-guidelines/menus
- Pointing devices: https://developer.apple.com/design/human-interface-guidelines/pointing-devices

## 実務で重要なテーマ

### アクセシビリティ

Apple はアクセシビリティを後付けの調整ではなく、設計の原則として扱っています。少なくとも次を初期段階から確認するべきです。

- タップ領域や操作領域が十分に大きいか
- コントラストが足りているか
- Dynamic Type や文字拡大で破綻しないか
- Reduce Motion などの設定変化に耐えるか
- 音声、キーボード、ポインタなど別の手段でも操作できるか

代表的な目安として、iOS / iPadOS の操作要素は 44 x 44 pt 以上が基本です。透明素材やブラーを使う場合は、見た目より先に可読性を確認する必要があります。

関連ページ:

- Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility

### ナビゲーション

よいナビゲーションは、現在地、選択肢、戻り方が明確です。Apple の設計では、標準のナビゲーション構造に乗ることが最も安全です。

実務上の要点:

- 階層移動には標準のスタック構造を使う
- 主要機能が少数ならタブを使う
- 大画面ではサイドバーを活用する
- 戻る導線を隠したり独自化しすぎない

実装参照:

- NavigationStack: https://developer.apple.com/documentation/SwiftUI/NavigationStack
- TabView: https://developer.apple.com/documentation/SwiftUI/TabView

### モーダルとアラート

アラートは「今この瞬間に注意を奪う理由がある場合」に限定すべきです。単なる確認や補足説明を何でもアラートで出すと、重要度が崩れます。

実務上の要点:

- 情報提示だけならインライン表示や別画面を優先する
- 選択肢の整理にはアクションシートやメニューを使う
- 起動直後の許可要求や警告連発を避ける
- ボタン文言は短く、結果が分かる表現にする

関連ページ:

- Alerts: https://developer.apple.com/design/human-interface-guidelines/alerts
- Activity views: https://developer.apple.com/design/human-interface-guidelines/activity-views

### 通知

通知は機能ではなく信頼の設計です。許可を取れば送ってよいわけではなく、何を、いつ、どの緊急度で送るかを厳密に設計する必要があります。

実務上の要点:

- 許可は文脈が分かるタイミングで求める
- Time Sensitive や Critical を乱用しない
- マーケティング目的の通知を重要通知扱いしない
- Focus やユーザー設定を前提にする

関連ページ:

- Managing notifications: https://developer.apple.com/design/human-interface-guidelines/managing-notifications
- Asking permission to use notifications: https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications

### メニューと共有

メニューと共有シートは、Apple が期待する標準フローをそのまま使える領域です。独自 UI を作る理由が弱いなら、標準を使う方が一貫性も学習コストも良くなります。

実務上の要点:

- メニューは省スペースで関連コマンドをまとめる時に有効
- 共有は独自実装より Activity View を優先する
- 標準コンポーネントと重複する機能を別に作らない

関連ページ:

- Menus: https://developer.apple.com/design/human-interface-guidelines/menus
- Activity views: https://developer.apple.com/design/human-interface-guidelines/activity-views

### ウィジェット

ウィジェットは「アプリの小型版」ではありません。ひと目で分かる情報や、最短の行動導線を提供するための面です。

実務上の要点:

- 情報密度を絞る
- 余白を十分に取る
- 一目で意味が通る見出しと値を優先する
- 更新頻度と表示面の制約を前提にする

関連ページ:

- Widgets: https://developer.apple.com/design/human-interface-guidelines/widgets

### Siri と Generative AI

音声操作や生成 AI は、目新しさより信頼性が重要です。特に生成 AI は、誤り、偏り、説明責任、ユーザーコントロールの問題を最初から UI に織り込む必要があります。

実務上の要点:

- Siri は既存インテントとタスク単位で設計する
- AI の出力は常に正しい前提で見せない
- ユーザーが確認、修正、取り消しできる状態を残す
- 自動化の結果や判断理由を適切に伝える

関連ページ:

- Siri: https://developer.apple.com/jp/design/human-interface-guidelines/siri/
- Generative AI: https://developer.apple.com/design/human-interface-guidelines/generative-ai

## プラットフォーム別の整理

| プラットフォーム | 主な利用文脈 | 設計の焦点 |
|---|---|---|
| iOS | 近距離、短時間、片手操作 | 主要アクションの明確化、タップしやすさ、短い導線 |
| iPadOS | 長時間作業、複数入力、マルチタスク | サイドバー、情報密度、サイズ変化への適応 |
| macOS | ウインドウ操作、キーボード中心、高精度入力 | 可変レイアウト、ショートカット、低モーダル |
| watchOS | 数秒のグランス、超短時間操作 | 最重要情報の即時表示、簡潔さ |
| tvOS | 遠距離、リモート操作 | フォーカス移動、視認性、大きなターゲット |
| visionOS | 空間 UI、視線と手の入力 | 快適性、視野配置、過度な動きの抑制 |

重要なのは、同じ機能をすべてのプラットフォームで同じ UI にすることではありません。各デバイスで自然に使えるよう適応させることが、Apple における一貫性です。

## レビュー用チェックリスト

設計レビューでは、少なくとも次を確認すると精度が上がります。

- 主要タスクが一画面目から明確に見えるか
- 重要アクションが多すぎないか
- アラートやモーダルを乱用していないか
- タップ領域やコントラストが不足していないか
- Dynamic Type や設定変更で破綻しないか
- タッチ以外の入力でも操作できるか
- 通知が本当に必要な場面だけに絞られているか
- 標準コンポーネントで置き換えられる独自 UI が残っていないか
- 各プラットフォームで無理な共通化をしていないか

## 実務フロー

HIG を調査メモとして読むだけでは設計品質は上がりません。実務では次の順で適用すると扱いやすくなります。

1. 対象プラットフォームと利用文脈を定義する
2. 主要タスクを洗い出す
3. HIG のパターンとコンポーネントで置き換えられる箇所を特定する
4. 低忠実度プロトタイプで階層と導線を確認する
5. アクセシビリティ設定を変えて崩れないか確認する
6. 実装時に標準 API と標準コンポーネントを優先する
7. リリース前に通知、モーダル、入力差分を再点検する

## このレポートの使い方

この文書は、Apple の HIG 全体を日本語で要約したガイドです。最終判断は必ず Apple 公式ドキュメントを参照してください。特に通知、アクセシビリティ、入力方式、生成 AI のように仕様変化や運用上の誤りが影響しやすい領域は、設計時点で一次資料を再確認するのが前提です。

## 参考リンク

- Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Design Get Started: https://developer.apple.com/design/get-started/
- Getting started: https://developer.apple.com/design/human-interface-guidelines/getting-started
- Foundations: https://developer.apple.com/design/human-interface-guidelines/foundations
- Accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility
- Patterns: https://developer.apple.com/design/human-interface-guidelines/patterns
- Alerts: https://developer.apple.com/design/human-interface-guidelines/alerts
- Managing notifications: https://developer.apple.com/design/human-interface-guidelines/managing-notifications
- Components: https://developer.apple.com/design/human-interface-guidelines/components
- Menus: https://developer.apple.com/design/human-interface-guidelines/menus
- Activity views: https://developer.apple.com/design/human-interface-guidelines/activity-views
- Widgets: https://developer.apple.com/design/human-interface-guidelines/widgets
- Inputs: https://developer.apple.com/design/human-interface-guidelines/inputs
- Pointing devices: https://developer.apple.com/design/human-interface-guidelines/pointing-devices
- Technologies: https://developer.apple.com/design/human-interface-guidelines/technologies
- Designing for macOS: https://developer.apple.com/design/human-interface-guidelines/designing-for-macos
- Designing for iPadOS: https://developer.apple.com/jp/design/human-interface-guidelines/designing-for-ipados
- Siri: https://developer.apple.com/jp/design/human-interface-guidelines/siri/
- Generative AI: https://developer.apple.com/design/human-interface-guidelines/generative-ai
- Asking permission to use notifications: https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications
- NavigationStack: https://developer.apple.com/documentation/SwiftUI/NavigationStack
- TabView: https://developer.apple.com/documentation/SwiftUI/TabView
