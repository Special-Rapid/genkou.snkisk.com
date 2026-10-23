[日本語](README-ja.md)

# Genkou (原稿小箱)

Genkou arranges text on Japanese manuscript paper so you can preview B5 or A4 pages, print them, or save them as a PDF.

## Features

- Choose B5 / A4, vertical / horizontal writing, and the number of characters and rows.
- Preview the manuscript pages in real time.
- Use the optional advanced settings to adjust Mincho / Gothic fonts, font size, margins, grid color, and page orientation only when needed.
- Start with a light brown grid, or choose another color.
- Show `genkou.snkisk.com` at the lower left of the paper by default. Turning it off applies only to the current session; it is enabled again next time.
- Save a PDF directly at B5 / A4 dimensions.
- Open the browser's print dialog.
- Save Japanese / English language and System / Light / Dark appearance preferences.

## Brand assets

See [`scripts/README.md`](scripts/README.md) for type checking and runtime requirements for asset generation and favicon preparation.

`assets/brand/brand-icon.svg` is the source of truth for the generated logo, and `assets/brand/og-image.svg` is the source for the OG background and layout. The 10 files delivered to browsers are hosted on the public R2 CDN at `images.snkisk.com`; their URLs, MIME types, byte sizes, and SHA256 hashes are tracked in `assets/brand/cdn-assets.json`. The light/dark header marks, SVG/PNG favicons, Apple touch icon, OG/Twitter PNG, and 192/512 manifest icons reference the CDN. The OG SVG/WebP distribution copies have also been removed from public, while the current page continues to reference the PNG.

```bash
npm run generate:brand-assets
```

Regenerated files go to the untracked `generated/brand-assets/` directory. This command neither places images back in public nor uploads them to the CDN. For a design change, inspect the output, upload it through the authorized admin UI, verify the published bytes, and then update the mapping and HTML/manifest. PNG generation also depends on the available fonts, so do not replace an image at the same URL with an unverified regenerated file.

`public/favicon.ico` is an untracked compatibility artifact. Instead of uploading an ICO through the admin UI, the preparation script validates the fixed CDN PNG16/32/48 inputs in `assets/brand/favicon-inputs.json` against SHA/MIME/byte metadata and assembles the same 1808-byte ICO before build/dev/test. Same-origin `/favicon.ico` delivery and the 16/32/48px fallback remain available. Explicit PNG/SVG references in the browser continue to use the CDN. The final ICO is a same-origin build artifact for compatibility; the source images live in R2. Editable SVG render output is not automatically synchronized to public.

The PNG cache lives outside Git at `~/.cache/genkou/favicon` and can be overridden with `GENKOU_ASSET_CACHE_DIR`. Initial preparation requires a connection; a warm cache can be restored with `GENKOU_ASSETS_OFFLINE=1 npm run build`. A cold offline miss, corrupt cache, or download mismatch fails rather than publishing an unverified ICO. To update the brand, the owner must review the source images before changing the PNG URLs/hashes and the expected ICO output hash.

```sh
npm ci
npm run prepare:favicon
npm test
npm run build
```

The manifest itself stays at same-origin `/site.webmanifest`; its id/start_url/scope/display are unchanged. No new service worker or offline feature is added. Normal CDN image display, JavaScript reads through CORS, browser manifest processing, and adding the app to an Apple home screen are separate checks. OS installation, physical Apple devices, and the browser's final adoption of the tab favicon remain unverified; do not treat them as confirmed successes. Print/PDF capture includes only the paper, so the header's CDN mark is not drawn onto the canvas.

## Print text written with AI

Ask a chat AI for both the text and a print URL containing that text, for example:

> Write a university paper. Read the description at genkou.snkisk.com and return a print URL containing the text that opens on that site. No additional questions or publication are needed.

Open the returned URL, check the result, and then print it or save it as a PDF. The AI is not guaranteed to consult the website.

## Run locally

See [`src/README.md`](src/README.md) for UI state and the display and behavior of the AI prompt controls.

Use Node.js 22.23.4, the version used by CI, as the development baseline.

```bash
npm install
npm run dev
```

## Verify and deploy

```bash
npm run typecheck
npm test
npm run build
npm run deploy
```

The project uses Cloudflare Workers Static Assets. In `wrangler.jsonc`, `assets.directory` is `dist`.

## Public URLs

The canonical search URLs are `https://genkou.snkisk.com/ja/` and `https://genkou.snkisk.com/en/`. The root `https://genkou.snkisk.com/` remains a compatibility entry point for print links containing text. The guide is at `https://docs.genkou.snkisk.com/`. These two hosts are the Worker's custom domains. After deployment, check HTTPS, the home/guide pages, `llms.txt`, robots/sitemap, static assets, and print links containing text on both hosts.

## License

This project's own code is licensed under the [MIT License](LICENSE). Third-party components remain under their respective licenses.
