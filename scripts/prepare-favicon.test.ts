import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeIco, prepareFavicon } from './prepare-favicon.mts'

import type { FaviconManifest, IcoImage, PrepareFaviconOptions } from './prepare-favicon.mts'

interface Fixture extends PrepareFaviconOptions {
  root: string; cacheDir: string; images: IcoImage[]; ico: Buffer; manifest: FaviconManifest; save: () => Promise<void>; seed: () => Promise<void>
}

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
async function fixture(action: (ctx: Fixture) => Promise<void>) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'genkou-favicon-test-'))
  const root = path.join(base, 'checkout'), cacheDir = path.join(base, 'cache')
  await mkdir(path.join(root, 'assets/brand'), { recursive: true })
  await mkdir(cacheDir)
  const images = [16, 32, 48].map(width => {
    const bytes = Buffer.alloc(24)
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
    bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(width, 20)
    return { width, bytes }
  })
  const ico = encodeIco(images)
  const inputs = images.map((image, index) => ({ width: image.width, bytes: image.bytes.length, sha256: digest(image.bytes), mime: 'image/png', url: `https://images.snkisk.com/genkou.snkisk.com/${index}.png` }))
  const manifest: FaviconManifest = { version: 1, output: { path: 'public/favicon.ico', bytes: ico.length, sha256: digest(ico) }, inputs }
  const save = () => writeFile(path.join(root, 'assets/brand/favicon-inputs.json'), JSON.stringify(manifest))
  await save()
  const seed = async () => { for (const [index, asset] of inputs.entries()) await writeFile(path.join(cacheDir, asset.sha256), images[index].bytes) }
  try { await action({ root, cacheDir, offline: false, images, ico, manifest, save, seed }) }
  finally { await rm(base, { recursive: true, force: true }) }
}

describe('locked favicon bootstrap', () => {
  it('cold online preparation preserves multi-size ICO and then restores offline from warm cache', async () => fixture(async ctx => {
    let requests = 0
    const fetcher: typeof globalThis.fetch = async (input, options) => {
      expect(options?.redirect).toBe('error')
      expect(options?.signal).toBeInstanceOf(AbortSignal)
      const url = input instanceof Request ? input.url : String(input)
      const match = new URL(url).pathname.match(/(\d)\.png$/)
      if (!match) throw new Error('Unexpected fixture URL')
      const index = Number(match[1]); requests++
      return new Response(new Uint8Array(ctx.images[index].bytes), { headers: { 'content-type': 'image/png' } })
    }
    await prepareFavicon({ ...ctx, fetcher })
    expect(requests).toBe(3)
    expect(await readFile(path.join(ctx.root, 'public/favicon.ico'))).toEqual(ctx.ico)
    expect(ctx.ico.readUInt16LE(4)).toBe(3)
    expect([ctx.ico[6], ctx.ico[22], ctx.ico[38]]).toEqual([16, 32, 48])
    await rm(path.join(ctx.root, 'public/favicon.ico'))
    await prepareFavicon({ ...ctx, offline: true, fetcher: () => { throw new Error('Offline contacted network') } })
    expect(await readFile(path.join(ctx.root, 'public/favicon.ico'))).toEqual(ctx.ico)
  }))

  it('cold offline misses fail without creating an output', async () => fixture(async ctx => {
    await expect(prepareFavicon({ ...ctx, offline: true })).rejects.toThrow('Offline PNG cache miss')
    await expect(readFile(path.join(ctx.root, 'public/favicon.ico'))).rejects.toThrow()
  }))

  it('corrupt last input cannot overwrite an existing ICO or silently refetch', async () => fixture(async ctx => {
    await ctx.seed(); await mkdir(path.join(ctx.root, 'public')); await writeFile(path.join(ctx.root, 'public/favicon.ico'), 'original output')
    const damaged = Buffer.from(ctx.images[2].bytes); damaged[10] ^= 1
    await writeFile(path.join(ctx.cacheDir, ctx.manifest.inputs[2].sha256), damaged)
    await expect(prepareFavicon({ ...ctx, fetcher: () => { throw new Error('Must not refetch corrupted cache') } })).rejects.toThrow('mismatch')
    expect(await readFile(path.join(ctx.root, 'public/favicon.ico'), 'utf8')).toBe('original output')
  }))

  it.each(['redirect', 'MIME', 'size', 'hash', 'network'])('rejects %s failures before publishing an ICO', async mode => fixture(async ctx => {
    const fetcher = async () => {
      if (mode === 'network') throw new Error('offline')
      if (mode === 'redirect') return new Response(null, { status: 302 })
      let bytes = ctx.images[0].bytes
      if (mode === 'size') bytes = Buffer.concat([bytes, Buffer.from([0])])
      if (mode === 'hash') { bytes = Buffer.from(bytes); bytes[10] ^= 1 }
      return new Response(new Uint8Array(bytes), { headers: { 'content-type': mode === 'MIME' ? 'text/html' : 'image/png' } })
    }
    await expect(prepareFavicon({ ...ctx, fetcher })).rejects.toThrow()
    await expect(readFile(path.join(ctx.root, 'public/favicon.ico'))).rejects.toThrow()
  }))

  it('preflights all URL/order/output mappings before network access', async () => fixture(async ctx => {
    ctx.manifest.inputs[2].url = 'https://example.com/icon.png'; await ctx.save()
    await expect(prepareFavicon({ ...ctx, fetcher: () => { throw new Error('network called before preflight') } })).rejects.toThrow('Invalid PNG mapping')
    ctx.manifest.inputs[2].url = 'https://images.snkisk.com/genkou.snkisk.com/2.png'; ctx.manifest.output.path = '../outside.ico'; await ctx.save()
    await expect(prepareFavicon(ctx)).rejects.toThrow('Invalid favicon mapping')
  }))

  it.each([null, [], { version: 1, output: null, inputs: [] }, { version: 1, output: { path: 'public/favicon.ico', bytes: '126', sha256: '0'.repeat(64) }, inputs: [] }])('rejects malformed JSON before network or output replacement: %j', async raw => fixture(async ctx => {
    await mkdir(path.join(ctx.root, 'public')); await writeFile(path.join(ctx.root, 'public/favicon.ico'), 'original output')
    await writeFile(path.join(ctx.root, 'assets/brand/favicon-inputs.json'), JSON.stringify(raw))
    let requests = 0
    await expect(prepareFavicon({ ...ctx, fetcher: async () => { requests++; throw new Error('Must not fetch') } })).rejects.toThrow('Invalid favicon mapping')
    expect(requests).toBe(0)
    expect(await readFile(path.join(ctx.root, 'public/favicon.ico'), 'utf8')).toBe('original output')
  }))

  it('rejects non-string input metadata before network or output replacement', async () => fixture(async ctx => {
    await mkdir(path.join(ctx.root, 'public')); await writeFile(path.join(ctx.root, 'public/favicon.ico'), 'original output')
    const raw = { ...ctx.manifest, inputs: ctx.manifest.inputs.map((asset, index) => index === 2 ? { ...asset, url: 123 } : asset) }
    await writeFile(path.join(ctx.root, 'assets/brand/favicon-inputs.json'), JSON.stringify(raw))
    let requests = 0
    await expect(prepareFavicon({ ...ctx, fetcher: async () => { requests++; throw new Error('Must not fetch') } })).rejects.toThrow('Invalid PNG mapping')
    expect(requests).toBe(0)
    expect(await readFile(path.join(ctx.root, 'public/favicon.ico'), 'utf8')).toBe('original output')
  }))

  it('rejects a cache directory resolving into checkout through a symlink', async () => fixture(async ctx => {
    const alias = path.join(ctx.cacheDir, 'alias'); await symlink(ctx.root, alias)
    await expect(prepareFavicon({ ...ctx, cacheDir: path.join(alias, 'new-cache') })).rejects.toThrow('outside checkout')
  }))

  it('rejects symlink output and cache files', async () => fixture(async ctx => {
    await ctx.seed(); await mkdir(path.join(ctx.root, 'public')); await symlink(path.join(ctx.cacheDir, ctx.manifest.inputs[0].sha256), path.join(ctx.root, 'public/favicon.ico'))
    await expect(prepareFavicon(ctx)).rejects.toThrow('Symlink output')
    await rm(path.join(ctx.root, 'public/favicon.ico'))
    const cached = path.join(ctx.cacheDir, ctx.manifest.inputs[0].sha256); await rm(cached); await symlink(path.join(ctx.cacheDir, ctx.manifest.inputs[1].sha256), cached)
    await expect(prepareFavicon(ctx)).rejects.toThrow('Invalid PNG cache entry')
  }))

  it('a changed output digest cannot publish an otherwise valid input set', async () => fixture(async ctx => {
    await ctx.seed(); ctx.manifest.output.sha256 = '0'.repeat(64); await ctx.save()
    await expect(prepareFavicon(ctx)).rejects.toThrow('Pinned ICO size/hash mismatch')
    await expect(readFile(path.join(ctx.root, 'public/favicon.ico'))).rejects.toThrow()
  }))
})
