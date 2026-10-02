export type SelectionAnchor = { left: number; top: number; bottom: number }

/** Textarea selections have no DOM Range rect: mirror its wrapping and typography. */
export function textareaSelectionAnchor(input: HTMLTextAreaElement): SelectionAnchor | null {
  const rect = input.getBoundingClientRect()
  const style = getComputedStyle(input)
  const mirror = document.createElement('div')
  const properties = ['boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'textAlign', 'textTransform', 'direction', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle'] as const
  for (const property of properties) mirror.style[property] = style[property]
  Object.assign(mirror.style, { position: 'fixed', visibility: 'hidden', pointerEvents: 'none', left: `${rect.left - input.scrollLeft}px`, top: `${rect.top - input.scrollTop}px`, width: `${input.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`, height: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' })
  const offset = input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd
  mirror.append(document.createTextNode(input.value.slice(0, offset)))
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  mirror.append(marker, document.createTextNode(input.value.slice(offset)))
  document.body.append(mirror)
  try {
    const caret = marker.getBoundingClientRect()
    const top = rect.top + parseFloat(style.borderTopWidth)
    const bottom = rect.bottom - parseFloat(style.borderBottomWidth)
    if (caret.bottom <= top || caret.top >= bottom || caret.right < rect.left || caret.left > rect.right) return null
    return { left: caret.left, top: Math.max(top, caret.top), bottom: Math.min(bottom, caret.bottom) }
  } finally { mirror.remove() }
}

export function selectionPopoverPosition(anchor: SelectionAnchor, size: { width: number; height: number }, viewport: { left: number; top: number; width: number; height: number }) {
  const gap = 8
  const right = viewport.left + viewport.width - gap
  const bottom = viewport.top + viewport.height - gap
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)))
  const below = anchor.bottom + gap
  return {
    left: clamp(anchor.left, viewport.left + gap, right - size.width),
    top: clamp(below + size.height <= bottom ? below : anchor.top - size.height - gap, viewport.top + gap, bottom - size.height),
  }
}
