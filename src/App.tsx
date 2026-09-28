import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { copy, documentationCopy, homepageCopy, rootPromptCopy, type Labels, type Language } from './lib/copy'
import { manuscriptCharacters, manuscriptDisplayCells, manuscriptPages, pageTotal, type Direction, type ManuscriptCell } from './lib/layout'
import { gridMetricsForFrame, type GridMetrics } from './lib/grid-metrics'
import { parsePrintLink, type PrintLinkPayload, type PrintLinkResult } from './lib/print-link'

type Theme = 'system' | 'light' | 'dark'
type PaperId = 'b5' | 'a4'
type PaperOrientation = 'portrait' | 'landscape'
type CompositionId = '10x20' | '14x14' | '16x25' | '20x10' | '20x20' | '20x25' | '25x16' | '25x20' | '30x40' | '40x30' | '40x40'
type Margin = 'narrow' | 'standard' | 'wide' | 'custom'
type Status = { tone: 'success' | 'error'; message: string; retryPdf?: boolean; printLinkError?: 'invalid' | 'too-long' } | null
type LanguagePreference = Language | 'system'

const defaultLanguage = (): Language => {
  const locales = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const locale of locales) {
    const normalized = locale.toLowerCase()
    if (normalized === 'ja' || normalized === 'en') return normalized
  }
  for (const locale of locales) {
    const normalized = locale.toLowerCase()
    if (normalized === 'ja' || normalized.startsWith('ja-')) return 'ja'
    if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
  }
  return 'ja'
}

const papers: Record<PaperId, { ja: string; en: string; width: number; height: number }> = {
  b5: { ja: 'B5（182 × 257 mm）', en: 'B5 (182 × 257 mm)', width: 182, height: 257 },
  a4: { ja: 'A4（210 × 297 mm）', en: 'A4 (210 × 297 mm)', width: 210, height: 297 },
}

const compositions: Record<CompositionId, { characters: number; lines: number }> = {
  '10x20': { characters: 10, lines: 20 },
  '14x14': { characters: 14, lines: 14 },
  '20x10': { characters: 20, lines: 10 },
  '20x20': { characters: 20, lines: 20 },
  '16x25': { characters: 16, lines: 25 },
  '25x16': { characters: 25, lines: 16 },
  '20x25': { characters: 20, lines: 25 },
  '25x20': { characters: 25, lines: 20 },
  '30x40': { characters: 30, lines: 40 },
  '40x30': { characters: 40, lines: 30 },
  '40x40': { characters: 40, lines: 40 },
}
const languageOptions = ['ja', 'system', 'en'] as const
const themeOptions = ['light', 'system', 'dark'] as const
const directionOptions = ['vertical', 'horizontal'] as const
const paperOrientationOptions = ['portrait', 'landscape'] as const
const marginPercentages: Record<Exclude<Margin, 'custom'>, number> = { narrow: 10, standard: 20, wide: 30 }
const cssPixelInMillimeters = 25.4 / 96

function updateDocumentMetadata(title: string, description: string) {
  document.title = title
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', description)
  document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.setAttribute('content', title)
  document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.setAttribute('content', description)
  document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.setAttribute('content', title)
  document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.setAttribute('content', description)
}

function updateHomeLanguageMetadata(language: Language) {
  const canonicalUrl = `https://genkou.snkisk.com/${language}/`
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', canonicalUrl)
  document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.setAttribute('content', canonicalUrl)
  document.querySelector<HTMLMetaElement>('meta[property="og:locale"]')?.setAttribute('content', language === 'ja' ? 'ja_JP' : 'en_US')
  document.querySelector<HTMLMetaElement>('meta[property="og:image:alt"]')?.setAttribute('content', homepageCopy[language].imageAlt)
  const structuredData = document.getElementById('website-structured-data')
  if (structuredData) structuredData.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '原稿小箱',
    alternateName: 'genkou.snkisk.com',
    url: canonicalUrl,
  })
}

function updateThemeColor(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme
  const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (color) document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', color)
}

function brandIconSource(theme: Theme, systemDark: boolean) {
  return theme === 'dark' || (theme === 'system' && systemDark) ? '/brand-icon-dark.svg' : '/brand-icon.svg'
}

function stored<T>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback } catch { return fallback }
}

function persist(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* ブラウザ保存が使えなくても画面操作を継続する。 */ }
}

function initialLanguagePreference(): LanguagePreference {
  const preference = stored<string>('kantan:language-preference', '')
  if (preference === 'ja' || preference === 'en') return preference
  if (preference === 'system' && stored<string>('kantan:language-manual', '') === 'true') return 'system'
  if (preference !== 'system') {
    const legacyLanguage = stored<string>('kantan:language', '')
    if (legacyLanguage === 'ja' || legacyLanguage === 'en') return legacyLanguage
  }
  if (window.location.pathname === '/ja/') return 'ja'
  if (window.location.pathname === '/en/') return 'en'
  return 'system'
}

function hasManualLanguagePreference(): boolean {
  const preference = stored<string>('kantan:language-preference', '')
  return preference === 'ja' || preference === 'en'
    || (preference === 'system' && stored<string>('kantan:language-manual', '') === 'true')
    || (preference !== 'system' && ['ja', 'en'].includes(stored<string>('kantan:language', '')))
}

function InfoButton({ label, content }: { label: string; content: string }) {
  const [open, setOpen] = useState(false)
  return <span className="info-wrap">
    <button type="button" className="info-button" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>i</button>
    {open && <span role="status" className="info-popover">{content}</span>}
  </span>
}

type PromptCopyLabels = {
  copyPrompt: string
  copyingPrompt: string
  copiedPrompt: string
  copyPromptError: string
}

function PromptCopyButton({ text, labels, compact = false, fallbackLabel }: { text: string; labels: PromptCopyLabels; compact?: boolean; fallbackLabel?: string }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const [copiedText, setCopiedText] = useState('')
  const latestText = useRef(text)

  useEffect(() => {
    latestText.current = text
    setStatus((current) => current === 'error' || current === 'copying' ? current : 'idle')
  }, [text])

  useEffect(() => {
    if (status !== 'copied' || !compact) return
    const timer = window.setTimeout(() => setStatus('idle'), 6500)
    return () => window.clearTimeout(timer)
  }, [status, compact])

  const copyPrompt = async () => {
    const promptToCopy = text
    setStatus('copying')
    let timeout = 0
    try {
      await Promise.race([
        navigator.clipboard.writeText(promptToCopy),
        new Promise<never>((_, reject) => { timeout = window.setTimeout(() => reject(new Error('Clipboard timeout')), 8000) }),
      ])
      if (latestText.current === promptToCopy) {
        setCopiedText(promptToCopy)
        setStatus('copied')
      }
      else setStatus((current) => current === 'copying' ? 'idle' : current)
    } catch {
      if (latestText.current === promptToCopy) setStatus('error')
      else setStatus((current) => current === 'copying' ? 'idle' : current)
    } finally {
      window.clearTimeout(timeout)
    }
  }

  return <div className={`prompt-copy-control${compact ? ' prompt-copy-control-compact' : ''}`}>
    <button type="button" className="prompt-copy-button" onClick={copyPrompt} onKeyDown={(event) => { if (event.key === 'Escape' && status === 'copied') setStatus('idle') }} disabled={status === 'copying'} aria-busy={status === 'copying'} aria-describedby={compact && status === 'copied' ? 'root-prompt-copied' : undefined}>
      {compact
        ? <>
          <span>{labels.copyPrompt}</span>
          <span className="prompt-copy-button-icon" aria-hidden="true">{status === 'copied'
          ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.2 4.2L19 6.8" /></svg>
          : status === 'error'
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>}</span>
        </>
        : status === 'copied' ? labels.copiedPrompt : status === 'copying' ? labels.copyingPrompt : labels.copyPrompt}
    </button>
    <span className={status === 'error' || (status === 'copying' && compact) ? 'prompt-copy-status' : 'sr-only'} role="status" aria-live="polite">
      {status === 'copied' ? `${labels.copiedPrompt}${compact ? `: ${copiedText}` : ''}` : status === 'copying' ? labels.copyingPrompt : status === 'error' ? labels.copyPromptError : ''}
    </span>
    {status === 'copied' && compact && <span id="root-prompt-copied" className="prompt-copy-tooltip" role="tooltip"><strong>{labels.copiedPrompt}</strong><span>{copiedText}</span></span>}
    {status === 'error' && compact && <textarea className="prompt-copy-fallback" aria-label={fallbackLabel} readOnly rows={4} value={text} />}
  </div>
}

function RootPrintPrompt({ prompt, labels }: { prompt: (typeof rootPromptCopy)[Language]; labels: PromptCopyLabels & { promptGroupLabel: string } }) {
  return <div className="root-prompt" role="group" aria-label={labels.promptGroupLabel}>
    <PromptCopyButton text={prompt.copyText} labels={{ ...labels, copyPrompt: prompt.copyLabel, copyPromptError: prompt.copyError }} compact fallbackLabel={prompt.copyFallbackLabel} />
  </div>
}

function DirectionControl({ value, onChange, labels }: { value: Direction; onChange: (direction: Direction) => void; labels: Labels }) {
  return <div className="segmented" role="radiogroup" aria-label={labels.direction}>
    {directionOptions.map((direction) => <button key={direction} type="button" role="radio" tabIndex={value === direction ? 0 : -1} aria-checked={value === direction} className={value === direction ? 'selected' : ''} onClick={() => onChange(direction)} onKeyDown={(event) => moveRadio(event, directionOptions, value, onChange)}>
      {direction === 'vertical' ? labels.vertical : labels.horizontal}
    </button>)}
  </div>
}

function PaperOrientationControl({ value, onChange, labels, labelId }: { value: PaperOrientation; onChange: (orientation: PaperOrientation) => void; labels: Labels; labelId: string }) {
  return <div className="paper-orientation" role="radiogroup" aria-labelledby={labelId}>
    {paperOrientationOptions.map((orientation) => <button key={orientation} type="button" role="radio" tabIndex={value === orientation ? 0 : -1} aria-checked={value === orientation} className={value === orientation ? 'selected' : ''} onClick={() => onChange(orientation)} onKeyDown={(event) => moveRadio(event, paperOrientationOptions, value, onChange)}>
      {orientation === 'portrait' ? labels.portrait : labels.landscape}
    </button>)}
  </div>
}

function moveRadio<T extends string>(event: React.KeyboardEvent<HTMLButtonElement>, options: readonly T[], value: T, onChange: (value: T) => void) {
  const current = options.indexOf(value)
  const next = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (current + options.length - 1) % options.length
    : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (current + 1) % options.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : null
  if (next === null) return
  event.preventDefault()
  onChange(options[next])
  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
}

function compositionLabel(layout: { characters: number; lines: number }, labels: Labels, language: Language) {
  const capacity = layout.characters * layout.lines
  return language === 'ja'
    ? `${layout.characters}${labels.characters} × ${layout.lines}${labels.lines}（${capacity}字詰め）`
    : `${layout.characters} ${labels.characters} × ${layout.lines} ${labels.lines} (${capacity}-character grid)`
}

function useGridMetrics({ direction, columns, rows, verticalSpread, horizontalSpread }: { direction: Direction; columns: number; rows: number; verticalSpread: boolean; horizontalSpread: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState({ cellSize: 1, lineBandSize: 0, crossBandSize: 0, spineBandSize: 0 })

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const update = () => {
      const width = frame.clientWidth
      const height = frame.clientHeight
      if (width === 0 || height === 0) return
      const next = gridMetricsForFrame({ direction, columns, rows, verticalSpread, horizontalSpread, width, height })
      if (!next) return
      const paper = frame.parentElement
      paper?.style.setProperty('--cell-size', `${next.cellSize}px`)
      paper?.style.setProperty('--line-band-size', `${next.lineBandSize}px`)
      paper?.style.setProperty('--cross-band-size', `${next.crossBandSize}px`)
      paper?.style.setProperty('--spine-band-size', `${next.spineBandSize}px`)
      setMetrics((current) => (
        Math.abs(current.cellSize - next.cellSize) < 0.01
        && Math.abs(current.lineBandSize - next.lineBandSize) < 0.01
        && Math.abs(current.crossBandSize - next.crossBandSize) < 0.01
        && Math.abs(current.spineBandSize - next.spineBandSize) < 0.01
      ) ? current : next)
    }

    let animationFrame = 0
    const schedule = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(update)
    }
    const updateBeforePrint = () => {
      window.cancelAnimationFrame(animationFrame)
      update()
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(frame)
    window.addEventListener('beforeprint', updateBeforePrint)
    window.addEventListener('afterprint', schedule)
    schedule()
    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      window.removeEventListener('beforeprint', updateBeforePrint)
      window.removeEventListener('afterprint', schedule)
    }
  }, [columns, direction, horizontalSpread, rows, verticalSpread])

  return {
    frameRef,
    style: {
      '--cell-size': `${metrics.cellSize}px`,
      '--line-band-size': `${metrics.lineBandSize}px`,
      '--cross-band-size': `${metrics.crossBandSize}px`,
      '--spine-band-size': `${metrics.spineBandSize}px`,
    } as React.CSSProperties,
  }
}

function LanguageToggle({ value, onChange, labels }: { value: LanguagePreference; onChange: (language: LanguagePreference) => void; labels: Labels }) {
  return <div className={`language-toggle mode-${value}`} role="radiogroup" aria-label={labels.language}>
    <span className="language-indicator" aria-hidden="true" />
    {languageOptions.map((option) => <button key={option} type="button" role="radio" tabIndex={value === option ? 0 : -1} aria-checked={value === option} className={value === option ? 'selected' : ''} onClick={() => onChange(option)} onKeyDown={(event) => moveRadio(event, languageOptions, value, onChange)}>
      {option === 'ja' ? labels.japanese : option === 'system' ? labels.system : labels.english}
    </button>)}
  </div>
}

function ThemeToggle({ value, onChange, labels }: { value: Theme; onChange: (theme: Theme) => void; labels: Labels }) {
  return <div className={`theme-toggle mode-${value}`} role="radiogroup" aria-label={labels.appearance}>
    <span className="theme-indicator" aria-hidden="true" />
    {themeOptions.map((option) => <button key={option} type="button" role="radio" tabIndex={value === option ? 0 : -1} aria-checked={value === option} className={value === option ? 'selected' : ''} onClick={() => onChange(option)} onKeyDown={(event) => moveRadio(event, themeOptions, value, onChange)}>
      {option === 'light' ? labels.light : option === 'system' ? labels.system : labels.dark}
    </button>)}
  </div>
}

function ManuscriptPage({ direction, paper, paperOrientation, composition, cells, page, total, fontFamily, fontSize, margin, marginPercentage, gridColor, showServiceMark, printGridMetrics, labels, language }: { direction: Direction; paper: PaperId; paperOrientation: PaperOrientation; composition: CompositionId; cells: ManuscriptCell[]; page: number; total: number; fontFamily: string; fontSize: string; margin: Margin; marginPercentage: number; gridColor: string; showServiceMark: boolean; printGridMetrics: GridMetrics; labels: Labels; language: Language }) {
  const layout = compositions[composition]
  const hasText = cells.some((cell) => cell !== null)
  const paperName = papers[paper][language]
  const paperDimensions = paperOrientation === 'landscape' ? { width: papers[paper].height, height: papers[paper].width } : papers[paper]
  const paperInlineMargin = marginPercentage / 2
  const paperBlockMargin = paperInlineMargin * paperDimensions.height / paperDimensions.width
  const columns = direction === 'vertical' ? layout.lines : layout.characters
  const rows = direction === 'vertical' ? layout.characters : layout.lines
  const displayCells = manuscriptDisplayCells(cells, layout, direction)
  const leftColumns = Math.floor(layout.lines / 2)
  const verticalRows = Array.from({ length: layout.characters }, (_, row) => displayCells.slice(row * layout.lines, (row + 1) * layout.lines))
  const leftCells = verticalRows.flatMap((row) => row.slice(0, leftColumns))
  const rightCells = verticalRows.flatMap((row) => row.slice(leftColumns))
  const topRows = Math.floor(layout.lines / 2)
  const topCells = displayCells.slice(0, topRows * layout.characters)
  const bottomCells = displayCells.slice(topRows * layout.characters)
  const verticalSpread = direction === 'vertical' && paperOrientation === 'landscape'
  const horizontalSpread = direction === 'horizontal' && paperOrientation === 'portrait'
  const gridMetrics = useGridMetrics({ direction, columns, rows, verticalSpread, horizontalSpread })
  const printablePaper = { width: paperDimensions.width - 8, height: paperDimensions.height - 8 }
  const paperInlineMarginMillimeters = paperDimensions.width * paperInlineMargin / 100
  const paperBlockMarginMillimeters = paperDimensions.height * paperInlineMargin / 100
  const printPaperInlineMargin = Math.max(0, (paperInlineMarginMillimeters - 4) / printablePaper.width * 100)
  const printPaperBlockMargin = Math.max(0, (paperBlockMarginMillimeters - 4) / printablePaper.width * 100)
  const printServiceMarkBottom = Math.max(0, (paperBlockMarginMillimeters - 4) / printablePaper.height * 100)
  // 余白が10%未満ではサービス名を罫線外に置く領域がないため、罫線への重なりを避ける。
  const canShowServiceMark = showServiceMark && marginPercentage >= marginPercentages.narrow
  return <section className={`paper-wrap page-${paper} orientation-${paperOrientation}`} aria-label={labels.preview} style={{ '--print-paper-width': `${paperDimensions.width}mm`, '--print-paper-height': `${paperDimensions.height}mm` } as React.CSSProperties}>
    <div className="paper-meta">{paperName} / {direction === 'vertical' ? labels.vertical : labels.horizontal} / {paperOrientation === 'portrait' ? labels.portrait : labels.landscape} / {compositionLabel(layout, labels, language)}</div>
    <div className={`paper page-${paper} orientation-${paperOrientation} direction-${direction} family-${fontFamily} font-${fontSize} margin-${margin} ${canShowServiceMark ? 'has-service-mark' : ''}`} style={{ '--columns': columns, '--rows': rows, '--paper-line': gridColor, '--paper-width': paperDimensions.width, '--paper-height': paperDimensions.height, '--paper-block-margin': `${paperBlockMargin}%`, '--print-paper-block-margin': `${printPaperBlockMargin}%`, '--paper-inline-margin': `${paperInlineMargin}%`, '--print-paper-inline-margin': `${printPaperInlineMargin}%`, '--screen-service-mark-bottom': `${paperInlineMargin}%`, '--print-service-mark-bottom': `${printServiceMarkBottom}%`, '--print-cell-size': `${printGridMetrics.cellSize}mm`, '--print-line-band-size': `${printGridMetrics.lineBandSize}mm`, '--print-cross-band-size': `${printGridMetrics.crossBandSize}mm`, '--print-spine-band-size': `${printGridMetrics.spineBandSize}mm`, ...gridMetrics.style } as React.CSSProperties}>
      <div className="manuscript-grid-frame" ref={gridMetrics.frameRef}>
        {verticalSpread
          ? <div className="manuscript-grid vertical-manuscript-grid" aria-label={hasText ? `${labels.sourceCount} ${manuscriptCharacters(cells.join('')).length}${labels.sourceSuffix}` : labels.blank}>
            <div className="manuscript-half" style={{ '--half-columns': leftColumns, '--rows': rows } as React.CSSProperties}>{leftCells.map((cell, index) => <span key={index} className="manuscript-cell">{cell}</span>)}</div>
            <div className="manuscript-spine" aria-hidden="true">
              <svg className="fish-tail" viewBox="0 0 20 10" focusable="false"><path d="M1 1h18v7C14.5 4.8 5.5 4.8 1 8Z" /></svg>
              <span className="spine-guide" />
            </div>
            <div className="manuscript-half" style={{ '--half-columns': layout.lines - leftColumns, '--rows': rows } as React.CSSProperties}>{rightCells.map((cell, index) => <span key={index} className="manuscript-cell">{cell}</span>)}</div>
            </div>
          : horizontalSpread
            ? <div className="manuscript-grid horizontal-manuscript-grid" aria-label={hasText ? `${labels.sourceCount} ${manuscriptCharacters(cells.join('')).length}${labels.sourceSuffix}` : labels.blank}>
              <div className="manuscript-half horizontal-manuscript-half" style={{ '--columns': layout.characters, '--half-rows': topRows } as React.CSSProperties}>{topCells.map((cell, index) => <span key={index} className="manuscript-cell">{cell}</span>)}</div>
              <div className="manuscript-spine horizontal-manuscript-spine" aria-hidden="true" />
              <div className="manuscript-half horizontal-manuscript-half" style={{ '--columns': layout.characters, '--half-rows': layout.lines - topRows } as React.CSSProperties}>{bottomCells.map((cell, index) => <span key={index} className="manuscript-cell">{cell}</span>)}</div>
              </div>
            : <div className="manuscript-grid" aria-label={hasText ? `${labels.sourceCount} ${manuscriptCharacters(cells.join('')).length}${labels.sourceSuffix}` : labels.blank}>{displayCells.map((cell, index) => <span key={index} className="manuscript-cell">{cell}</span>)}</div>}
      </div>
      {!hasText && <p className="empty-paper">{labels.blank}</p>}
      {canShowServiceMark && <span className="service-mark" aria-hidden="true">{labels.serviceName}</span>}
    </div>
    <div className="page-footer">{labels.page} {page} / {total}</div>
  </section>
}

export default function App() {
  return window.location.hostname === 'docs.genkou.snkisk.com' || window.location.pathname === '/docs'
    ? <DocumentationApp />
    : <ManuscriptApp />
}

function DocumentationApp() {
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(initialLanguagePreference)
  const shouldPersistLanguage = useRef(hasManualLanguagePreference())
  const [systemLanguage, setSystemLanguage] = useState(defaultLanguage)
  const [theme, setTheme] = useState<Theme>(() => stored('kantan:theme', 'system'))
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const language = languagePreference === 'system' ? systemLanguage : languagePreference
  const labels: Labels = copy[language]
  const documentCopy = documentationCopy[language]
  const brandIcon = brandIconSource(theme, systemDark)

  useEffect(() => {
    if (shouldPersistLanguage.current) {
      persist('kantan:language-preference', languagePreference)
      if (languagePreference !== 'system') persist('kantan:language', languagePreference)
    }
    document.documentElement.lang = language
    updateDocumentMetadata(documentCopy.title, documentCopy.description)
  }, [documentCopy.description, documentCopy.title, language, languagePreference])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => setSystemDark(mediaQuery.matches)
    mediaQuery.addEventListener('change', updateSystemTheme)
    return () => mediaQuery.removeEventListener('change', updateSystemTheme)
  }, [])

  useEffect(() => {
    const updateSystemLanguage = () => setSystemLanguage(defaultLanguage())
    window.addEventListener('languagechange', updateSystemLanguage)
    return () => window.removeEventListener('languagechange', updateSystemLanguage)
  }, [])

  useEffect(() => {
    persist('kantan:theme', theme)
    updateThemeColor(theme === 'system' ? (systemDark ? 'dark' : 'light') : theme)
  }, [systemDark, theme])

  return <main className="app-shell docs-shell">
    <header className="site-header">
      <a className="brand" href={`https://genkou.snkisk.com/${language}/`} aria-label={`${labels.serviceName} ${labels.home}`}><img src={brandIcon} alt="" aria-hidden="true" /><span>{labels.serviceName}</span></a>
      <div className="header-preferences">
        <LanguageToggle value={languagePreference} onChange={(value) => { shouldPersistLanguage.current = true; persist('kantan:language-manual', 'true'); setLanguagePreference(value) }} labels={labels} />
        <ThemeToggle value={theme} onChange={setTheme} labels={labels} />
      </div>
    </header>

    <article className="docs-article">
      <p className="docs-eyebrow">{documentCopy.eyebrow}</p>
      <h1>{documentCopy.heading}</h1>
      <p className="docs-lead">{documentCopy.lead}</p>

      <section aria-labelledby="docs-instruction">
        <div className="docs-prompt-heading">
          <h2 id="docs-instruction">{documentCopy.instructionHeading}</h2>
          <PromptCopyButton key={documentCopy.examplePrompt} text={documentCopy.examplePrompt} labels={documentCopy} />
        </div>
        <p>{documentCopy.instruction}</p>
        <pre><code>{documentCopy.examplePrompt}</code></pre>
      </section>

      <section aria-labelledby="docs-privacy">
        <h2 id="docs-privacy">{documentCopy.privacyHeading}</h2>
        <p>{documentCopy.privacy}</p>
      </section>

      <section aria-labelledby="docs-fallback">
        <h2 id="docs-fallback">{documentCopy.fallbackHeading}</h2>
        <p>{documentCopy.fallback}</p>
      </section>

      <a className="docs-start-link" href={`https://genkou.snkisk.com/${language}/`}>{documentCopy.start}</a>
    </article>

    <footer className="site-footer">
      <span>{labels.copyright}</span>
      <a href={`mailto:${labels.contact}`}>{labels.contact}</a>
    </footer>
  </main>
}

function ManuscriptApp() {
  const [initialPrintLink] = useState<PrintLinkResult>(() => parsePrintLink(window.location.hash))
  const linkedSettings = initialPrintLink.kind === 'valid' ? initialPrintLink.payload : undefined
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(initialLanguagePreference)
  const shouldPersistLanguage = useRef(hasManualLanguagePreference())
  const [useInitialRequestLanguage, setUseInitialRequestLanguage] = useState(() => !hasManualLanguagePreference() && window.location.pathname === '/')
  const [systemLanguage, setSystemLanguage] = useState(defaultLanguage)
  const [theme, setTheme] = useState<Theme>(() => stored('kantan:theme', 'system'))
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [text, setText] = useState(() => linkedSettings?.text ?? stored('kantan:source-text', ''))
  const [direction, setDirection] = useState<Direction>(() => linkedSettings?.direction ?? 'vertical')
  const [paper, setPaper] = useState<PaperId>(() => linkedSettings?.paper ?? 'b5')
  const [paperOrientation, setPaperOrientation] = useState<PaperOrientation>(() => linkedSettings?.orientation ?? ((linkedSettings?.direction ?? 'vertical') === 'vertical' ? 'landscape' : 'portrait'))
  const [composition, setComposition] = useState<CompositionId>(() => linkedSettings?.composition ?? '20x20')
  const [fontFamily, setFontFamily] = useState<string>(() => linkedSettings?.fontFamily ?? 'mincho')
  const [fontSize, setFontSize] = useState<string>(() => linkedSettings?.fontSize ?? 'normal')
  const [margin, setMargin] = useState<Margin>(() => linkedSettings?.margin ?? 'standard')
  const [customMarginPercentage, setCustomMarginPercentage] = useState(() => linkedSettings?.customMarginPercentage ?? 20)
  const [gridColor, setGridColor] = useState(() => linkedSettings?.gridColor ?? '#c9ad97')
  const [autoParagraphIndent, setAutoParagraphIndent] = useState(() => linkedSettings?.autoParagraphIndent ?? true)
  const [showServiceMark, setShowServiceMark] = useState(() => linkedSettings?.showServiceMark ?? true)
  const [pending, setPending] = useState<'pdf' | 'print' | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const requestedLanguage = document.documentElement.dataset.initialLanguage
  const language = languagePreference === 'system'
    ? useInitialRequestLanguage && (requestedLanguage === 'ja' || requestedLanguage === 'en') ? requestedLanguage : systemLanguage
    : languagePreference
  const labels: Labels = copy[language]
  const homeCopy = homepageCopy[language]
  const brandIcon = brandIconSource(theme, systemDark)
  const [status, setStatus] = useState<Status>(() => initialPrintLink.kind === 'too-long'
    ? { tone: 'error', message: labels.printLinkTooLong, printLinkError: 'too-long' }
    : initialPrintLink.kind === 'invalid' ? { tone: 'error', message: labels.printLinkInvalid, printLinkError: 'invalid' } : null)
  const sourceCharacters = useMemo(() => manuscriptCharacters(text).length, [text])
  const layoutOptions = useMemo(() => ({ autoParagraphIndent }), [autoParagraphIndent])
  const marginPercentage = margin === 'custom' ? customMarginPercentage : marginPercentages[margin]
  const paperDimensions = paperOrientation === 'landscape' ? { width: papers[paper].height, height: papers[paper].width } : papers[paper]
  const layout = compositions[composition]
  const gridInput = {
    direction,
    columns: direction === 'vertical' ? layout.lines : layout.characters,
    rows: direction === 'vertical' ? layout.characters : layout.lines,
    verticalSpread: direction === 'vertical' && paperOrientation === 'landscape',
    horizontalSpread: direction === 'horizontal' && paperOrientation === 'portrait',
  }
  const previewGridMetrics = gridMetricsForFrame({
    ...gridInput,
    width: paperDimensions.width * (1 - marginPercentage / 100),
    height: paperDimensions.height * (1 - marginPercentage / 100),
  })
  const printablePaper = { width: paperDimensions.width - 8, height: paperDimensions.height - 8 }
  const printFrameWidth = paperDimensions.width * (1 - marginPercentage / 100)
  const printFrameHeight = paperDimensions.height * (1 - marginPercentage / 100)
  const printGridMetrics = gridMetricsForFrame({
    ...gridInput,
    width: printFrameWidth,
    height: printFrameHeight,
    frameBorderSize: cssPixelInMillimeters,
  })
  const printMarginUnavailable = printFrameWidth > printablePaper.width || printFrameHeight > printablePaper.height
  const layoutSupported = previewGridMetrics !== undefined
    && printGridMetrics !== undefined
    && !printMarginUnavailable
  const totalPages = useMemo(() => pageTotal(text, compositions[composition], layoutOptions), [text, composition, layoutOptions])
  const pages = useMemo(() => manuscriptPages(text, compositions[composition], layoutOptions), [text, composition, layoutOptions])

  const selectDirection = (nextDirection: Direction) => {
    setDirection(nextDirection)
    setPaperOrientation(nextDirection === 'vertical' ? 'landscape' : 'portrait')
  }

  const applyPrintLink = useCallback((result: PrintLinkResult) => {
    if (result.kind === 'absent') return
    if (result.kind === 'too-long') {
      setStatus({ tone: 'error', message: labels.printLinkTooLong, printLinkError: 'too-long' })
      return
    }
    if (result.kind === 'invalid') {
      setStatus({ tone: 'error', message: labels.printLinkInvalid, printLinkError: 'invalid' })
      return
    }

    const next: PrintLinkPayload = result.payload
    const nextDirection = next.direction ?? 'vertical'
    setText(next.text)
    setDirection(nextDirection)
    setPaper(next.paper ?? 'b5')
    setPaperOrientation(next.orientation ?? (nextDirection === 'vertical' ? 'landscape' : 'portrait'))
    setComposition(next.composition ?? '20x20')
    setFontFamily(next.fontFamily ?? 'mincho')
    setFontSize(next.fontSize ?? 'normal')
    setMargin(next.margin ?? 'standard')
    setCustomMarginPercentage(next.customMarginPercentage ?? 20)
    setGridColor(next.gridColor ?? '#c9ad97')
    setAutoParagraphIndent(next.autoParagraphIndent ?? true)
    setShowServiceMark(next.showServiceMark ?? true)
    setStatus(null)
  }, [labels.printLinkInvalid, labels.printLinkTooLong])

  useEffect(() => {
    if (shouldPersistLanguage.current) {
      persist('kantan:language-preference', languagePreference)
      if (languagePreference !== 'system') persist('kantan:language', languagePreference)
    }
    document.documentElement.lang = language
    updateDocumentMetadata(homeCopy.title, homeCopy.description)
    updateHomeLanguageMetadata(language)
  }, [homeCopy.description, homeCopy.title, language, languagePreference])

  useEffect(() => {
    setStatus((current) => current?.printLinkError === 'too-long'
      ? { ...current, message: labels.printLinkTooLong }
      : current?.printLinkError === 'invalid'
        ? { ...current, message: labels.printLinkInvalid }
        : current)
  }, [labels.printLinkInvalid, labels.printLinkTooLong])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => setSystemDark(mediaQuery.matches)
    mediaQuery.addEventListener('change', updateSystemTheme)
    return () => mediaQuery.removeEventListener('change', updateSystemTheme)
  }, [])

  useEffect(() => {
    const updateSystemLanguage = () => {
      setUseInitialRequestLanguage(false)
      setSystemLanguage(defaultLanguage())
    }
    window.addEventListener('languagechange', updateSystemLanguage)
    return () => window.removeEventListener('languagechange', updateSystemLanguage)
  }, [])

  useEffect(() => {
    persist('kantan:theme', theme)
    updateThemeColor(theme === 'system' ? (systemDark ? 'dark' : 'light') : theme)
  }, [systemDark, theme])

  useEffect(() => {
    persist('kantan:source-text', text)
  }, [text])

  useEffect(() => {
    const handleHashChange = () => applyPrintLink(parsePrintLink(window.location.hash))
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [applyPrintLink])

  useEffect(() => {
    if (!status) return
    const timer = window.setTimeout(() => setStatus(null), 4500)
    return () => window.clearTimeout(timer)
  }, [status])

  const savePdf = async () => {
    if (!previewRef.current || pending || !layoutSupported) return
    setPending('pdf')
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
      const selectedPaper = paperOrientation === 'landscape' ? { width: papers[paper].height, height: papers[paper].width } : papers[paper]
      const doc = new jsPDF({ orientation: selectedPaper.width > selectedPaper.height ? 'landscape' : 'portrait', unit: 'mm', format: [selectedPaper.width, selectedPaper.height] })
      const paperElements = Array.from(previewRef.current.querySelectorAll<HTMLElement>('.paper'))
      for (const [index, paperElement] of paperElements.entries()) {
        const canvas = await html2canvas(paperElement, { backgroundColor: '#ffffff', scale: 2, useCORS: true })
        if (index > 0) doc.addPage([selectedPaper.width, selectedPaper.height])
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, selectedPaper.width, selectedPaper.height)
      }
      doc.save(`原稿小箱-${paper}-${direction}.pdf`)
      setStatus({ tone: 'success', message: labels.pdfReady })
    } catch {
      setStatus({ tone: 'error', message: labels.pdfError, retryPdf: true })
    } finally {
      setPending(null)
    }
  }

  const print = () => {
    if (pending || !layoutSupported) return
    setPending('print')
    window.setTimeout(() => {
      window.print()
      setPending(null)
      setStatus({ tone: 'success', message: labels.printReady })
    }, 80)
  }

  return <main className="app-shell">
    <header className="site-header">
      <a className="brand" href={`/${language}/`} aria-label={`${labels.serviceName} ${labels.home}`}><img src={brandIcon} alt="" aria-hidden="true" /><span>{labels.serviceName}</span></a>
      <div className="header-preferences">
        <LanguageToggle value={languagePreference} onChange={(value) => { shouldPersistLanguage.current = true; persist('kantan:language-manual', 'true'); setUseInitialRequestLanguage(false); setLanguagePreference(value) }} labels={labels} />
        <ThemeToggle value={theme} onChange={setTheme} labels={labels} />
      </div>
    </header>

    <section className="home-intro" aria-labelledby="home-heading">
      <h1 id="home-heading">{homeCopy.heading}</h1>
      <p>{homeCopy.introduction}</p>
      <a href="https://docs.genkou.snkisk.com/">{homeCopy.docsLink}</a>
    </section>

    <RootPrintPrompt key={language} prompt={rootPromptCopy[language]} labels={documentationCopy[language]} />

    <div className="workspace">
      <section className="editor" aria-label={labels.body}>
        <div className="field-group text-field">
          <label htmlFor="source-text">{labels.body}</label>
          <textarea id="source-text" value={text} onChange={(event) => setText(event.target.value)} placeholder={labels.hint} spellCheck="false" />
          <p className="source-count" aria-live="polite">{labels.sourceCount} {sourceCharacters}{language === 'ja' ? labels.sourceSuffix : ` ${labels.sourceSuffix}`} / {totalPages} {labels.pages}</p>
        </div>

        <fieldset className="field-group direction-field"><legend>{labels.direction}</legend><DirectionControl value={direction} onChange={selectDirection} labels={labels} /></fieldset>
        <div className="field-group"><label htmlFor="paper">{labels.paper}</label><select id="paper" value={paper} onChange={(event) => setPaper(event.target.value as PaperId)}>{Object.entries(papers).map(([id, item]) => <option key={id} value={id}>{item[language]}</option>)}</select></div>
        <div className="field-group"><label htmlFor="composition">{labels.composition}</label><select id="composition" value={composition} onChange={(event) => setComposition(event.target.value as CompositionId)}>{Object.entries(compositions).map(([id, item]) => <option key={id} value={id}>{compositionLabel(item, labels, language)}</option>)}</select></div>

        <details className="optional-settings">
          <summary>{labels.details}</summary>
          <div className="detail-grid">
            <label>{labels.fontFamily}<select value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}><option value="mincho">{labels.mincho}</option><option value="gothic">{labels.gothic}</option></select></label>
            <label>{labels.fontSize}<select value={fontSize} onChange={(event) => setFontSize(event.target.value)}><option value="small">{labels.small}</option><option value="normal">{labels.medium}</option><option value="large">{labels.large}</option></select></label>
            <label>{labels.margin}<select value={margin} onChange={(event) => setMargin(event.target.value as Margin)}><option value="narrow">{labels.marginNarrow}</option><option value="standard">{labels.standard}</option><option value="wide">{labels.marginWidePrint}</option><option value="custom">{labels.marginCustom}</option></select></label>
            {margin === 'custom' && <label className="custom-margin-control" htmlFor="margin-percentage"><span>{labels.marginPercentage}</span><output htmlFor="margin-percentage">{customMarginPercentage}%</output><input id="margin-percentage" type="range" min="0" max="40" step="1" value={customMarginPercentage} aria-valuetext={`${customMarginPercentage}%`} onChange={(event) => setCustomMarginPercentage(Number(event.target.value))} /></label>}
            <label>{labels.gridColor}<span className="color-control"><input aria-label={labels.gridColor} type="color" value={gridColor} onChange={(event) => setGridColor(event.target.value)} /><output>{gridColor}</output></span></label>
            <div className="paper-orientation-control"><span id="paper-orientation-label">{labels.paperOrientation}</span><PaperOrientationControl value={paperOrientation} onChange={setPaperOrientation} labels={labels} labelId="paper-orientation-label" /></div>
            <label className="mark-control"><input type="checkbox" checked={autoParagraphIndent} onChange={(event) => setAutoParagraphIndent(event.target.checked)} /><span>{labels.paragraphIndent}</span></label>
            <label className="mark-control"><input type="checkbox" checked={showServiceMark} onChange={(event) => setShowServiceMark(event.target.checked)} /><span>{labels.serviceMark}</span></label>
          </div>
        </details>

        <div className="action-group">
          <button type="button" className="button primary" disabled={pending !== null || !layoutSupported} aria-busy={pending === 'pdf'} aria-describedby={!layoutSupported ? 'layout-unavailable' : undefined} onClick={savePdf}>{pending === 'pdf' ? labels.saving : labels.save}</button>
          <button type="button" className="button secondary" disabled={pending !== null || !layoutSupported} aria-busy={pending === 'print'} aria-describedby={!layoutSupported ? 'layout-unavailable' : undefined} onClick={print}>{pending === 'print' ? labels.printing : labels.print}</button>
        </div>
      </section>

      <section className="preview-panel" aria-label={labels.preview}>
        <div className="preview-heading"><h2>{labels.preview}</h2><InfoButton label={labels.info} content={labels.settingsInfo} /></div>
        <div className="preview-capture" ref={previewRef}>{layoutSupported
          ? pages.map((cells, index) => <ManuscriptPage key={index} direction={direction} paper={paper} paperOrientation={paperOrientation} composition={composition} cells={cells} page={index + 1} total={pages.length} fontFamily={fontFamily} fontSize={fontSize} margin={margin} marginPercentage={marginPercentage} gridColor={gridColor} showServiceMark={showServiceMark} printGridMetrics={printGridMetrics!} labels={labels} language={language} />)
          : <p id="layout-unavailable" className="layout-unavailable" role="status">{printMarginUnavailable ? labels.printMarginUnavailable : labels.layoutUnavailable}</p>}</div>
      </section>
    </div>

    <footer className="site-footer">
      <span>{labels.copyright}</span>
      <a href={`mailto:${labels.contact}`}>{labels.contact}</a>
    </footer>

    {status && <div className={`toast ${status.tone}`} role="status"><span>{status.message}</span>{status.retryPdf && <button type="button" className="toast-retry" onClick={savePdf}>{labels.retry}</button>}<button type="button" aria-label={labels.close} onClick={() => setStatus(null)}>×</button></div>}
  </main>
}
