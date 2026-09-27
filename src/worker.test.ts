import { describe, expect, it } from 'vitest'
import worker, { renderDocumentationHtml, type Env } from './worker'

const assetHtml = `<!doctype html><html><head><meta name="description" content="home"><link rel="canonical" href="https://genkou.snkisk.com/"><meta property="og:title" content="home"><meta property="og:description" content="home"><meta property="og:url" content="https://genkou.snkisk.com/"><meta name="twitter:title" content="home"><meta name="twitter:description" content="home"><title>home</title><script type="application/ld+json" id="website-structured-data">{"name":"原稿小箱"}</script></head><body><main id="seo-fallback" class="seo-fallback"><h1>root fallback</h1></main></body></html>`

const withAssets = (contentType = 'text/html; charset=utf-8') => {
  const requests: string[] = []
  const env: Env = {
    ASSETS: {
      fetch: async (request) => {
        requests.push(new URL(request.url).pathname)
        return new Response(assetHtml, { headers: { 'content-type': contentType } })
      },
    },
  }
  return { env, requests }
}

describe('WorkerのAI仕様と文書host', () => {
  it('rootのHTMLにAI仕様Linkヘッダーを付ける', async () => {
    const { env, requests } = withAssets()
    const response = await worker.fetch(new Request('https://genkou.snkisk.com/'), env)

    expect(requests).toEqual(['/'])
    expect(response.headers.get('link')).toContain('https://genkou.snkisk.com/llms.txt')
    expect(response.headers.get('link')).toContain('rel="alternate"')
    expect(response.headers.get('link')).toContain(encodeURIComponent('原稿小箱 AI印刷リンク仕様'))
  })

  it('docs hostのHTMLに固有のSEO情報と静的本文を返す', async () => {
    const { env, requests } = withAssets()
    const response = await worker.fetch(new Request('https://docs.genkou.snkisk.com/'), env)
    const html = await response.text()

    expect(requests).toEqual(['/docs'])
    expect(response.headers.get('link')).toBeNull()
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('<title>原稿小箱の使い方｜AIで文章と印刷リンクを作る</title>')
    expect(html).toContain('content="https://docs.genkou.snkisk.com/"')
    expect(html).toContain('AIの文章を、原稿小箱で原稿用紙に')
    expect(html).not.toContain('root fallback')
    expect(html).toContain('"name":"原稿小箱"')
  })

  it('root以外とHTML以外へAI仕様ヘッダーを広げない', async () => {
    const { env, requests } = withAssets('text/plain; charset=utf-8')
    const response = await worker.fetch(new Request('https://genkou.snkisk.com/llms.txt'), env)

    expect(requests).toEqual(['/llms.txt'])
    expect(response.headers.get('link')).toBeNull()
  })

  it('docs hostのrobotsとsitemapをsubdomain専用資産へ解決する', async () => {
    const { env, requests } = withAssets('text/plain; charset=utf-8')
    await worker.fetch(new Request('https://docs.genkou.snkisk.com/robots.txt'), env)
    await worker.fetch(new Request('https://docs.genkou.snkisk.com/sitemap.xml'), env)

    expect(requests).toEqual(['/docs-robots.txt', '/docs-sitemap.xml'])
  })

  it('root hostの/docsもdocs canonicalへ揃える', async () => {
    const { env, requests } = withAssets()
    const response = await worker.fetch(new Request('https://genkou.snkisk.com/docs'), env)
    const html = await response.text()

    expect(requests).toEqual(['/docs'])
    expect(html).toContain('https://docs.genkou.snkisk.com/')
  })

  it('旧rootを転送せず表示し、保存本文と本文入りリンクを開ける状態に保つ', async () => {
    const { env, requests } = withAssets()
    const response = await worker.fetch(new Request('https://kantan.snkisk.com/#v=1&text=legacy'), env)
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(requests).toEqual(['/'])
    expect(html).toContain('https://genkou.snkisk.com/')
    expect(response.headers.get('location')).toBeNull()
  })

  it('旧docs hostの表示とcanonicalを維持する', async () => {
    const { env, requests } = withAssets()
    const response = await worker.fetch(new Request('https://docs.kantan.snkisk.com/'), env)
    const html = await response.text()

    expect(requests).toEqual(['/docs'])
    expect(html).toContain('<link rel="canonical" href="https://docs.genkou.snkisk.com/" />')
    expect(response.headers.get('location')).toBeNull()
  })

  it('docs headの置換でcontent-length・encoding・etagを残さない', async () => {
    const response = new Response(assetHtml, { headers: { 'content-type': 'text/html', 'content-length': '1', 'content-encoding': 'identity', etag: 'stale' } })
    const env: Env = { ASSETS: { fetch: async () => response } }
    const result = await worker.fetch(new Request('https://docs.genkou.snkisk.com/'), env)

    expect(result.headers.get('content-length')).toBeNull()
    expect(result.headers.get('content-encoding')).toBeNull()
    expect(result.headers.get('etag')).toBeNull()
  })

  it('metadata helper escapes replacement text and rewrites docs canonical and fallback', () => {
    const html = renderDocumentationHtml(assetHtml)
    expect(html).toContain('<link rel="canonical" href="https://docs.genkou.snkisk.com/" />')
    expect(html).toContain('<main id="seo-fallback" class="seo-fallback">')
  })
})
