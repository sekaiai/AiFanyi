/**
 * 悬停选词高亮：独立于气泡的 fixed 元素，覆盖命中的单词矩形。
 * content script 与选项页交互演示共用同一实现，保证两侧行为一致。
 */

/** 高亮固定透明度（8 位 hex alpha，0x38 ≈ 22%）：半透明才不会遮挡文字本身。 */
const HIGHLIGHT_ALPHA = '38'
const DEFAULT_HIGHLIGHT_COLOR = '#4f84e8'

/** 设置里的 hex 颜色 → 带 fixed 透明度的背景值；非法值回退默认色。 */
function highlightBackground(color: string): string {
  return `${/^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_HIGHLIGHT_COLOR}${HIGHLIGHT_ALPHA}`
}

export function createHighlight(): HTMLSpanElement {
  const highlight = document.createElement('span')
  Object.assign(highlight.style, {
    position: 'fixed',
    zIndex: '2147483646',
    display: 'none',
    borderRadius: '3px',
    pointerEvents: 'none',
  })
  highlight.id = 'aifanyi-word-highlight'
  document.documentElement.append(highlight)
  return highlight
}

export function showHighlight(highlight: HTMLElement, rect: DOMRect, color = DEFAULT_HIGHLIGHT_COLOR): void {
  Object.assign(highlight.style, {
    display: 'block',
    background: highlightBackground(color),
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  })
}

export function hideHighlight(highlight: HTMLElement): void {
  highlight.style.display = 'none'
}
