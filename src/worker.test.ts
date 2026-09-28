import { describe, expect, it } from 'vitest'
import worker, { renderDocumentationHtml, type Env } from './worker'

const assetHtml = `<!doctype html><html lang="ja"><head><meta name="description" content="home"><link rel="canonical" href="https://genkou.snkisk.com/"><meta property="og:title" content="home"><meta property="og:description" content="home"><meta property="og:url" content="https://genkou.snkisk.com/"><meta property="og:locale" content="ja_JP"><meta property="og:image:alt" content="home"><meta name="twitter:title" content="home"><meta name="twitter:description" content="home"><title>home</title><script type="application/ld+json" id="website-structured-data">{"name":"原稿小箱"}</script></head><body><main id="seo-fallback" class="seo-fallback"><h1>root fallback</h1></main></body></html>`

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
    expect(response.headers.get('vary')).toBe('Accept-Language')
    const html = await response.text()
    expect(html).toContain('<html lang="ja" data-initial-language="ja">')
    expect(html).toContain('<link rel="canonical" href="https://genkou.snkisk.com/ja/" />')
  })

  it('言語別URLはブラウザの言語ヘッダーに影響されず、初期HTMLとcanonicalを揃える', async () => {
    const { env, requests } = withAssets()
    const japanese = await worker.fetch(new Request('https://genkou.snkisk.com/ja/', { headers: { 'accept-language': 'en-US,en;q=0.9' } }), env)
    const english = await worker.fetch(new Request('https://genkou.snkisk.com/en/', { headers: { 'accept-language': 'ja-JP,ja;q=0.9' } }), env)
    const jaHtml = await japanese.text()
    const enHtml = await english.text()

    expect(requests).toEqual(['/', '/'])
    expect(jaHtml).toContain('<html lang="ja" data-initial-language="ja">')
    expect(jaHtml).toContain('原稿小箱｜原稿用紙を作成して印刷・PDF保存')
    expect(jaHtml).toContain('https://genkou.snkisk.com/ja/')
    expect(enHtml).toContain('<html lang="en" data-initial-language="en">')
    expect(enHtml).toContain('<title>原稿小箱 | Japanese manuscript paper, ready to print</title>')
    expect(enHtml).toContain('Print Japanese manuscript paper, simply')
    expect(enHtml).toContain('content="原稿小箱 — Create and print Japanese manuscript paper"')
    expect(enHtml).toContain('"url":"https://genkou.snkisk.com/en/"')
    expect(enHtml).toContain('https://genkou.snkisk.com/en/')
    expect(enHtml).toContain('hreflang="ja"')
    expect(enHtml).toContain('hreflang="en"')
    expect(enHtml).not.toContain('root fallback')
  })

  it('rootは受け入れ言語の優先度を守り、英語ブラウザには英語HTMLを返す', async () => {
    const { env } = withAssets()
    const response = await worker.fetch(new Request('https://genkou.snkisk.com/', { headers: { 'accept-language': 'ja;q=0.7,en-US;q=0.9' } }), env)
    const html = await response.text()

    expect(html).toContain('<html lang="en" data-initial-language="en">')
    expect(html).toContain('<title>原稿小箱 | Japanese manuscript paper, ready to print</title>')
    expect(html).toContain('content="https://genkou.snkisk.com/en/"')
  })

  it('末尾スラッシュなしの言語別URLを正規のURLへ揃える', async () => {
    const { env, requests } = withAssets()
    const response = await worker.fetch(new Request('https://genkou.snkisk.com/ja?paper=b5'), env)

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://genkou.snkisk.com/ja/?paper=b5')
    expect(requests).toEqual([])
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

  it.each(['kantan.snkisk.com', 'docs.kantan.snkisk.com'])('廃止した%sのrootはWorkerで404を返す', async (host) => {
    const { env, requests } = withAssets()
    const response = await worker.fetch(new Request(`https://${host}/#v=1&text=legacy`), env)

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
    expect(requests).toEqual([])
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
