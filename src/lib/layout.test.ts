import { describe, expect, it } from 'vitest'
import { indexedManuscriptPages, manuscriptCharacters, manuscriptDisplayCells, manuscriptPages, pageTotal } from './layout'

describe('原稿用紙の計算', () => {
  const composition = { characters: 2, lines: 2 }

  it('空の文章でも1ページを表示する', () => {
    expect(pageTotal('', composition)).toBe(1)
  })

  it('通常の空白を文字として残す', () => {
    expect(manuscriptCharacters('A B')).toEqual(['A', ' ', 'B'])
  })

  it('改行は本文文字数に含めない', () => {
    expect(manuscriptCharacters('A\nB')).toEqual(['A', 'B'])
  })

  it('改行で次の行を開始する', () => {
    expect(manuscriptPages('あ\nい', composition)[0]).toEqual(['あ', null, 'い', null])
  })

  it('行末の改行で次の行を二重に空けない', () => {
    expect(manuscriptPages('あい\nう', composition)[0]).toEqual(['あ', 'い', 'う', null])
  })

  it('連続した改行は空行を残す', () => {
    expect(manuscriptPages('あ\n\nい', composition)[0]).toEqual(['あ', null, null, null])
    expect(manuscriptPages('あ\n\nい', composition)[1]).toEqual(['い', null, null, null])
  })

  it('改ページ境界をまたぐ連続改行も空行を残す', () => {
    expect(manuscriptPages('あ\n\n\nい', composition)[1]).toEqual([null, null, 'い', null])
  })

  it('容量を超えると次ページを数える', () => {
    expect(pageTotal('あいうえお', composition)).toBe(2)
    expect(manuscriptPages('あいうえお', composition)[1]).toEqual(['お', null, null, null])
  })

  it('満ページ直後の改行では次ページの先頭から続ける', () => {
    expect(manuscriptPages('あいうえ\nお', composition)[1]).toEqual(['お', null, null, null])
  })

  it('段落の自動適用は最初の段落を1マスだけ下げる', () => {
    expect(manuscriptPages('あ', { characters: 3, lines: 2 }, { autoParagraphIndent: true })[0])
      .toEqual([null, 'あ', null, null, null, null])
  })

  it('自動字下げでも明示した行頭・途中の半角全角空白とタブを保持する', () => {
    const text = '  A B\n　　C　D\n\tE'
    for (const autoParagraphIndent of [false, true]) {
      const pages = indexedManuscriptPages(text, { characters: 8, lines: 4 }, { autoParagraphIndent })
      expect(pages.flat().filter(cell => cell !== null).map(cell => cell.character).join(''))
        .toBe(text.replaceAll('\n', ''))
      expect(pages[0].slice(0, 5).map(cell => cell?.character ?? null)).toEqual([' ', ' ', 'A', ' ', 'B'])
      expect(pages[0].slice(8, 13).map(cell => cell?.character ?? null)).toEqual(['　', '　', 'C', '　', 'D'])
      expect(pages[0].slice(16, 18).map(cell => cell?.character ?? null)).toEqual(['\t', 'E'])
    }
  })

  it('自動字下げでも先頭・連続の空行と空白だけの段落を保持する', () => {
    expect(manuscriptPages('\nあ\n\nい', { characters: 3, lines: 4 }, { autoParagraphIndent: true })[0])
      .toEqual([null, null, null, null, 'あ', null, null, null, null, null, 'い', null])
    expect(manuscriptPages(' 　\t', { characters: 3, lines: 2 }, { autoParagraphIndent: true })[0])
      .toEqual([' ', '　', '\t', null, null, null])
  })

  it('自動字下げでも改ページをまたぐ空行と明示した空白を保持する', () => {
    const pages = manuscriptPages('あい\n\n う', { characters: 3, lines: 2 }, { autoParagraphIndent: true })
    expect(pages[0]).toEqual([null, 'あ', 'い', null, null, null])
    expect(pages[1]).toEqual([' ', 'う', null, null, null, null])
  })

  it('改行直前が行末でも次段落は1マス字下げし空行を増やさない', () => {
    expect(manuscriptPages('あい\nう', { characters: 3, lines: 2 }, { autoParagraphIndent: true })[0])
      .toEqual([null, 'あ', 'い', null, 'う', null])
  })

  it('空白保持と字下げのON/OFFにかかわらずUTF-16の本文offsetを維持する', () => {
    const text = '  A😀\r\n\r\n　B é\n\tC'
    for (const autoParagraphIndent of [false, true]) {
      const cells = indexedManuscriptPages(text, { characters: 4, lines: 2 }, { autoParagraphIndent }).flat().filter(cell => cell !== null)
      expect(cells.map(cell => cell.character).join('')).toBe(text.replaceAll(/\r\n?|\n/g, ''))
      for (const cell of cells) expect(text.slice(cell.sourceStart, cell.sourceStart + cell.character.length)).toBe(cell.character)
      expect(cells.find(cell => cell.character === 'B')?.sourceStart).toBe(10)
    }
  })

  it('段落の自動適用をオフにすると従来の改行組版を維持する', () => {
    expect(manuscriptPages('あ\nい', composition, { autoParagraphIndent: false })[0])
      .toEqual(manuscriptPages('あ\nい', composition)[0])
  })

  it('縦書きは先頭列を右端から均一に配置する', () => {
    expect(manuscriptDisplayCells(['あ', 'い', 'う', 'え'], composition, 'vertical')).toEqual(['う', 'あ', 'え', 'い'])
  })

  it('横書きは入力順をそのまま表示する', () => {
    expect(manuscriptDisplayCells(['あ', 'い', 'う', 'え'], composition, 'horizontal')).toEqual(['あ', 'い', 'う', 'え'])
  })
})
