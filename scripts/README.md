# Development scripts

## Generate brand assets

`npm run generate:brand-assets` uses `assets/brand/brand-icon.svg` and `og-image.svg` as sources and generates 11 SVG, PNG, WebP, and ICO files in the existing `generated/brand-assets/` directory. Output is ignored by Git; the command does not copy it to public or upload it to the CDN.

`generate-brand-assets.mts` is covered by the existing Node strict configuration through `npm run typecheck`. It runs with Node's type stripping, requiring Node 22.6 or later. `erasableSyntaxOnly` rejects syntax that would require transformation. CI uses Node 22. Type stripping does not perform type checking, so run typecheck before execution.

The image Map is read only after all six fixed sizes have been awaited and stored. The non-null assertion on `Map.get` relies on this internal ordering and does not replace validation of external input. SVGs, Sharp settings, sizes, ICO ordering, and output paths match the previous JavaScript implementation. Compare all 11 outputs from the old JavaScript and new TypeScript byte for byte in the same environment to verify equivalence.

## Prepare the delivered favicon

`npm run prepare:favicon` runs `prepare-favicon.mts` with the same Node type stripping. Preparation also runs before build, dev, and test. Both preparation and `prepare-favicon.test.ts` are covered by Node strict type checking.

Parsed JSON is treated as unknown. After checking objects, arrays, and each value's type, preparation validates the existing fixed output path, CDN origin/path, PNG16/32/48 ordering, MIME types, sizes, SHA256 hashes, and total ICO size. It constructs the registry from validated values instead of using type assertions to bypass external-input checks. Invalid JSON structures are rejected before network fetching or ICO writes.

The PNG cache lives outside the checkout; files are fetched only on an online cache miss. A warm cache can be restored with `GENKOU_ASSETS_OFFLINE=1 npm run prepare:favicon`. Tests cover rejection of corrupt caches, download mismatches, and symlinks, and preservation of the original ICO on failure. The existing canonical registry produces the same 1808-byte ICO.

```sh
npm run typecheck
GENKOU_ASSETS_OFFLINE=1 npm test
GENKOU_ASSETS_OFFLINE=1 npm run build
```

Prepare online first when the cache is cold. Generating editable brand assets and fetching delivery PNGs are separate operations. Preserve the product docs, llms, and privacy content.
