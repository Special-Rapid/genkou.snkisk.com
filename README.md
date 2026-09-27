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

`public/brand-icon.svg` がロゴアイコンの正本、`public/og-image.svg` がOG画像の背景・レイアウト正本です。アイコンやOG画像の元データを変更したら、次のコマンドでfavicon（ICO/PNG）、Apple touch icon、web app icon（192/512px）、OG画像（PNG/WebP）を再生成します。

```bash
npm run generate:brand-assets
```

## AIで作った文章を印刷する

ChatAIには、次のように頼むと題材の文章と、原稿小箱で開ける本文入り印刷URLを一度に依頼できます。

> 大学の論文を作って。genkou.snkisk.comの説明を読んで、同サイトで開く本文入り印刷URLを返して。追加の質問や公開は不要。

返ってきたURLを開き、仕上がりを確認してから印刷またはPDF保存してください。AIが必ずWeb参照を行うことまでは保証できません。

## ローカル起動

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

## 公開URLの移行

正規URLは `https://genkou.snkisk.com/`、使い方ページは `https://docs.genkou.snkisk.com/` です。Workerは従来の `kantan.snkisk.com` と `docs.kantan.snkisk.com` も受け付け、旧URLを即時転送しません。本文入りリンクの `#` 以降はサーバーへ送られず、ブラウザ保存の本文も旧オリジンにあるためです。旧URLの画面から本文を確認できる状態を保ったまま、検索用の正規URLと新しい案内リンクを新URLへ揃えます。

公開時は、Cloudflareの新しい2つのカスタムドメインを既存Workerへ追加し、旧2つのカスタムドメインも残します。新旧4ホストのHTTPS、home/docs、`llms.txt`、robots/sitemap、静的アセット、本文入り印刷リンクを確認します。失敗した場合は新カスタムドメインの経路を外し、旧2ホストを維持したまま直前のWorker版へ戻します。
