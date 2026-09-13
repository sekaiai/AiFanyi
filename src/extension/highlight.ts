/**
 * 悬停选词高亮：独立于气泡的 fixed 元素，覆盖命中的单词矩形。
 * content script 与选项页交互演示共用同一实现，保证两侧行为一致。
 */

export function createHighlight(): HTMLSpanElement {
  const highlight = document.createElement('span')
  Object.assign(highlight.style, {
    position: 'fixed',
    zIndex: '2147483646',
    display: 'none',
    borderRadius: '3px',
    background: 'rgba(79,132,232,.22)',
    pointerEvents: 'none',
  })
  document.documentElement.append(highlight)
  return highlight
}

export function showHighlight(highlight: HTMLElement, rect: DOMRect): void {
  Object.assign(highlight.style, {
    display: 'block',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  })
}

export function hideHighlight(highlight: HTMLElement): void {
  highlight.style.display = 'none'
}
