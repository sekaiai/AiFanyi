import { describe, expect, it } from 'vitest'
import { createHighlight, hideHighlight, showHighlight } from '../../src/extension/highlight'

describe('word highlight', () => {
  it('applies the configured color with a fixed alpha', () => {
    const highlight = createHighlight()
    showHighlight(highlight, { left: 10, top: 20, width: 30, height: 40 } as DOMRect, '#ff8800')

    expect(highlight.style.display).toBe('block')
    expect(highlight.style.background).toBe('#ff880038')
    expect(highlight.style.left).toBe('10px')
    expect(highlight.style.top).toBe('20px')
    expect(highlight.id).toBe('aifanyi-word-highlight')

    hideHighlight(highlight)
    expect(highlight.style.display).toBe('none')
  })

  it('falls back to the default tint for invalid colors', () => {
    const highlight = createHighlight()
    showHighlight(highlight, { left: 0, top: 0, width: 1, height: 1 } as DOMRect, 'red')

    expect(highlight.style.background).toBe('#4f84e838')
  })

  it('uses the default color when none is given', () => {
    const highlight = createHighlight()
    showHighlight(highlight, { left: 0, top: 0, width: 1, height: 1 } as DOMRect)

    expect(highlight.style.background).toBe('#4f84e838')
  })
})
