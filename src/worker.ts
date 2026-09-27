export interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

const homeUrl = 'https://genkou.snkisk.com/'
const docsUrl = 'https://docs.genkou.snkisk.com/'
const rootHosts = new Set(['genkou.snkisk.com'])
const documentationHosts = new Set(['docs.genkou.snkisk.com'])
const retiredHosts = new Set(['kantan.snkisk.com', 'docs.kantan.snkisk.com'])
const docsTitle = '原稿小箱の使い方｜AIで文章と印刷リンクを作る'
const docsDescription = 'AIへの短い依頼文から、文章と本文入りの原稿小箱リンクを作る方法。リンクを開いて内容を確認してから印刷・PDF保存できます。'

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

function replaceMeta(html: string, attribute: 'name' | 'property', key: string, value: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=(['"])${escapedKey}\\1)[^>]*>`, 'i')
  const content = `<meta ${attribute}="${key}" content="${escapeAttribute(value)}" />`
  return html.replace(pattern, content)
}

export function renderDocumentationHtml(html: string): string {
  let result = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${docsTitle}</title>`)
  result = replaceMeta(result, 'name', 'description', docsDescription)
  result = replaceMeta(result, 'property', 'og:title', docsTitle)
  result = replaceMeta(result, 'property', 'og:description', docsDescription)
  result = replaceMeta(result, 'property', 'og:url', docsUrl)
  result = replaceMeta(result, 'name', 'twitter:title', docsTitle)
  result = replaceMeta(result, 'name', 'twitter:description', docsDescription)
  result = result.replace(/<link\b(?=[^>]*\brel=(['"])canonical\1)[^>]*>/i, `<link rel="canonical" href="${docsUrl}" />`)

  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '原稿小箱',
    alternateName: 'genkou.snkisk.com',
    url: docsUrl,
  })
  result = result.replace(/<script\b(?=[^>]*\bid=(['"])website-structured-data\1)[^>]*>[\s\S]*?<\/script>/i, `<script type="application/ld+json" id="website-structured-data">${structuredData}</script>`)

  const fallback = `<main id="seo-fallback" class="seo-fallback"><p>原稿小箱の使い方</p><h1>AIの文章を、原稿小箱で原稿用紙に</h1><p>題材を伝えて文章と本文入りリンクをAIに依頼できます。リンクを開き、内容を確認してから印刷またはPDF保存してください。</p><p>本文と設定はURLの # より後ろに含まれます。この部分はサイトへ送信されませんが、リンクを受け取った人には本文が読めるため、秘密の文章や個人情報を含む内容は共有しないでください。</p><p><a href="${homeUrl}">原稿小箱を開く</a></p><p><a href="${homeUrl}llms.txt">AI向け印刷リンク仕様</a></p></main>`
  return result.replace(/<main\b(?=[^>]*\bid=(['"])seo-fallback\1)[^>]*>[\s\S]*?<\/main>/i, fallback)
}

function withUncompressedHtml(response: Response, html: string): Response {
  const headers = new Headers(response.headers)
  headers.set('content-type', 'text/html; charset=utf-8')
  headers.delete('content-length')
  headers.delete('content-encoding')
  headers.delete('content-md5')
  headers.delete('etag')
  return new Response(html, { status: response.status, statusText: response.statusText, headers })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (retiredHosts.has(url.hostname)) return new Response(null, { status: 404 })
    const isDocumentationHost = documentationHosts.has(url.hostname)
    const isRootHost = rootHosts.has(url.hostname)
    const isDocsPage = (isDocumentationHost && (url.pathname === '/' || url.pathname === '/index.html'))
      || (isRootHost && url.pathname === '/docs')
    const isRootPage = isRootHost && url.pathname === '/'

    let assetPath = url.pathname
    if (isDocumentationHost && (url.pathname === '/' || url.pathname === '/index.html')) assetPath = '/docs'
    else if (isDocumentationHost && url.pathname === '/robots.txt') assetPath = '/docs-robots.txt'
    else if (isDocumentationHost && url.pathname === '/sitemap.xml') assetPath = '/docs-sitemap.xml'

    const assetRequest = assetPath === url.pathname ? request : new Request(new URL(assetPath, url), request)
    const response = await env.ASSETS.fetch(assetRequest)
    if (!response.headers.get('content-type')?.includes('text/html')) return response

    if (isDocsPage && request.method === 'GET') {
      return withUncompressedHtml(response, renderDocumentationHtml(await response.text()))
    }

    if (!isRootPage) return response
    const headers = new Headers(response.headers)
    headers.append('Link', `<${homeUrl}llms.txt>; rel="alternate"; type="text/plain"; title*=UTF-8''${encodeURIComponent('原稿小箱 AI印刷リンク仕様')}`)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  },
}
