# 原稿小箱

原稿小箱は、文章を原稿用紙に整え、B5・A4の仕上がりを確認して印刷・PDF保存できるWebサービスです。

## できること

- B5 / A4、縦書き / 横書き、文字数と行数を選択
- 原稿用紙の仕上がりをリアルタイムに確認
- 必要な場合だけ、明朝体／ゴシック体、文字サイズ、余白、罫線色、紙の向きを「詳細設定（任意）」で調整
- 薄い茶色の罫線を既定にし、色を選んで変更可能
- 紙面左下の `原稿小箱` 表記は既定でオン。オフはその場だけで、次回は再びオン
- B5 / A4寸法のPDFを直接保存
- ブラウザの印刷メニューを開く
- 日本語 / English、System / Light / Dark を保存

## ブランドアセット

`assets/brand/brand-icon.svg` がロゴの生成正本、`assets/brand/og-image.svg` がOG背景・レイアウトの生成正本です。ブラウザへ配信する10ファイルはR2の公開CDN `images.snkisk.com` へ移し、URL・MIME・bytes・SHA256を `assets/brand/cdn-assets.json` で追跡します。headerのlight/darkマーク、SVG/PNG favicon、Apple touch icon、OG/Twitter PNG、manifestの192/512アイコンがCDNを参照します。OG SVG/WebPも配信用コピーをpublicから外していますが、現画面の参照は従来通りPNGです。

```bash
npm run generate:brand-assets
```

再生成先はGit管理外の `generated/brand-assets/` です。publicへ画像を再配置せず、CDNへのuploadも行いません。デザイン変更時は出力を確認し、正規のadminUIで再upload・公開bytes確認後にmappingとHTML/manifestを更新してください。PNGの生成は利用フォント環境にも依存するため、同じURLへ未確認の再生成画像を置き換えません。

`public/favicon.ico` は、adminUIがICOに対応せずuploadしていない唯一の配信用例外です。16/32/48pxを含む既存の同一origin fallbackと `/favicon.ico` の暗黙取得を維持します。更新が必要な場合だけ、生成結果を確認して `generated/brand-assets/favicon.ico` から明示的に同期します。生成正本SVGは編集・再生成用で、配信bundleには含めません。

manifest自身はsame-originの `/site.webmanifest` に残し、id/start_url/scope/displayを変更しません。新しいservice workerやoffline機能は追加しません。CDN画像の通常表示、CORSによるJS読取、ブラウザのmanifest処理、Appleホーム画面追加は別の確認項目です。OSへのインストール・Apple実機・タブ内faviconの最終採用は実機で未確認のまま成功扱いしません。印刷/PDFのcapture対象は紙面だけで、headerのCDNマークをcanvasへ描画しません。

## AIで作った文章を印刷する

ChatAIには、次のように頼むと題材の文章と、原稿小箱で開ける本文入り印刷URLを一度に依頼できます。

> 大学の論文を作って。genkou.snkisk.comの説明を読んで、同サイトで開く本文入り印刷URLを返して。追加の質問や公開は不要。

返ってきたURLを開き、仕上がりを確認してから印刷またはPDF保存してください。AIが必ずWeb参照を行うことまでは保証できません。

## ローカル起動

画面の状態とAI依頼文の表示・操作については [`src/README.md`](src/README.md) を参照してください。

Node.js 22 以上で実行します。

```bash
npm install
npm run dev
```

## 検証・公開

```bash
npm run typecheck
npm test
npm run build
npm run deploy
```

Cloudflare Workers Static Assets を使用しています。`wrangler.jsonc` の `assets.directory` は `dist` です。

## 公開URL

正規URLは `https://genkou.snkisk.com/`、使い方ページは `https://docs.genkou.snkisk.com/` です。Workerのカスタムドメインはこの2ホストを使用します。公開後は両ホストのHTTPS、home/docs、`llms.txt`、robots/sitemap、静的アセット、本文入り印刷リンクを確認します。
