# 画面の状態とAI依頼文

ホームでは `RootPrintPrompt` が短いコピーボタンを表示し、`lib/copy.ts` の `rootPromptCopy` をクリップボードへ直接コピーします。題材例と文章作成の指示はホームの表示・コピー内容に含めません。成功時はコピーした本文をボタン直下のツールチップに6.5秒間表示し、Escapeでも閉じられます。失敗時は同じ本文を選択できる入力欄とエラーを表示します。使い方ページの題材入り例文はそのまま残します。仕様は [Issue #11](https://github.com/Special-Rapid/kantan.snkisk.com/issues/11) に記録しています。

画面は日本語と英語に対応し、未保存時はOSの言語から完全一致、基底言語一致、日本語の順で選びます。言語選択は画面内で切り替え、`kantan:language-preference` に保存します。既存の `kantan:language` も移行時に読みます。対応言語は左から右へ読む言語のみで、RTLは対象外です。

テーマは System / Light / Dark に対応し、`kantan:theme` に保存します。SystemではOSの外観変更に追従し、選択結果を `data-theme`、CSSの `color-scheme`、ブラウザの `theme-color` に反映します。ブラウザの動的アクセント色を取得する公開APIは利用していないため、配色はCSSの意味別変数で管理します。言語・テーマの切替は再読み込みせず、入力や現在の画面を維持します。
