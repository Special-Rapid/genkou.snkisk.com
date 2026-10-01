import { describe, it, expect } from 'vitest'
import { textareaDocument, acceptsOrientation, editDocument, orientSelection, readSavedDocument, validateRuns } from './text-orientation'
import { indexedManuscriptPages, manuscriptDisplayCells } from './layout'
import { createPrintLink, parsePrintLink } from './print-link'

describe('selected character orientation', () => {
  it('targets Latin and decimal digits, preserving UTF-16 positions around Japanese and emoji', () => {
    const value = orientSelection({ text: '日😀Ab１２é語\nZ', runs: [] }, 0, 12, 'upright')
    expect(value.runs).toEqual([{ start: 3, end: 8, mode: 'upright' }, { start: 10, end: 11, mode: 'upright' }])
    expect(acceptsOrientation('語')).toBe(false)
    expect(acceptsOrientation(' ')).toBe(false)
  })
  it('splits an override, resets selected characters and merges adjacent equal modes', () => {
    const first = orientSelection({ text: 'ABCDE', runs: [] }, 0, 5, 'upright')
    const mixed = orientSelection(first, 1, 4, 'sideways')
    expect(mixed.runs.map(x => x.mode)).toEqual(['upright', 'sideways', 'upright'])
    expect(orientSelection(mixed, 1, 4, 'upright').runs).toEqual(first.runs)
    expect(orientSelection(first, 1, 4).runs).toEqual([{ start: 0, end: 1, mode: 'upright' }, { start: 4, end: 5, mode: 'upright' }])
  })
  it('inserts default text, shifts existing runs, clips deletions, and handles repeated letters', () => {
    const initial = orientSelection({ text: 'AAA', runs: [] }, 0, 3, 'upright')
    expect(editDocument(initial, 'AAAA', { start: 1, end: 1 }).runs).toEqual([{ start: 0, end: 1, mode: 'upright' }, { start: 2, end: 4, mode: 'upright' }])
    expect(editDocument(initial, 'AA', { start: 1, end: 2 }).runs).toEqual([{ start: 0, end: 2, mode: 'upright' }])
    expect(editDocument(initial, '').runs).toEqual([])
    expect(editDocument(initial, 'A\n😀A', { start: 1, end: 2 }).runs).toEqual([{ start: 0, end: 1, mode: 'upright' }, { start: 4, end: 5, mode: 'upright' }])
  })
  it('keeps original offsets across CRLF, paragraph indentation, pagination and display order', () => {
    const text = '  A\r\n\r\n　😀B\nC'
    for (const autoParagraphIndent of [true, false]) {
      const pages = indexedManuscriptPages(text, { characters: 2, lines: 2 }, { autoParagraphIndent })
      for (const page of pages) for (const direction of ['vertical', 'horizontal'] as const) {
        for (const cell of manuscriptDisplayCells(page, { characters: 2, lines: 2 }, direction)) if (cell) expect(text.slice(cell.sourceStart, cell.sourceStart + cell.character.length)).toBe(cell.character)
      }
      expect(pages.flat().filter(x => x?.character === 'B')[0]?.sourceStart).toBe(text.indexOf('B'))
    }
  })
  it('roundtrips formatted v2 links and reads old v1, rejects malformed ranges', () => {
    const document = orientSelection({ text: '日ABC', runs: [] }, 1, 4, 'sideways')
    const parsed = parsePrintLink(createPrintLink({ ...document, direction: 'vertical' }))
    expect(parsed.kind === 'valid' && parsed.payload.runs).toEqual(document.runs)
    expect(parsePrintLink('#v=1&text=abc').kind).toBe('valid')
    expect(parsePrintLink('#v=2&text=A&runs=broken').kind).toBe('invalid')
    expect(validateRuns('😀A', [{ start: 1, end: 3, mode: 'upright' }])).toBe(false)
    expect(validateRuns('ABC', [{ start: 0, end: 3, mode: 'upright' }, { start: 1, end: 2, mode: 'sideways' }])).toBe(false)
  })
  it('normalizes CRLF before textarea selections and preserves later directions', () => {
    const raw = orientSelection({ text: 'A\r\nB\r\nC', runs: [] }, 0, 7, 'upright')
    const doc = textareaDocument(raw)
    expect(doc.text).toBe('A\nB\nC')
    expect(doc.runs.map(run => run.start)).toEqual([0, 2, 4])
    expect(editDocument(doc, 'Ax\nB\nC', { start: 1, end: 1 }).runs.map(run => run.start)).toEqual([0, 3, 5])
  })
  it('migrates old text and safely recovers malformed saved data', () => {
    expect(readSavedDocument('broken', '旧本文')).toEqual({ text: '旧本文', runs: [] })
    const doc = orientSelection({ text: 'Ab', runs: [] }, 0, 2, 'upright')
    expect(readSavedDocument(JSON.stringify({ version: 1, ...doc }), '')).toEqual(doc)
  })
})
