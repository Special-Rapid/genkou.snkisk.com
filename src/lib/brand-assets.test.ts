import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assets from '../../assets/brand/cdn-assets.json'
import worker, { type Env } from '../worker'

const root = (path: string) => new URL(`../../${path}`, import.meta.url)
const html = readFileSync(root('index.html'), 'utf8')

describe('CDN brand asset contract', () => {
  it('preserves editable sources without publishing duplicate distribution images', () => {
    for (const name of ['brand-icon.svg', 'og-image.svg'] as const) {
      const source = readFileSync(root(`assets/brand/${name}`))
      expect(createHash('sha256').update(source).digest('hex')).toBe(assets[name].sha256)
    }
    for (const [name, asset] of Object.entries(assets)) {
      expect(new URL(asset.url).origin).toBe('https://images.snkisk.com')
      expect(new URL(asset.url).pathname).toMatch(/^\/genkou\.snkisk\.com\//)
      expect(existsSync(root(`public/${name}`))).toBe(false)
    }
    const ico = readFileSync(root('public/favicon.ico'))
    expect(createHash('sha256').update(ico).digest('hex')).toBe('ce0aba54f2982b3982885f5c61e87ad0e70f53207ba474c1f3cef6bc4fc08587')
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(3)
    expect([0, 1, 2].map(index => ico[6 + 16 * index])).toEqual([16, 32, 48])
  })

  it('keeps manifest identity and same-origin fallback while using CDN icon resources', () => {
    const manifest = JSON.parse(readFileSync(root('public/site.webmanifest'), 'utf8'))
    expect([manifest.id, manifest.start_url, manifest.scope, manifest.display]).toEqual(['/', '/', '/', 'browser'])
    expect(manifest.icons).toEqual([
      {src:assets['icon-192.png'].url,sizes:'192x192',type:'image/png',purpose:'any'},
      {src:assets['icon-512.png'].url,sizes:'512x512',type:'image/png',purpose:'any'},
    ])
    expect(html).toContain('href="/favicon.ico"')
    expect(html).toContain('href="/site.webmanifest"')
    expect(html).toContain(assets['apple-touch-icon.png'].url)
    expect(html).toContain(assets['favicon-32.png'].url)
    expect(html).toContain(assets['favicon-48.png'].url)
  })

  it.each(['genkou.snkisk.com', 'docs.genkou.snkisk.com'])('preserves the generated ICO response on %s', async host => {
    const ico = readFileSync(root('public/favicon.ico'))
    const response = new Response(ico, { headers: { 'content-type': 'image/vnd.microsoft.icon', 'cache-control': 'public, max-age=3600' } })
    const env: Env = { ASSETS: { fetch: async request => {
      expect(new URL(request.url).pathname).toBe('/favicon.ico')
      return response
    } } }
    const result = await worker.fetch(new Request(`https://${host}/favicon.ico`), env)
    expect(result).toBe(response)
    expect(Buffer.from(await result.arrayBuffer())).toEqual(ico)
  })

  it.each(['https://genkou.snkisk.com/ja/', 'https://genkou.snkisk.com/en/', 'https://docs.genkou.snkisk.com/ja/', 'https://docs.genkou.snkisk.com/en/'])('serves consistent CDN social/icon references on %s', async url => {
    const env: Env = {ASSETS:{fetch:async()=>new Response(html,{headers:{'content-type':'text/html'}})}}
    const body = await (await worker.fetch(new Request(url), env)).text()
    expect(body).toContain(`<meta property="og:image" content="${assets['og-image.png'].url}"`)
    expect(body).toContain(`<meta name="twitter:image" content="${assets['og-image.png'].url}"`)
    expect(body).toContain(assets['brand-icon.svg'].url)
    expect(body).not.toContain('https://genkou.snkisk.com/og-image.png')
    expect(body).not.toContain('href="/brand-icon.svg"')
    expect(body).toContain('hreflang="ja"')
    expect(body).toContain('hreflang="en"')
  })
})
