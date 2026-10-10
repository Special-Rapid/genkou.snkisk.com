# 開発用script

## ブランド素材の生成

`npm run generate:brand-assets` は `assets/brand/brand-icon.svg` と `og-image.svg` を原本として、既存の `generated/brand-assets/` にSVG・PNG・WebP・ICO計11ファイルを生成します。出力はGit対象外で、publicへのコピーやCDN uploadは行いません。

`generate-brand-assets.mts` は `npm run typecheck` で既存Node用strict設定の検査対象です。Nodeの型消去機能で実行するため、Node22.6以降を使用し、型変換を要する構文は `erasableSyntaxOnly` で拒否します。CIはNode22です。型消去は型検査を実行しないため、実行前にtypecheckを通します。

画像Mapは固定の6サイズをすべてawaitして格納した後だけ参照します。`Map.get` の非null指定はこの内部順序の証明に基づき、外部入力の検証を代替しません。SVG、Sharp設定、サイズ、ICO並び、出力pathは旧JSと同じです。旧JSと新TSからの全11出力を同じ環境でbyte比較して確認します。

`prepare-favicon.mjs` とそのtestの移行は親Issue #35の残作業です。製品docs・llms・privacyは維持します。
