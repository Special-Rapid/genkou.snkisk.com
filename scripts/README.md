# 開発用script

## ブランド素材の生成

`npm run generate:brand-assets` は `assets/brand/brand-icon.svg` と `og-image.svg` を原本として、既存の `generated/brand-assets/` にSVG・PNG・WebP・ICO計11ファイルを生成します。出力はGit対象外で、publicへのコピーやCDN uploadは行いません。

`generate-brand-assets.mts` は `npm run typecheck` で既存Node用strict設定の検査対象です。Nodeの型消去機能で実行するため、Node22.6以降を使用し、型変換を要する構文は `erasableSyntaxOnly` で拒否します。CIはNode22です。型消去は型検査を実行しないため、実行前にtypecheckを通します。

画像Mapは固定の6サイズをすべてawaitして格納した後だけ参照します。`Map.get` の非null指定はこの内部順序の証明に基づき、外部入力の検証を代替しません。SVG、Sharp設定、サイズ、ICO並び、出力pathは旧JSと同じです。旧JSと新TSからの全11出力を同じ環境でbyte比較して確認します。

## 配信用faviconの準備

`npm run prepare:favicon` は `prepare-favicon.mts` を同じNodeの型消去で実行します。build・dev・test前にも同じ処理が走ります。準備処理と `prepare-favicon.test.ts` はNode用strict型検査の対象です。

JSON読取り結果をunknownとして扱い、object・配列・各値の型を確認してから、既存の固定出力path、CDN origin/path、PNG16/32/48の順序、MIME、size、SHA256、ICO合計sizeを検証します。検証済み値から台帳を組み立てるため、型assertionで外部入力を通しません。不正なJSON構造もネットワーク取得・ICO書込み前に拒否します。

PNGキャッシュはcheckout外で、onlineのcache miss時だけ取得します。warm cacheは `GENKOU_ASSETS_OFFLINE=1 npm run prepare:favicon` で復元できます。破損cache、取得不一致、symlinkを拒否し、失敗時に元のICOを保持する契約をテストします。既存の正規台帳からは同じ1808-byte ICOを生成します。

```sh
npm run typecheck
GENKOU_ASSETS_OFFLINE=1 npm test
GENKOU_ASSETS_OFFLINE=1 npm run build
```

cold cacheでは先にonlineで準備します。編集用ブランド素材の生成と配信用PNG取得は別の処理です。製品docs・llms・privacyは維持します。
