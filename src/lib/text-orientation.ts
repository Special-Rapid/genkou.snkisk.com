export type CharacterOrientation = 'upright' | 'sideways'
export type OrientationRun = { start: number; end: number; mode: CharacterOrientation }
export type ManuscriptDocument = { text: string; runs: OrientationRun[] }
export const acceptsOrientation = (character: string) => /^(?:\p{Script=Latin}|\p{Decimal_Number})$/u.test(character)
export const orientationAt = (runs: OrientationRun[], offset: number) => {
  let low = 0, high = runs.length - 1
  while (low <= high) { const mid = (low + high) >>> 1; const run = runs[mid]; if (offset < run.start) high = mid - 1; else if (offset >= run.end) low = mid + 1; else return run.mode }
  return undefined
}

export function normalizeRuns(text: string, runs: OrientationRun[]): OrientationRun[] {
  const output: OrientationRun[] = []
  const sorted = [...runs].sort((a, b) => a.start - b.start)
  let offset = 0
  for (const character of text) {
    const end = offset + character.length
    const mode = acceptsOrientation(character) ? orientationAt(sorted, offset) : undefined
    if (mode) {
      const previous = output.at(-1)
      if (previous?.end === offset && previous.mode === mode) previous.end = end
      else output.push({ start: offset, end, mode })
    }
    offset = end
  }
  return output
}

export function validateRuns(text: string, value: unknown): value is OrientationRun[] {
  if (!Array.isArray(value) || value.length > 20_000) return false
  let previousEnd = 0
  for (const run of value) {
    if (!run || !Number.isInteger(run.start) || !Number.isInteger(run.end) || run.start < previousEnd || run.start >= run.end || run.end > text.length || !['upright', 'sideways'].includes(run.mode)) return false
    if (!Array.from(text.slice(run.start, run.end)).every(acceptsOrientation)) return false
    previousEnd = run.end
  }
  return true
}

export function orientSelection(document: ManuscriptDocument, start: number, end: number, mode?: CharacterOrientation): ManuscriptDocument {
  if (start >= end) return document
  const outside = document.runs.flatMap(run => [
    ...(run.start < start ? [{ ...run, end: Math.min(start, run.end) }] : []),
    ...(run.end > end ? [{ ...run, start: Math.max(end, run.start) }] : []),
  ])
  return { text: document.text, runs: normalizeRuns(document.text, [...(mode ? [{ start, end, mode }] : []), ...outside]) }
}

/** Locate one textarea edit, favoring the pre-input selection for repeated text. */
export function editDocument(document: ManuscriptDocument, text: string, selection?: { start: number; end: number }): ManuscriptDocument {
  const old = document.text
  let start = 0, oldEnd = old.length, newEnd = text.length
  if (selection && text.startsWith(old.slice(0, selection.start)) && text.endsWith(old.slice(selection.end)) && text.length >= selection.start + old.length - selection.end) {
    start = selection.start; oldEnd = selection.end; newEnd = text.length - (old.length - oldEnd)
  } else {
    while (start < old.length && start < text.length && old[start] === text[start]) start++
    while (oldEnd > start && newEnd > start && old[oldEnd - 1] === text[newEnd - 1]) { oldEnd--; newEnd-- }
  }
  const delta = newEnd - oldEnd
  const runs = document.runs.flatMap(run => [
    ...(run.start < start ? [{ ...run, end: Math.min(run.end, start) }] : []),
    ...(run.end > oldEnd ? [{ ...run, start: Math.max(run.start, oldEnd) + delta, end: run.end + delta }] : []),
  ])
  return { text, runs: normalizeRuns(text, runs) }
}

export function readSavedDocument(value: string | null, legacy: string): ManuscriptDocument {
  try {
    const parsed = JSON.parse(value ?? 'null')
    if (parsed?.version === 1 && typeof parsed.text === 'string' && validateRuns(parsed.text, parsed.runs)) return { text: parsed.text, runs: normalizeRuns(parsed.text, parsed.runs) }
  } catch { /* Recover the old plain text if saved JSON is malformed. */ }
  return { text: legacy, runs: [] }
}

/** HTML textareas expose LF-only values; rebase saved/shared raw CRLF ranges once. */
export function textareaDocument(document: ManuscriptDocument): ManuscriptDocument {
  if (!document.text.includes('\r')) return document
  const offsets = new Uint32Array(document.text.length + 1)
  let normalized = ''
  for (let index = 0; index < document.text.length; index++) {
    offsets[index] = normalized.length
    if (document.text[index] === '\r') {
      normalized += '\n'
      if (document.text[index + 1] === '\n') { index++; offsets[index] = normalized.length - 1 }
    } else normalized += document.text[index]
  }
  offsets[document.text.length] = normalized.length
  return { text: normalized, runs: normalizeRuns(normalized, document.runs.map(run => ({ ...run, start: offsets[run.start], end: offsets[run.end] }))) }
}
