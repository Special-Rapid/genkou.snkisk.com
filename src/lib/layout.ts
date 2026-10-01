export type Direction = 'vertical' | 'horizontal'

export interface Composition {
  characters: number
  lines: number
}

export type ManuscriptCell = string | null
export type IndexedCharacter = { character: string; sourceStart: number }
export type IndexedCell = IndexedCharacter | null

export interface ManuscriptLayoutOptions {
  /** 段落境界を1マス下げて組む。入力本文そのものは変更しない。 */
  autoParagraphIndent?: boolean
}

export const manuscriptCharacters = (text: string) =>
  Array.from(text.replaceAll(/\r\n?|\n/g, ''))

/**
 * CSSの右から左への自動配置に依存せず、縦書きの先頭列を右端に固定する。
 */
export const manuscriptDisplayCells = <T>(cells: (T | null)[], composition: Composition, direction: Direction): (T | null)[] => {
  if (direction === 'horizontal') return cells

  return Array.from({ length: cells.length }, (_, visualIndex) => {
    const visualRow = Math.floor(visualIndex / composition.lines)
    const visualColumn = visualIndex % composition.lines
    const sourceIndex = (composition.lines - 1 - visualColumn) * composition.characters + visualRow
    return cells[sourceIndex] ?? null
  })
}

export const pageCapacity = ({ characters, lines }: Composition) => characters * lines

/**
 * 改行は次の行を始める指示として扱い、通常の空白は原稿用紙の一文字として残す。
 * 空セルも返すため、段落の改行をプレビューとPDFで同じ位置に再現できる。
 */
const legacyManuscriptPages = (tokens: IndexedCharacter[], composition: Composition): IndexedCell[][] => {
  const capacity = pageCapacity(composition)
  const pages: IndexedCell[][] = []
  let cells: IndexedCell[] = Array(capacity).fill(null)
  let cursor = 0
  let previousWasNewline = false

  const finishPage = () => {
    pages.push(cells)
    cells = Array(capacity).fill(null)
    cursor = 0
  }

  for (const token of tokens) {
    if (token.character === '\n') {
      if (cursor === capacity) {
        finishPage()
        if (previousWasNewline) cursor = composition.characters
        previousWasNewline = true
        continue
      }
      if (cursor === 0) cursor = composition.characters
      else if (cursor % composition.characters !== 0) cursor = Math.ceil(cursor / composition.characters) * composition.characters
      else if (previousWasNewline) cursor += composition.characters
      previousWasNewline = true
      continue
    }

    if (cursor === capacity) finishPage()
    cells[cursor] = token
    cursor += 1
    previousWasNewline = false
  }

  pages.push(cells)
  return pages
}

/**
 * 改行の数や行頭空白の有無にかかわらず、貼り付け元の段落を同じ見た目にそろえる。
 * 連続改行と段落先頭の空白を一つの境界へ畳むため、字下げは必ず一マスだけになる。
 */
const paragraphIndentedPages = (tokens: IndexedCharacter[], composition: Composition): IndexedCell[][] => {
  const capacity = pageCapacity(composition)
  const pages: IndexedCell[][] = []
  let cells: IndexedCell[] = Array(capacity).fill(null)
  let cursor = 0
  const paragraphs: IndexedCharacter[][] = []
  let paragraph: IndexedCharacter[] = []
  for (const token of tokens) {
    if (token.character === '\n') {
      if (paragraph.length) paragraphs.push(paragraph)
      paragraph = []
    } else if (paragraph.length || !/^[ \t　]$/.test(token.character)) paragraph.push(token)
  }
  if (paragraph.length) paragraphs.push(paragraph)

  const finishPage = () => {
    pages.push(cells)
    cells = Array(capacity).fill(null)
    cursor = 0
  }

  const startParagraph = () => {
    if (cursor % composition.characters !== 0) {
      cursor = Math.ceil(cursor / composition.characters) * composition.characters
    }
    if (cursor === capacity) finishPage()
    cursor += 1
  }

  for (const paragraph of paragraphs) {
    startParagraph()
    for (const character of paragraph) {
      if (cursor === capacity) finishPage()
      cells[cursor] = character
      cursor += 1
    }
  }

  pages.push(cells)
  return pages
}

export const indexedManuscriptPages = (text: string, composition: Composition, options: ManuscriptLayoutOptions = {}): IndexedCell[][] => {
  const tokens = Array.from(text.matchAll(/\r\n|\r|[\s\S]/gu), match => ({ character: /[\r\n]/.test(match[0]) ? '\n' : match[0], sourceStart: match.index }))
  return options.autoParagraphIndent ? paragraphIndentedPages(tokens, composition) : legacyManuscriptPages(tokens, composition)
}

export const manuscriptPages = (text: string, composition: Composition, options: ManuscriptLayoutOptions = {}): ManuscriptCell[][] =>
  indexedManuscriptPages(text, composition, options).map(page => page.map(cell => cell?.character ?? null))

export const pageTotal = (text: string, composition: Composition, options: ManuscriptLayoutOptions = {}) => manuscriptPages(text, composition, options).length

export const pageCharacters = (text: string, composition: Composition, page = 0, options: ManuscriptLayoutOptions = {}) =>
  manuscriptPages(text, composition, options)[page] ?? Array(pageCapacity(composition)).fill(null)
