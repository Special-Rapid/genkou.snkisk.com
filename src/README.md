# 画面の状態とAI依頼文

ホームでは `RootPrintPrompt` が短いコピーボタンを表示し、`lib/copy.ts` の `rootPromptCopy` をクリップボードへ直接コピーします。題材例と文章作成の指示はホームの表示・コピー内容に含めません。成功時はコピーした本文をボタン直下のツールチップに6.5秒間表示し、Escapeでも閉じられます。失敗時は同じ本文を選択できる入力欄とエラーを表示します。使い方ページの題材入り例文はそのまま残します。仕様は [Issue #11](https://github.com/Special-Rapid/kantan.snkisk.com/issues/11) に記録しています。

画面は日本語と英語に対応し、明示言語URLを除く未保存時はOSの言語から完全一致、基底言語一致、日本語の順で選びます。「システム」選択中はOSの言語変更にも追従します。画面内で言語を選ぶと `kantan:language-preference` と手動選択の印 `kantan:language-manual` に保存します。旧版が自動保存した `system` は手動選択とみなさず、言語別URLの初期言語を優先します。既存の `kantan:language` も移行時に読みます。対応言語は左から右へ読む言語のみで、RTLは対象外です。

検索用ホームは `/ja/` と `/en/` に分け、初期HTMLの本文・title・description・canonical・OG情報をそれぞれの言語へ揃えます。`/` は本文入り印刷リンクとの互換入口として維持し、Accept-Languageによらず日本語HTMLと `/ja/` canonicalを返します。x-defaultはこの入口です。WebSiteのURLはサイト全体を示すrootに固定します。言語別URLを直接開いた場合はURLの言語を優先し、保存済みの手動選択を書き換えません。rootでは保存済みの手動選択を復元し、未保存時のJS表示はOS言語を使い、対応する言語URLへ同期します。サーバーHTMLは日本語で安定し、JSによる英語表示は `/en/` URL上で行います。言語切替は再読み込みせず、本文・メタ情報とURLをhistory.replaceStateで同期します。query・印刷fragment・入力・選択を保持します。URLからの初期選択は保存しません。使い方へのリンクとホームに戻るリンクは表示言語のURLへ向けます。経緯は [Issue #1](https://github.com/Special-Rapid/genkou.snkisk.com/issues/1) を参照してください。

テーマは System / Light / Dark に対応し、`kantan:theme` に保存します。SystemではOSの外観変更に追従し、選択結果を `data-theme`、CSSの `color-scheme`、ブラウザの `theme-color` に反映します。ブラウザの動的アクセント色を取得する公開APIは利用していないため、配色はCSSの意味別変数で管理します。言語・テーマの切替は再読み込みせず、入力や現在の画面を維持します。

## 選択した英数字の向き（Issue #16）

本文のLatin文字・十進数字を選択し「標準／正立／横倒し」で1文字1マスの向きを指定します。日本語・空白・句読点・改行は対象外です。選択なし・対象なし・IME変換中は操作できません。横書きではデータを保持し表示だけ適用を止めます。

`text-orientation.ts`はUTF-16半開区間の非重複runsを管理します。textareaへ渡す前にCRLF/CRをLFへ統一してrunsを移動し、indexed layoutが元本文offsetを段落整形／改ページ後にも保持します。新しい文字は標準で、範囲内挿入は既存runを分割します。Issue #15で自動字下げは空白のない段落だけに適用し、手入力・貼り付けの行頭/途中の半角空白・全角空白・タブと空行を保持するよう修正しました。OFFでは字下げの空セルを補わず入力どおりに組みます。どちらも本文やUTF-16 offsetは変更しません。

本文とrunsを同じ履歴へ保存し、Ctrl/Cmd+Z、Ctrl+Y／Cmd+Shift+Z、beforeinput historyUndo/Redoで復元します。履歴上限は100操作で、IMEの一回の確定は一操作です。通常の各入力・削除・書式変更は一操作として扱います。保存はversion付き`genkou:document`、旧`kantan:source-text`から移行し、本文のみの互換保存も続けます。

印刷リンクはv1を継続読取り、指定を含むリンクのみv2＋JSON runsを使用します。仕様はpublic/llms.txt。「本文と設定のリンクをコピー」は本文を含むため、共有先に本文が見えることを前提に利用します。URL自体はfragmentだけへ本文を格納します。入力上限・形式検証に失敗した場合やclipboard失敗時には成功通知を出しません。

文字の向きはglyph内spanのhorizontal writing-modeと90度transformで描画し、プレビュー・印刷とhtml2canvas経由PDFを揃えます。CSS text-orientationだけへの依存は避けています。

単語・行単位の削除も、beforeinputの種別とinput後のカーソル位置から実際に消えた範囲を特定します。同じ文字が連続していても残った側の方向指定を維持します。保存容量不足などで本文＋書式の保存に失敗した場合は古い結合保存を無効化し、可能なら最新本文だけを保存します。その場合は文字方向の未保存を画面に表示し、本文すら保存できない場合も閉じる前に控えるよう継続して案内します。結合保存が成功した場合は、互換用本文保存の失敗があっても結合保存から復元できます。


## 紙面のサービス表記（Issue #22）

プレビュー・印刷・PDFは同じ `ManuscriptPage` の紙面を使い、左下の表記は `paperServiceMark` の `genkou.snkisk.com` で共通です。10%以上の余白で表示し、それ未満の余白では既存どおり罫線との重なりを避けて非表示にします。表示のON/OFF、本文、PDF名、ヘッダーやSEOのサービス名はそのまま維持します。
