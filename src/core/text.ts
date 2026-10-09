import { MAX_TRANSLATION_TEXT_LENGTH } from './settings'

const WORD_RE = /[A-Za-z]+(?:[’'-][A-Za-z]+)*/g
const SINGLE_WORD_RE = /^\s*([A-Za-z]+(?:[’'-][A-Za-z]+)*)[.!?,;:\s]*$/

// 拉丁词之外的多语言取词：Intl.Segmenter 处理中日韩等文本。
// 拉丁词仍走上面的正则（Segmenter 会把 don't 切成 don/'/t），仅当 segment 含非 ASCII 字母时才交给它。
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

type WordMatch = { word: string; start: number; end: number }

/** segment 是否为可作词候选：存在非 ASCII 字母（纯 ASCII 已由拉丁正则覆盖，纯数字/符号不算词）。 */
function isWordCandidate(segment: string): boolean {
  return /\p{L}/u.test(segment.replace(/[\p{ASCII}]+/gu, ''))
}

/** CJK 词最少两个字：单字不触发词典查询。 */
function isShortCjkWord(word: string): boolean {
  return CJK_RE.test(word) && [...word].length < 2
}

type TextAction = { type: 'dictionary' | 'ai'; text: string } | { type: 'empty'; text: '' }

// 纯数字/符号/空白不含任何文字字符，翻译无意义（与 isWordCandidate 的取词意图一致，补齐划词 ai 分支缺口）。
const TRANSLATABLE_RE = /\p{L}/u

export function classifySelection(text: string): TextAction {
  const normalized = normalizeSourceText(text)
  if (!normalized || !TRANSLATABLE_RE.test(normalized)) return { type: 'empty', text: '' }
  const word = extractSingleWord(text)
  return word ? { type: 'dictionary', text: word } : { type: 'ai', text: normalized }
}

export function extractSingleWord(text: string): string | null {
  const normalized = normalizeSourceText(text)
  const latin = normalized.match(SINGLE_WORD_RE)?.[1]
  if (latin) return latin
  return extractNonLatinWord(normalized)
}

/** 划选非拉丁文本：去首尾标点后分词，仅当恰好一个可作词时返回（CJK 至少 2 字符）。 */
function extractNonLatinWord(text: string): string | null {
  const trimmed = text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  if (!trimmed) return null
  const words = [...segmenter.segment(trimmed)].filter((seg) => seg.isWordLike && isWordCandidate(seg.segment))
  if (words.length !== 1 || !words[0]) return null
  if (isShortCjkWord(words[0].segment)) return null
  return words[0].segment
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function normalizeSourceText(text: string): string {
  return normalizeText(text).slice(0, MAX_TRANSLATION_TEXT_LENGTH)
}

export function getWordAtOffset(text: string, offset: number): WordMatch | null {
  WORD_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WORD_RE.exec(text))) {
    const start = match.index
    const end = start + match[0].length
    if (offset >= start && offset < end) return { word: match[0], start, end }
  }
  for (const seg of segmenter.segment(text)) {
    if (!seg.isWordLike || !isWordCandidate(seg.segment)) continue
    const start = seg.index
    const end = start + seg.segment.length
    if (offset < start || offset >= end) continue
    if (isShortCjkWord(seg.segment)) return null
    return { word: seg.segment, start, end }
  }
  return null
}

// 划词（显式触发）排除：只排除脚本/样式与插件自身节点；按钮/输入控件/可编辑区都允许划词
// （button 的 UA 默认 user-select: none 由扩展注入样式恢复，见 extension/selectable.ts）。
const SELECTION_IGNORED_SELECTOR = 'script, style, #aifanyi-shadow-host, #aifanyi-word-highlight'

// 悬停额外排除：代码区，以及没有 DOM 文本层、按坐标取不到字符的原生控件。
const HOVER_EXTRA_SELECTOR = 'pre, code, textarea, input, select, option'

/** 悬停（隐式触发）排除：代码区与原生输入控件（扫过代码不该连环弹泡；控件内取不到字符）。 */
export function isIgnorableElement(element: Element | null): boolean {
  return Boolean(element?.closest(`${SELECTION_IGNORED_SELECTOR}, ${HOVER_EXTRA_SELECTOR}`))
}

/** 划词（显式触发）比悬停宽松：代码区（pre/code）也允许翻译。 */
export function isSelectionIgnorableElement(element: Element | null): boolean {
  return Boolean(element?.closest(SELECTION_IGNORED_SELECTOR))
}

type ControlSelection = { element: HTMLInputElement | HTMLTextAreaElement; text: string }

/** 穿透 shadow DOM 取最内层活跃元素（部分站点输入框在 shadow root 内，document.activeElement 只能拿到宿主）。 */
function deepActiveElement(): Element | null {
  let active: Element | null = document.activeElement
  while (active) {
    const inner = active.shadowRoot?.activeElement
    if (!inner) break
    active = inner
  }
  return active
}

/** 输入控件（input/textarea）的选区在控件内部（selectionStart/End），不属于 document 选区。
 *  password 与不支持选区 API 的类型（email/number 等 getter 返回 null）跳过。 */
export function getControlSelection(): ControlSelection | null {
  const active = deepActiveElement()
  if (!(active instanceof HTMLInputElement) && !(active instanceof HTMLTextAreaElement)) return null
  if (active.type === 'password') return null
  const start = active.selectionStart
  const end = active.selectionEnd
  if (start === null || end === null || start === end) return null
  // 反向拖选时 selectionStart 可能大于 selectionEnd
  return { element: active, text: active.value.slice(Math.min(start, end), Math.max(start, end)) }
}

/** 当前是否存在非折叠的选区文本（有选区时悬停让位给划词）；输入控件内部选区同样算。 */
export function hasActiveSelection(): boolean {
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed && selection.toString().trim()) return true
  return Boolean(getControlSelection()?.text.trim())
}

export function getCaretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
  }
  const position = document.caretPositionFromPoint?.(x, y)
  return position ? { node: position.offsetNode, offset: position.offset } : null
}
