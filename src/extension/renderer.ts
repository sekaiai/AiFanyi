import type { BubblePlacement } from '../core/bubble'
import { bubbleCssVariables } from '../core/bubble'
import type { DictionaryResult } from '../core/dictionary'
import type { BubbleSettings, RectLike } from '../core/types'

export interface DictionaryRenderOptions {
  /** 提供时在单词卡片右上角渲染朗读按钮（▶）；仅当「显示原文」开启时生效。 */
  onSpeak?: () => void
}

export interface BubbleRenderer {
  root: HTMLElement
  content: HTMLElement
  container: HTMLElement
  showLoading(message: string, sourceWord?: string): void
  showDictionary(sourceWord: string, result: DictionaryResult, options?: DictionaryRenderOptions): void
  showText(text: string, sourceWord?: string): void
  showError(message: string, retry?: () => void): void
  prepareForMeasure(minWidth: number, maxWidth: number): void
  applyPlacement(placement: BubblePlacement): void
  applySettings(settings: BubbleSettings): void
  hide(): void
  destroy(): void
  isVisible(): boolean
}

export function createBubbleRenderer(settings: BubbleSettings): BubbleRenderer {
  const host = document.createElement('div')
  host.id = 'aifanyi-shadow-host'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = bubbleStyle
  const bubble = document.createElement('section')
  bubble.className = 'bubble'
  bubble.setAttribute('role', 'status')
  bubble.setAttribute('aria-live', 'polite')
  const content = document.createElement('div')
  content.className = 'content'
  const arrow = document.createElement('span')
  arrow.className = 'arrow'
  arrow.setAttribute('aria-hidden', 'true')
  bubble.append(content, arrow)
  shadow.append(style, bubble)
  document.documentElement.append(host)

  function replaceContent(nodes: Node[]) {
    content.replaceChildren(...nodes)
  }

  const renderer: BubbleRenderer = {
    root: bubble,
    container: host,
    content,
    showLoading(message, sourceWord = '') {
      const nodes: Node[] = []
      if (sourceWord && settings.showOriginal) nodes.push(sourceNode(sourceWord))
      const loading = document.createElement('div')
      loading.className = 'muted'
      loading.textContent = message
      nodes.push(loading)
      bubble.setAttribute('aria-busy', 'true')
      replaceContent(nodes)
    },
    showDictionary(sourceWord, result, options) {
      // 朗读按钮跟随「显示原文」：原文行隐藏时按钮没有落点，直接不渲染。
      const speakable = Boolean(options?.onSpeak) && settings.showOriginal
      const nodes: Node[] = []
      if (settings.showOriginal) nodes.push(wordNode(sourceWord, result.pronunciation, speakable))
      if (result.meanings.length) {
        for (const meaning of result.meanings) {
          const line = document.createElement('div')
          line.className = 'result'
          if (meaning.partOfSpeech) {
            const pos = document.createElement('span')
            pos.className = 'pos'
            pos.textContent = meaning.partOfSpeech
            line.append(pos)
          }
          line.append(document.createTextNode(meaning.translations.join('；')))
          // 释义行 CSS 限单行省略，悬停通过原生 tooltip 看全文
          line.title = meaning.translations.join('；')
          nodes.push(line)
        }
      } else {
        nodes.push(emptyNode('暂无中文释义'))
      }
      bubble.setAttribute('aria-busy', 'false')
      replaceContent(nodes)
      if (speakable) {
        // 按钮固定在卡片右上角（absolute 于 .content），不随音标长短 / 原文换行跳动
        const speak = document.createElement('button')
        speak.type = 'button'
        speak.className = 'speak'
        speak.title = '朗读'
        speak.textContent = '▶'
        speak.addEventListener('click', () => options?.onSpeak?.())
        content.append(speak)
      }
    },
    showText(text, sourceWord = '') {
      const nodes: Node[] = []
      if (sourceWord && settings.showOriginal) nodes.push(sourceNode(sourceWord))
      const div = document.createElement('div')
      div.className = 'sentence'
      div.textContent = text
      nodes.push(div)
      bubble.setAttribute('aria-busy', 'false')
      replaceContent(nodes)
    },
    showError(message, retry) {
      const nodes: Node[] = [emptyNode(message)]
      if (retry) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = '重试'
        button.addEventListener('click', retry)
        nodes.push(button)
      }
      bubble.setAttribute('aria-busy', 'false')
      replaceContent(nodes)
    },
    prepareForMeasure(minWidth, maxWidth) {
      bubble.style.width = 'max-content'
      bubble.style.minWidth = `${minWidth}px`
      bubble.style.maxWidth = `${maxWidth}px`
      bubble.style.left = '0'
      bubble.style.top = '0'
      bubble.style.display = 'block'
      bubble.style.visibility = 'hidden'
    },
    applyPlacement(placement) {
      bubble.dataset.side = placement.side
      bubble.dataset.arrow = String(settings.showArrow)
      bubble.style.left = `${placement.left}px`
      bubble.style.top = `${placement.top}px`
      bubble.style.setProperty('--af-arrow-x', `${placement.arrowX}px`)
      bubble.style.setProperty('--af-arrow-y', `${placement.arrowY}px`)
      bubble.style.visibility = 'visible'
    },
    applySettings(next) {
      settings = next
      for (const [key, value] of Object.entries(bubbleCssVariables(next))) {
        bubble.style.setProperty(key, value)
      }
      bubble.dataset.arrow = String(next.showArrow)
    },
    hide() {
      bubble.style.display = 'none'
    },
    destroy() {
      host.remove()
    },
    isVisible() {
      return bubble.style.display === 'block'
    },
  }
  renderer.applySettings(settings)
  return renderer
}

export function boundsFromRange(range: Range): RectLike | null {
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width && rect.height)
  const source = rects.length ? rects : [range.getBoundingClientRect()].filter((rect) => rect.width && rect.height)
  if (!source.length) return null
  return {
    left: Math.min(...source.map((rect) => rect.left)),
    right: Math.max(...source.map((rect) => rect.right)),
    top: Math.min(...source.map((rect) => rect.top)),
    bottom: Math.max(...source.map((rect) => rect.bottom)),
  }
}

/** 选区所在最近块级容器的宽度；句子翻译气泡以它为宽度上限。测不出时返回 0（调用方回退单词封顶）。 */
export function selectionContainerWidth(range: Range): number {
  const node = range.commonAncestorContainer
  let el = node instanceof Element ? node : node.parentElement
  while (el) {
    const display = getComputedStyle(el).display
    if (display !== 'inline' && display !== 'contents') break
    el = el.parentElement
  }
  const width = el?.clientWidth ?? 0
  return Number.isFinite(width) ? width : 0
}

function wordNode(word: string, pronunciation = '', speakable = false): HTMLElement {
  const div = document.createElement('div')
  div.className = speakable ? 'word speakable' : 'word'
  div.textContent = word
  if (pronunciation) {
    const span = document.createElement('span')
    span.className = 'pronunciation'
    span.textContent = pronunciation
    div.append(span)
  }
  return div
}

function sourceNode(text: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'source'
  const inner = document.createElement('span')
  inner.className = 'source-text'
  inner.textContent = text
  wrapper.append(inner)
  return wrapper
}

function emptyNode(text: string): HTMLElement {
  const div = document.createElement('div')
  div.className = 'muted'
  div.textContent = text
  return div
}

const bubbleStyle = `
:host {
  all: initial;
}
.bubble {
  box-sizing: border-box;
  position: fixed;
  z-index: 2147483647;
  display: none;
  width: max-content;
  min-width: 160px;
  max-width: min(290px, calc(100vw - 16px));
  overflow: visible;
  border: var(--af-bubble-border-width, 1px) solid var(--af-bubble-border, #d6dae1);
  border-radius: var(--af-bubble-radius, 8px);
  background: var(--af-bubble-background, #fbfbfc);
  color: var(--af-bubble-text, #30323a);
  box-shadow: var(--af-bubble-shadow, 0 6px 20px rgb(0 0 0 / 0.11));
  font-family: var(--af-bubble-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--af-bubble-font-size, 16px);
  font-weight: var(--af-bubble-font-weight, 400);
  line-height: var(--af-bubble-line-height, 1.55);
  text-align: var(--af-bubble-text-align, left);
  overflow-wrap: anywhere;
}
.content {
  position: relative;
  z-index: 1;
  max-height: 320px;
  padding: var(--af-bubble-padding, 10px);
  overflow: auto;
  border-radius: inherit;
  background: var(--af-bubble-background, #fbfbfc);
}
.arrow {
  position: absolute;
  z-index: 0;
  display: none;
  width: 10px;
  height: 10px;
  background: var(--af-bubble-background, #fbfbfc);
  pointer-events: none;
}
.bubble[data-arrow="true"] .arrow {
  display: block;
}
.bubble[data-side="top"] .arrow,
.bubble[data-side="bottom"] .arrow {
  left: var(--af-arrow-x, 50%);
}
.bubble[data-side="left"] .arrow,
.bubble[data-side="right"] .arrow {
  top: var(--af-arrow-y, 50%);
}
.bubble[data-side="top"] .arrow {
  bottom: -5px;
  border-right: var(--af-bubble-border-width, 1px) solid var(--af-bubble-border, #d6dae1);
  border-bottom: var(--af-bubble-border-width, 1px) solid var(--af-bubble-border, #d6dae1);
  transform: translateX(-50%) rotate(45deg);
}
.bubble[data-side="bottom"] .arrow {
  top: -5px;
  border-top: var(--af-bubble-border-width, 1px) solid var(--af-bubble-border, #d6dae1);
  border-left: var(--af-bubble-border-width, 1px) solid var(--af-bubble-border, #d6dae1);
  transform: translateX(-50%) rotate(45deg);
}
.bubble[data-side="left"] .arrow {
  right: -5px;
  border-top: var(--af-bubble-border-width, 1px) solid var(--af-bubble-border, #d6dae1);
  border-right: var(--af-bubble-border-width, 1px) solid var(--af-bubble-border, #d6dae1);
  transform: translateY(-50%) rotate(45deg);
}
.bubble[data-side="right"] .arrow {
  left: -5px;
  border-bottom: var(--af-bubble-border-width, 1px) solid var(--af-bubble-border, #d6dae1);
  border-left: var(--af-bubble-border-width, 1px) solid var(--af-bubble-border, #d6dae1);
  transform: translateY(-50%) rotate(45deg);
}
.word {
  margin-bottom: 3px;
  font-size: calc(var(--af-bubble-font-size, 16px) + 1px);
  font-weight: 650;
}
/* 有朗读按钮时原文行右侧预留 22px，否则长单词会压到按钮上 */
.word.speakable {
  padding-right: 22px;
}
.pronunciation,
.pos {
  font-size: max(11px, calc(var(--af-bubble-font-size, 16px) - 2px));
  font-weight: 400;
  opacity: 0.65;
}
.pronunciation {
  margin-left: 6px;
}
.pos {
  margin-right: 5px;
}
.result {
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/*
 * 原文行（自定义方案路径）刻意与 .word（词典 freedictionaryapi 兜底路径）用同一套标题样式：
 * 字号 +1px、字重 650、无分隔线。两条渲染路径的观感必须一致，改动请同时改 .word。
 */
.source {
  margin-bottom: 3px;
}

.source-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: calc(var(--af-bubble-font-size, 16px) + 1px);
  font-weight: 650;
  overflow-wrap: anywhere;
}

.sentence {
  white-space: pre-wrap;
  word-break: break-word;
}
.muted {
  opacity: 0.68;
}
button {
  margin-top: 8px;
  padding: 5px 8px;
  border: 1px solid var(--af-bubble-border, #d6dae1);
  border-radius: 5px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}
button:hover {
  background: rgb(0 0 0 / 0.06);
}
.speak {
  position: absolute;
  top: calc(var(--af-bubble-padding, 10px) + 2px);
  right: calc(var(--af-bubble-padding, 10px) - 2px);
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin: 0;
  padding: 0;
  border: 1px solid var(--af-bubble-border, #d6dae1);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 10px;
  line-height: 1;
  opacity: 0.7;
}
.speak:hover {
  opacity: 1;
}
`
