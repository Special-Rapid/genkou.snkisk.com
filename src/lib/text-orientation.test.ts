import { describe, it, expect } from 'vitest'
import { persistDocument, resolveInputRange, textareaDocument, acceptsOrientation, editDocument, orientSelection, readSavedDocument, validateRuns } from './text-orientation'
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
  it('clears formatting on identical replacement text and preserves unselected characters', () => {
    const initial = orientSelection({ text: 'ABA', runs: [] }, 0, 3, 'upright')
    expect(editDocument(initial, 'ABA', { start: 0, end: 1 }).runs).toEqual([{ start: 1, end: 3, mode: 'upright' }])
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
  it('anchors repeated-text word and line deletions to the resulting caret', () => {
    const original = orientSelection(orientSelection({ text: 'AAAA', runs: [] }, 0, 2, 'upright'), 2, 4, 'sideways')
    for (const inputType of ['deleteWordBackward', 'deleteSoftLineBackward', 'deleteHardLineBackward']) {
      const range = resolveInputRange(original.text, 'AA', { start: 2, end: 2, inputType }, 0)
      expect(editDocument(original, 'AA', range).runs).toEqual([{ start: 0, end: 2, mode: 'sideways' }])
    }
    const forward = resolveInputRange(original.text, 'AA', { start: 2, end: 2, inputType: 'deleteWordForward' }, 2)
    expect(editDocument(original, 'AA', forward).runs).toEqual([{ start: 0, end: 2, mode: 'upright' }])
  })
  it('invalidates stale combined storage before falling back to the latest text', () => {
    const values = new Map([['genkou:document', JSON.stringify({ version: 1, text: 'old', runs: [] })]])
    const storage = { setItem: (key: string, value: string) => { if (key === 'genkou:document') throw new Error('quota'); values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
    const document = orientSelection({ text: 'new', runs: [] }, 0, 3, 'upright')
    expect(persistDocument(storage, document)).toBe('text-only')
    expect(values.has('genkou:document')).toBe(false)
    expect(readSavedDocument(values.get('genkou:document') ?? null, values.get('kantan:source-text') ?? '').text).toBe('new')
  })
  it('keeps a complete save authoritative when the legacy copy fails', () => {
    const values = new Map<string, string>()
    const storage = { setItem: (key: string, value: string) => { if (key === 'kantan:source-text') throw new Error('quota'); values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
    const document = orientSelection({ text: 'new', runs: [] }, 0, 3, 'upright')
    expect(persistDocument(storage, document)).toBe('saved')
    expect(readSavedDocument(values.get('genkou:document') ?? null, 'old')).toEqual(document)
  })
  it('reports unavailable storage instead of claiming a save', () => {
    expect(persistDocument({ setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }, { text: 'new', runs: [] })).toBe('failed')
  })

  it('roundtrips left-facing v3 and rejects the new mode under v2', () => {
    const doc = orientSelection({ text: '日A😀12 Z', runs: [] }, 0, 9, 'left')
    expect(doc.runs).toEqual([{start:1,end:2,mode:'left'}, {start:4,end:6,mode:'left'}, {start:7,end:8,mode:'left'}])
    const hash = createPrintLink({...doc,direction:'vertical'})
    expect(hash).toContain('v=3&')
    const result = parsePrintLink(hash)
    expect(result.kind === 'valid' && result.payload.runs).toEqual(doc.runs)
    expect(parsePrintLink(hash.replace('v=3', 'v=2')).kind).toBe('invalid')
    expect(createPrintLink({...doc,runs:doc.runs.map(run=>({...run,mode:'sideways'}))})).toContain('v=2&')
    expect(createPrintLink({text:doc.text})).toContain('v=1&')
  })
  it('persists and restores left-facing edits with a versioned document', () => {
    const doc = orientSelection({text:'ABC',runs:[]},1,2,'left')
    const values = new Map<string,string>()
    const storage = {setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}}
    expect(persistDocument(storage,doc)).toBe('saved')
    expect(JSON.parse(values.get('genkou:document')!).version).toBe(2)
    expect(readSavedDocument(values.get('genkou:document')!, '')).toEqual(doc)
    expect(editDocument(doc,'AxBC',{start:1,end:1}).runs).toEqual([{start:2,end:3,mode:'left'}])
    expect(orientSelection(doc,1,2,'sideways').runs).toEqual([{start:1,end:2,mode:'sideways'}])
  })

})
