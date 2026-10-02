import { describe, expect, it } from 'vitest'
import { selectionPopoverPosition } from './textarea-selection'

describe('selection popover placement', () => {
  const viewport = { left: 0, top: 0, width: 390, height: 844 }
  it('appears next to the selection when there is room', () => {
    expect(selectionPopoverPosition({ left: 40, top: 120, bottom: 148 }, { width: 240, height: 56 }, viewport)).toEqual({ left: 40, top: 156 })
  })
  it('flips above a selection at the viewport bottom and clamps at the right', () => {
    expect(selectionPopoverPosition({ left: 380, top: 800, bottom: 830 }, { width: 240, height: 56 }, viewport)).toEqual({ left: 142, top: 736 })
  })
  it('respects the visible viewport after a mobile keyboard or zoom', () => {
    expect(selectionPopoverPosition({ left: 5, top: 110, bottom: 140 }, { width: 180, height: 56 }, { left: 20, top: 100, width: 300, height: 80 })).toEqual({ left: 28, top: 108 })
  })
})
