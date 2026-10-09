import { describe, expect, it } from 'vitest'
import { createSelectableStyle } from '../../src/extension/selectable'

describe('selectable style', () => {
  it('注入 button 可选中规则', () => {
    const style = createSelectableStyle()
    expect(style.parentElement).toBe(document.documentElement)
    expect(style.textContent).toContain('button')
    expect(style.textContent).toContain('user-select: text !important')

    style.remove()
    expect(style.parentElement).toBeNull()
  })
})