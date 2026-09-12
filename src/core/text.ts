import { MAX_TRANSLATION_TEXT_LENGTH } from './settings'

const WORD_RE = /[A-Za-z]+(?:[’'-][A-Za-z]+)*/g
const SINGLE_WORD_RE = /^\s*([A-Za-z]+(?:[’'-][A-Za-z]+)*)[.!?,;:\s]*$/

export type TextAction = { type: 'dictionary' | 'ai'; text: string } | { type: 'empty'; text: '' }

export function classifySelection(text: string): TextAction {
  const normalized = normalizeSourceText(text)
  if (!normalized) return { type: 'empty', text: '' }
  const word = extractSingleWord(text)
  return word ? { type: 'dictionary', text: word } : { type: 'ai', text: normalized }
}

export function extractSingleWord(text: string): string | null {
  return normalizeSourceText(text).match(SINGLE_WORD_RE)?.[1] ?? null
}

export function normalizeText(text: string): string {
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

export function isIgnorableElement(element: Element | null): boolean {
  return Boolean(element?.closest('script, style, textarea, input, select, option, button, [contenteditable], pre, code, #aifanyi-shadow-host, #aifanyi-word-highlight'))
}

export function getCaretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
  }
  const position = document.caretPositionFromPoint?.(x, y)
  return position ? { node: position.offsetNode, offset: position.offset } : null
}
