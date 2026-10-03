import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { selectionPopoverPosition, textareaSelectionAnchor } from './lib/textarea-selection'
import type { CharacterOrientation } from './lib/text-orientation'

type Props = {
  input: RefObject<HTMLTextAreaElement | null>
  selection: { start: number; end: number }
  text: string
  enabled: boolean
  language: 'ja' | 'en'
  modes: Set<string>
  onOrient: (mode?: CharacterOrientation) => void
}

export function SelectionOrientationPopover({ input, selection, text, enabled, language, modes, onOrient }: Props) {
  const toolbar = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const key = `${selection.start}:${selection.end}:${text}`
  const eligible = enabled && selection.start < selection.end && dismissed !== key
  const restoreFocus = () => {
    input.current?.focus({ preventScroll: true })
    input.current?.setSelectionRange(selection.start, selection.end)
  }
  const dismiss = (restore = false) => { setDismissed(key); setPosition(null); if (restore) restoreFocus() }

  // Escape suppresses the current selection, not a later keyboard re-selection.
  useLayoutEffect(() => { setDismissed(null) }, [key])

  useLayoutEffect(() => {
    const textarea = input.current
    if (!textarea || !eligible) { setPosition(null); return }
    let frame = 0
    const measure = () => {
      frame = 0
      const popup = toolbar.current
      if (!popup || (document.activeElement !== textarea && !popup.contains(document.activeElement))) { setPosition(null); return }
      const anchor = textareaSelectionAnchor(textarea)
      if (!anchor) {
        if (popup.contains(document.activeElement)) textarea.focus({ preventScroll: true })
        setPosition(null); return
      }
      const viewport = window.visualViewport
      const visibleTop = viewport?.offsetTop ?? 0
      const visibleBottom = visibleTop + (viewport?.height ?? innerHeight)
      if (anchor.bottom <= visibleTop || anchor.top >= visibleBottom) {
        if (popup.contains(document.activeElement)) textarea.focus({ preventScroll: true })
        setPosition(null); return
      }
      const next = selectionPopoverPosition(anchor, popup.getBoundingClientRect(), { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0, width: viewport?.width ?? innerWidth, height: viewport?.height ?? innerHeight })
      setPosition(previous => previous && Math.abs(previous.left - next.left) < .5 && Math.abs(previous.top - next.top) < .5 ? previous : next)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setDismissed(key); setPosition(null); return }
      if (event.key === 'Tab' && !event.shiftKey && toolbar.current?.style.visibility !== 'hidden') {
        event.preventDefault(); toolbar.current?.querySelector('button')?.focus()
      }
    }
    const outside = (event: PointerEvent) => {
      if (toolbar.current?.contains(event.target as Node)) return
      if (event.target === textarea) { schedule(); return }
      setDismissed(key); setPosition(null)
    }
    measure()
    const observer = new ResizeObserver(schedule)
    observer.observe(textarea)
    if (toolbar.current) observer.observe(toolbar.current)
    textarea.addEventListener('keydown', keyDown)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('selectionchange', schedule)
    document.addEventListener('focusin', schedule)
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    return () => {
      cancelAnimationFrame(frame); observer.disconnect()
      textarea.removeEventListener('keydown', keyDown)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('selectionchange', schedule)
      document.removeEventListener('focusin', schedule)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
    }
  }, [eligible, key, input])

  // A deliberate new mouse/touch selection can reopen even if its range is unchanged.
  useLayoutEffect(() => {
    const textarea = input.current
    const reopen = () => setDismissed(null)
    textarea?.addEventListener('pointerup', reopen)
    return () => textarea?.removeEventListener('pointerup', reopen)
  }, [input])

  if (!eligible) return null
  return <div ref={toolbar} className="selection-orientation-popover" role="toolbar" aria-label={language === 'ja' ? '選択した英数字の向き' : 'Selected letters and numbers'} style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
    onPointerDown={event => event.preventDefault()}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(true); return }
      const buttons = [...(toolbar.current?.querySelectorAll('button') ?? [])]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length]?.focus()
      }
    }}>
    {(['sideways', 'upright', 'left'] as const).map(mode => <button key={mode} type="button" aria-pressed={modes.size === 1 && modes.has(mode)} onClick={() => onOrient(mode)}>{language === 'ja' ? ({ sideways: '右向き', upright: '上向き', left: '左向き' })[mode] : ({ sideways: 'Right', upright: 'Up', left: 'Left' })[mode]}</button>)}
    {modes.size > 1 && <span className="sr-only" role="status">{language === 'ja' ? '選択範囲の向きは混在しています。' : 'The selection has mixed orientations.'}</span>}
  </div>
}
