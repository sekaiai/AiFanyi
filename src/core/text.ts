import { MAX_TRANSLATION_TEXT_LENGTH } from './settings'

export const MAX_SOURCE_LENGTH = MAX_TRANSLATION_TEXT_LENGTH

const WORD_RE = /[A-Za-z]+(?:[’'-][A-Za-z]+)*/g
const SINGLE_WORD_RE = /^\s*([A-Za-z]+(?:[’'-][A-Za-z]+)*)[.!?,;:\s]*$/

export type TextAction = { type: 'dictionary' | 'ai'; text: string } | { type: 'empty'; text: '' }

export function classifySelection(text: string): TextAction {
  const normalized = normalizeSourceText(text)
  if (!normalized) return { type: 'empty', text: '' }
  const word = normalized.match(SINGLE_WORD_RE)?.[1]
  return word ? { type: 'dictionary', text: word } : { type: 'ai', text: normalized }
}

export const classifyText = classifySelection

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function normalizeSourceText(text: string): string {
  return normalizeText(text).slice(0, MAX_TRANSLATION_TEXT_LENGTH)
}

export function isSingleEnglishWord(text: string): boolean {
  return classifySelection(text).type === 'dictionary'
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

export const getWordAtTextOffset = getWordAtOffset

export function isIgnorableElement(element: Element | null): boolean {
  return Boolean(element?.closest('script, style, textarea, input, select, option, button, [contenteditable], pre, code, #aifanyi-shadow-host, #aifanyi-word-highlight'))
}
