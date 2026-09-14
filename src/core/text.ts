import { MAX_TRANSLATION_TEXT_LENGTH } from './settings'

const WORD_RE = /[A-Za-z]+(?:[’'-][A-Za-z]+)*/g
const SINGLE_WORD_RE = /^\s*([A-Za-z]+(?:[’'-][A-Za-z]+)*)[.!?,;:\s]*$/

type TextAction = { type: 'dictionary' | 'ai'; text: string } | { type: 'empty'; text: '' }

export function classifySelection(text: string): TextAction {
  const normalized = normalizeSourceText(text)
  if (!normalized) return { type: 'empty', text: '' }
  const word = extractSingleWord(text)
  return word ? { type: 'dictionary', text: word } : { type: 'ai', text: normalized }
}

export function extractSingleWord(text: string): string | null {
  return normalizeSourceText(text).match(SINGLE_WORD_RE)?.[1] ?? null
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function normalizeSourceText(text: string): string {
  return normalizeText(text).slice(0, MAX_TRANSLATION_TEXT_LENGTH)
}

export function getWordAtOffset(text: string, offset: number): { word: string; start: number; end: number } | null {
  WORD_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WORD_RE.exec(text))) {
    const start = match.index
    const end = start + match[0].length
    if (offset >= start && offset < end) return { word: match[0], start, end }
  }
  return null
}

// 交互排除的基础集合：脚本/样式/输入控件/按钮/插件自身节点（悬停与划词都排除）。
const IGNORED_BASE_SELECTOR = 'script, style, textarea, input, select, option, button, [contenteditable], #aifanyi-shadow-host, #aifanyi-word-highlight'

/** 悬停（隐式触发）额外排除代码区：扫过代码时不该连环弹泡。 */
export function isIgnorableElement(element: Element | null): boolean {
  return Boolean(element?.closest(`${IGNORED_BASE_SELECTOR}, pre, code`))
}

/** 显式划词比悬停宽松：代码区（pre/code）也允许翻译。 */
export function isSelectionIgnorableElement(element: Element | null): boolean {
  return Boolean(element?.closest(IGNORED_BASE_SELECTOR))
}

/** 当前是否存在非折叠的选区文本（有选区时悬停让位给划词）。 */
export function hasActiveSelection(): boolean {
  const selection = window.getSelection()
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim())
}

export function getCaretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
  }
  const position = document.caretPositionFromPoint?.(x, y)
  return position ? { node: position.offsetNode, offset: position.offset } : null
}
