import { readArray, readRecord, readText } from './read'

const DICTIONARY_API_BASE = 'https://freedictionaryapi.com/api/v1'

export interface DictionaryMeaning {
  partOfSpeech: string
  translations: string[]
}

export interface DictionaryResult {
  pronunciation: string
  meanings: DictionaryMeaning[]
}

export async function lookupDictionary(word: string, signal?: AbortSignal): Promise<DictionaryResult> {
  const init: RequestInit = signal ? { signal } : {}
  const response = await fetch(`${DICTIONARY_API_BASE}/entries/en/${encodeURIComponent(word.toLowerCase())}?translations=true`, init)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseDictionaryResult(await response.json())
}

export function parseDictionaryResult(payload: unknown): DictionaryResult {
  const entries = Array.isArray(payload) ? payload : readArray(readRecord(payload).entries)
  let pronunciation = ''
  const meanings: DictionaryMeaning[] = []

  for (const entry of entries.map(readRecord)) {
    pronunciation ||= readPronunciation(entry)
    collectTranslatedSenses(entry, meanings)
    collectEnglishDefinitions(entry, meanings)
    if (meanings.length >= 3) break
  }

  return { pronunciation, meanings: meanings.slice(0, 3) }
}

function collectTranslatedSenses(entry: Record<string, unknown>, meanings: DictionaryMeaning[]): void {
  const senses = readArray(entry.senses).map(readRecord)
  for (const sense of senses) {
    const zh = readArray(sense.translations)
      .map(readRecord)
      .filter((item) => {
        const language = item.language
        const code = typeof language === 'string' ? language : readText(readRecord(language).code)
        return ['zh', 'zho', 'cmn'].includes(code)
      })
      .map((item) => readText(item.word) || readText(item.text))
      .filter(Boolean)
    if (zh.length) meanings.push({ partOfSpeech: readText(entry.partOfSpeech), translations: [...new Set(zh)].slice(0, 4) })
    if (meanings.length >= 3) break
  }
}

function collectEnglishDefinitions(entry: Record<string, unknown>, meanings: DictionaryMeaning[]): void {
  if (meanings.length) return
  for (const meaning of readArray(entry.meanings).map(readRecord)) {
    const translations = readArray(meaning.definitions)
      .map(readRecord)
      .map((item) => readText(item.definition))
      .filter(Boolean)
      .slice(0, 3)
    if (translations.length) meanings.push({ partOfSpeech: readText(meaning.partOfSpeech), translations })
    if (meanings.length >= 3) break
  }
}

function readPronunciation(entry: Record<string, unknown>): string {
  const ipa = readArray(entry.pronunciations)
    .map(readRecord)
    .find((item) => item.type === 'ipa' && readText(item.text))
  if (ipa) return readText(ipa.text)
  const phonetic = readText(entry.phonetic)
  if (phonetic) return phonetic
  return readArray(entry.phonetics)
    .map(readRecord)
    .map((item) => readText(item.text))
    .find(Boolean) ?? ''
}
