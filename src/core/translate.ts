import { requestAiTranslation } from './ai'
import { requestBaiduTranslation } from './baidu'
import { requestVolcengineTranslation } from './volcengine'
import { lookupDictionary, type DictionaryResult } from './dictionary'
import { extractSingleWord, normalizeSourceText } from './text'
import type {
  AiSchemeSettings,
  DeeplSchemeSettings,
  GoogleCloudSchemeSettings,
  SchemeSettings,
  TranslationSettings,
} from './types'

const SCHEME_TIMEOUT_MS = 15000
const DEEPL_FREE_ENDPOINT = 'https://api-free.deepl.com/v2/translate'
const DEEPL_PRO_ENDPOINT = 'https://api.deepl.com/v2/translate'
const GOOGLE_FREE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t'
const GOOGLE_CLOUD_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2'

const TARGET_CODES: Record<string, { deepl: string; google: string }> = {
  '简体中文': { deepl: 'ZH', google: 'zh-CN' },
  '繁體中文': { deepl: 'ZH', google: 'zh-TW' },
  'English': { deepl: 'EN', google: 'en' },
  '日本語': { deepl: 'JA', google: 'ja' },
  '한국어': { deepl: 'KO', google: 'ko' },
  'Français': { deepl: 'FR', google: 'fr' },
  'Deutsch': { deepl: 'DE', google: 'de' },
  'Español': { deepl: 'ES', google: 'es' },
  'Русский': { deepl: 'RU', google: 'ru' },
}

function targetCodes(targetLanguage: string): { deepl: string; google: string } {
  return TARGET_CODES[targetLanguage] ?? { deepl: 'ZH', google: 'zh-CN' }
}

export type TranslateOutcome =
  | { kind: 'dictionary'; result: DictionaryResult }
  | { kind: 'text'; text: string }

export function hasRequiredConfig(scheme: SchemeSettings): boolean {
  switch (scheme.type) {
    case 'deepl':
      return Boolean(scheme.authKey.trim())
    case 'google':
      return true
    case 'googleCloud':
      return Boolean(scheme.apiKey.trim())
    case 'baidu':
      return Boolean(scheme.appId.trim() && scheme.secretKey.trim())
    case 'volcengine':
      return Boolean(scheme.accessKeyId.trim() && scheme.secretAccessKey.trim() && scheme.region.trim())
    case 'ai':
      return Boolean(scheme.apiUrl.trim() && scheme.apiKey.trim() && scheme.model.trim())
  }
}

export async function translateWithScheme(
  scheme: SchemeSettings,
  text: string,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<TranslateOutcome> {
  const source = normalizeSourceText(text)
  switch (scheme.type) {
    case 'deepl':
      return { kind: 'text', text: await translateWithDeepl(scheme, source, targetLanguage, signal) }
    case 'google':
      return { kind: 'text', text: await translateWithGoogle(source, targetLanguage, signal) }
    case 'googleCloud':
      return { kind: 'text', text: await translateWithGoogleCloud(scheme, source, targetLanguage, signal) }
    case 'baidu':
      return { kind: 'text', text: await requestBaiduTranslation(source, scheme, targetLanguage, signal) }
    case 'volcengine':
      return { kind: 'text', text: await requestVolcengineTranslation(source, scheme, targetLanguage, signal) }
    case 'ai':
      return { kind: 'text', text: await requestAiTranslation(source, scheme, targetLanguage, signal) }
  }
}

export async function runTranslation(
  text: string,
  settings: TranslationSettings,
  signal?: AbortSignal,
): Promise<TranslateOutcome> {
  const schemes = settings.schemes.filter((scheme) => scheme.enabled && hasRequiredConfig(scheme))
  let schemeError: unknown = null
  let schemeTried = false
  for (const scheme of schemes) {
    schemeTried = true
    try {
      return await translateWithScheme(scheme, text, settings.targetLanguage, signal)
    } catch (error) {
      if (isAbortError(error)) throw error
      schemeError = error
    }
  }

  const word = extractSingleWord(text)
  if (word) {
    try {
      return { kind: 'dictionary', result: await lookupDictionary(word, signal) }
    } catch (error) {
      if (isAbortError(error)) throw error
      if (!schemeTried) throw error
    }
  }

  if (!schemeTried) throw new Error('请先在设置中添加翻译方案')
  throw schemeError ?? new Error('翻译失败')
}

async function translateWithDeepl(
  scheme: DeeplSchemeSettings,
  source: string,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<string> {
  const payload = await requestJsonWithTimeout(
    scheme.endpoint === 'pro' ? DEEPL_PRO_ENDPOINT : DEEPL_FREE_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `DeepL-Auth-Key ${scheme.authKey}`,
      },
      body: JSON.stringify({ text: [source], target_lang: targetCodes(targetLanguage).deepl }),
    },
    signal,
  )
  const translations = readArray(readRecord(payload).translations)
  const text = readText(readRecord(translations[0]).text)
  if (!text) throw new Error('DeepL 返回内容为空。')
  return text
}

async function translateWithGoogle(source: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  const payload = await requestJsonWithTimeout(`${GOOGLE_FREE_ENDPOINT}&tl=${encodeURIComponent(targetCodes(targetLanguage).google)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q: source }).toString(),
  }, signal)
  const segments = readArray(readArray(payload)[0])
  const text = segments.map((segment) => readText(readArray(segment)[0])).join('').trim()
  if (!text) throw new Error('Google 返回内容为空。')
  return text
}

async function translateWithGoogleCloud(
  scheme: GoogleCloudSchemeSettings,
  source: string,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<string> {
  const payload = await requestJsonWithTimeout(
    `${GOOGLE_CLOUD_ENDPOINT}?key=${encodeURIComponent(scheme.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: source, target: targetCodes(targetLanguage).google, format: 'text' }),
    },
    signal,
  )
  const translations = readArray(readRecord(readRecord(payload).data).translations)
  const text = readText(readRecord(translations[0]).translatedText)
  if (!text) throw new Error('Google Cloud 返回内容为空。')
  return text
}

async function requestJsonWithTimeout(url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const timeout = new AbortController()
  const timeoutId = setTimeout(() => timeout.abort(new DOMException('Request timed out', 'TimeoutError')), SCHEME_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      ...init,
      signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType && !contentType.includes('application/json')) throw new Error('响应不是 JSON。')
    return await response.json().catch(() => null)
  } finally {
    clearTimeout(timeoutId)
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
