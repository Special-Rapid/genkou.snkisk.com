# 画面の状態とAI依頼文

homeのAI依頼文は `RootPrintPrompt` が表示し、文面は `lib/copy.ts` の `rootPromptCopy` を使います。題材は約2.6秒ごとに切り替わり、新しい題材の出現と題材幅の変化を約420msで表示します。幅は実際の文字を測って決め、後続の文章が題材の長さに合わせて移動します。枠全体はコピー操作で、表示中の題材例を除いた固定の依頼文をコピーします。読み上げるコピー内容も同じ固定文です。コピー枠にフォーカスしている間は題材例の切替を止めます。コピー失敗時は固定の依頼文を選択できる状態で表示します。OSの「動きを減らす」が有効なときは最初の題材例を静止表示します。変更の完了条件は [Issue #6](https://github.com/Special-Rapid/kantan.snkisk.com/issues/6) と [Issue #7](https://github.com/Special-Rapid/kantan.snkisk.com/issues/7) にあります。

画面は日本語と英語に対応し、未保存時はOSの言語から完全一致、基底言語一致、日本語の順で選びます。言語選択は画面内で切り替え、`kantan:language-preference` に保存します。既存の `kantan:language` も移行時に読みます。対応言語は左から右へ読む言語のみで、RTLは対象外です。

テーマは System / Light / Dark に対応し、`kantan:theme` に保存します。SystemではOSの外観変更に追従し、選択結果を `data-theme`、CSSの `color-scheme`、ブラウザの `theme-color` に反映します。ブラウザの動的アクセント色を取得する公開APIは利用していないため、配色はCSSの意味別変数で管理します。言語・テーマの切替は再読み込みせず、入力や現在の画面を維持します。
