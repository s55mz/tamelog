# iOS オンボーディング再設計タスク

未完了タスクはありません。

## 完了内容

- `safe area` 前提のオンボーディングシェルへ再構成
- ヘッダーを `戻る / フロー名 / ステップ数 / 進捗 / 現在ステップ` の順に整理
- 下部 CTA を `被せ固定` ではなく `画面下の自然配置` に変更
- `VisualViewport` ベースでキーボード表示時のレイアウト切り替えを実装
- テキスト入力時にフォーカス要素が見える位置へ寄る処理を追加
- 日本語 IME 変換中は Enter 遷移しないように調整
- `口座追加有無 / 口座種別 / プロファイル導入有無` を設定セル型 UI に変更
- オンボーディング中の `コピーライト / バージョン / 最新化` を非表示化
- プロファイル案内を iPhone 実際の導線に合わせて更新
- 通知画面も同じオンボーディングシェルへ統一

## 実装ファイル

- [OnboardingShell.tsx](/Users/soramizukuki/projects/tamelog/client/src/components/OnboardingShell.tsx)
- [ProfileInstallGuide.tsx](/Users/soramizukuki/projects/tamelog/client/src/components/ProfileInstallGuide.tsx)
- [useMobileViewport.ts](/Users/soramizukuki/projects/tamelog/client/src/hooks/useMobileViewport.ts)
- [UserSetupPage.tsx](/Users/soramizukuki/projects/tamelog/client/src/pages/UserSetupPage.tsx)
- [NotificationPromptPage.tsx](/Users/soramizukuki/projects/tamelog/client/src/pages/NotificationPromptPage.tsx)
- [styles.css](/Users/soramizukuki/projects/tamelog/client/src/styles.css)

## 確認済み

- `npm --prefix client run build`
- `npm --prefix server run build`

## 残課題

- なし
