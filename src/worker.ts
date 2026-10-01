import { homepageCopy, type Language } from './lib/copy'

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
const localizedHomeUrl = (language: Language) => `${homeUrl}${language}/`

function preferredLanguage(header: string | null): Language {
  const locales = (header ?? '').split(',').map((entry, index) => {
    const [tag, ...parameters] = entry.trim().toLowerCase().split(';')
    const quality = parameters.find((part) => part.trim().startsWith('q='))
    return { tag, quality: quality ? Number(quality.trim().slice(2)) : 1, index }
  }).filter((locale) => Number.isFinite(locale.quality) && locale.quality > 0 && locale.quality <= 1)
  locales.sort((a, b) => b.quality - a.quality || a.index - b.index)
  for (const { tag } of locales) {
    if (tag === 'ja' || tag.startsWith('ja-')) return 'ja'
    if (tag === 'en' || tag.startsWith('en-')) return 'en'
  }
  return 'ja'
}

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

  const fallback = `<main id="seo-fallback" class="seo-fallback"><p>原稿小箱の使い方</p><h1>AIの文章を、原稿小箱で原稿用紙に</h1><p>題材を伝えて文章と本文入りリンクをAIに依頼できます。リンクを開き、内容を確認してから印刷またはPDF保存してください。</p><p>本文と設定はURLの # より後ろに含まれます。この部分はサイトへ送信されませんが、リンクを受け取った人には本文が読めるため、秘密の文章や個人情報を含む内容は共有しないでください。</p><p><a href="${homeUrl}">原稿小箱を開く</a></p><h2>本文入りリンクの作り方</h2><p>本文を encodeURIComponent でURLエンコードし、<code>https://genkou.snkisk.com/#v=1&amp;text=本文</code> の text に指定します。設定を省略すると標準の原稿用紙になります。本文の上限は20,000 Unicode文字です。</p><p><a href="${homeUrl}#v=1&amp;text=%E4%BD%9C%E6%96%87%E3%81%A7%E3%81%99%E3%80%82">「作文です。」を開くサンプル</a></p><p><a href="${homeUrl}llms.txt">AI向け印刷リンク仕様と全設定</a></p></main>`
  return result.replace(/<main\b(?=[^>]*\bid=(['"])seo-fallback\1)[^>]*>[\s\S]*?<\/main>/i, fallback)
}

export function renderHomeHtml(html: string, language: Language): string {
  const content = homepageCopy[language]
  const pageUrl = localizedHomeUrl(language)
  let result = html.replace(/<html\b[^>]*>/i, `<html lang="${language}" data-initial-language="${language}">`)
  result = result.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${content.title}</title>`)
  result = replaceMeta(result, 'name', 'description', content.description)
  result = replaceMeta(result, 'property', 'og:title', content.title)
  result = replaceMeta(result, 'property', 'og:description', content.description)
  result = replaceMeta(result, 'property', 'og:url', pageUrl)
  result = replaceMeta(result, 'property', 'og:locale', language === 'ja' ? 'ja_JP' : 'en_US')
  result = replaceMeta(result, 'property', 'og:image:alt', content.imageAlt)
  result = replaceMeta(result, 'name', 'twitter:title', content.title)
  result = replaceMeta(result, 'name', 'twitter:description', content.description)
  result = result.replace(/<link\b(?=[^>]*\brel=(['"])canonical\1)[^>]*>/i, `<link rel="canonical" href="${pageUrl}" />`)
  result = result.replace('</head>', `<link rel="alternate" hreflang="ja" href="${localizedHomeUrl('ja')}" /><link rel="alternate" hreflang="en" href="${localizedHomeUrl('en')}" /><link rel="alternate" hreflang="x-default" href="${homeUrl}" /></head>`)
  result = result.replace(/<script\b(?=[^>]*\bid=(['"])website-structured-data\1)[^>]*>[\s\S]*?<\/script>/i, `<script type="application/ld+json" id="website-structured-data">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: '原稿小箱', alternateName: 'genkou.snkisk.com', url: pageUrl })}</script>`)
  if (language === 'en') {
    result = result.replace(/<main\b(?=[^>]*\bid=(['"])seo-fallback\1)[^>]*>[\s\S]*?<\/main>/i, `<main id="seo-fallback" class="seo-fallback"><h1>${content.heading}</h1><p>${content.introduction}</p><p><a href="${docsUrl}">${content.docsLink}</a></p><p><a href="${homeUrl}llms.txt">AI print-link specification</a></p><noscript>${content.javascriptRequired}</noscript></main>`)
  }
  return result
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
    if (isRootHost && (url.pathname === '/ja' || url.pathname === '/en')) {
      url.pathname += '/'
      return Response.redirect(url.toString(), 308)
    }
    const isDocsPage = (isDocumentationHost && (url.pathname === '/' || url.pathname === '/index.html'))
      || (isRootHost && url.pathname === '/docs')
    const isRootPage = isRootHost && (url.pathname === '/' || url.pathname === '/ja/' || url.pathname === '/en/')
    const homeLanguage: Language = url.pathname === '/ja/' ? 'ja' : url.pathname === '/en/' ? 'en' : preferredLanguage(request.headers.get('accept-language'))

    let assetPath = url.pathname
    if (isDocsPage) assetPath = '/'
    else if (isDocumentationHost && url.pathname === '/robots.txt') assetPath = '/docs-robots.txt'
    else if (isDocumentationHost && url.pathname === '/sitemap.xml') assetPath = '/docs-sitemap.xml'
    else if (isRootPage && url.pathname !== '/') assetPath = '/'

    const assetRequest = assetPath === url.pathname ? request : new Request(new URL(assetPath, url), request)
    const response = await env.ASSETS.fetch(assetRequest)
    if (!response.headers.get('content-type')?.includes('text/html')) return response

    if (isDocsPage && request.method === 'GET') {
      return withUncompressedHtml(response, renderDocumentationHtml(await response.text()))
    }

    if (!isRootPage || request.method !== 'GET') return response
    const result = withUncompressedHtml(response, renderHomeHtml(await response.text(), homeLanguage))
    result.headers.append('Link', `<${homeUrl}llms.txt>; rel="alternate"; type="text/plain"; title*=UTF-8''${encodeURIComponent('原稿小箱 AI印刷リンク仕様')}`)
    if (url.pathname === '/') result.headers.set('Vary', 'Accept-Language')
    return result
  },
}
