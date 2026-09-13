import { lookupDictionary, type DictionaryMeaning, type DictionaryResult } from './dictionary'
import { readArray, readRecord, readText } from './read'
import type { WordSourceId } from './types'

/**
 * 单词免费源池：有道 / Bing / Google Free / freedictionaryapi 四源平级轮换。
 *
 * 约束：
 * - 本模块不能 import translate.ts（translate.ts 会 import 本模块做单词分流，避免循环依赖），
 *   因此 Google Free / Bing 的目标语言映射在这里独立维护。
 * - 有道 jsonapi 与 Bing ttranslatev3 都是非官方接口，没有 API 契约，
 *   随时可能变更 —— 解析函数必须容错（字段缺失即抛错，由源池换下一个源）。
 * - 连通性探测（probeWordSources）在后台启动时执行并落 storage.local，
 *   探测结果只影响「随机选择的优先级」，不阻断查词：未知 = 照样尝试。
 */

export const WORD_SOURCE_IDS = ['youdao', 'bing', 'google', 'freedictionaryapi'] as const

export const WORD_SOURCE_LABELS: Record<WordSourceId, string> = {
  youdao: '有道词典',
  bing: 'Bing 词典',
  google: 'Google Free',
  freedictionaryapi: 'freedictionaryapi',
}

/** 单词卡片结果直接复用 DictionaryResult，可直接喂给气泡的词典渲染。 */
export type WordResult = DictionaryResult

/** 连通性探测快照。results 中缺失的源视为「未检测」；latency 仅记录探测成功的源（ms）。 */
export interface WordProbeState {
  checkedAt: number
  results: Partial<Record<WordSourceId, boolean>>
  latency?: Partial<Record<WordSourceId, number>>
}

export const WORD_PROBE_STORAGE_KEY = 'aifanyi.wordProbe.v1'

const REQUEST_TIMEOUT_MS = 8000
const BING_DICT_TIMEOUT_MS = 6000

const YOUDAO_DICT_ENDPOINT = 'https://dict.youdao.com/jsonapi?q='
const YOUDAO_AUDIO_ENDPOINT = 'https://dict.youdao.com/dictvoice?audio='
const BING_TRANSLATOR_PAGE = 'https://cn.bing.com/translator'
const BING_TRANSLATE_ENDPOINT = 'https://cn.bing.com/ttranslatev3'
const BING_DICT_PAGE = 'https://cn.bing.com/dict/search?q='
const GOOGLE_FREE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t'

// word-sources 不能 import translate.ts（会循环依赖），目标语言映射独立维护一份。
const GOOGLE_TARGET_CODES: Record<string, string> = {
  '简体中文': 'zh-CN',
  '繁體中文': 'zh-TW',
  'English': 'en',
  '日本語': 'ja',
  '한국어': 'ko',
  'Français': 'fr',
  'Deutsch': 'de',
  'Español': 'es',
  'Português': 'pt',
  'Italiano': 'it',
  'Русский': 'ru',
  'Nederlands': 'nl',
  'Polski': 'pl',
  'Türkçe': 'tr',
  'العربية': 'ar',
  'ไทย': 'th',
  'Tiếng Việt': 'vi',
  'Bahasa Indonesia': 'id',
  'Bahasa Melayu': 'ms',
  'Ελληνικά': 'el',
  'Svenska': 'sv',
  'Dansk': 'da',
  'Suomi': 'fi',
  'Norsk': 'no',
  'Čeština': 'cs',
  'Magyar': 'hu',
  'Română': 'ro',
  'Українська': 'uk',
  'हिन्दी': 'hi',
}

const BING_TARGET_CODES: Record<string, string> = {
  '简体中文': 'zh-Hans',
  '繁體中文': 'zh-Hant',
  'English': 'en',
  '日本語': 'ja',
  '한국어': 'ko',
  'Français': 'fr',
  'Deutsch': 'de',
  'Español': 'es',
  'Português': 'pt',
  'Italiano': 'it',
  'Русский': 'ru',
  'Nederlands': 'nl',
  'Polski': 'pl',
  'Türkçe': 'tr',
  'العربية': 'ar',
  'ไทย': 'th',
  'Tiếng Việt': 'vi',
  'Bahasa Indonesia': 'id',
  'Bahasa Melayu': 'ms',
  'Ελληνικά': 'el',
  'Svenska': 'sv',
  'Dansk': 'da',
  'Suomi': 'fi',
  'Norsk': 'nb',
  'Čeština': 'cs',
  'Magyar': 'hu',
  'Română': 'ro',
  'Українська': 'uk',
  'हिन्दी': 'hi',
}

function googleTargetCode(targetLanguage: string): string {
  const code = GOOGLE_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`Google Free 不支持目标语言「${targetLanguage}」`)
  return code
}

function bingTargetCode(targetLanguage: string): string {
  const code = BING_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`Bing 词典不支持目标语言「${targetLanguage}」`)
  return code
}

async function fetchWithTimeout(url: string, init: RequestInit, signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const timeout = new AbortController()
  const timeoutId = setTimeout(() => timeout.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

// ---------------------------------------------------------------------------
// 有道词典（jsonapi + dictvoice 真人音频）
// ---------------------------------------------------------------------------

export function parseYoudaoResult(payload: unknown, word: string, accent: 'us' | 'uk'): WordResult {
  const entry = readArray(readRecord(readRecord(payload).ec).word).map(readRecord)[0]
  if (!entry) throw new Error('有道词典未收录该词。')
  const phone = readText(entry.usphone) || readText(entry.ukphone)
  if (!phone) throw new Error('有道词典未返回音标。')
  const pronunciation = `/${phone}/`
  const meanings: DictionaryMeaning[] = []
  for (const tr of readArray(entry.trs).map(readRecord)) {
    for (const inner of readArray(tr.tr).map(readRecord)) {
      for (const line of readYoudaoLines(readRecord(inner.l).i ?? inner.l)) {
        const meaning = parseYoudaoMeaningLine(line)
        if (meaning) meanings.push(meaning)
        if (meanings.length >= 3) break
      }
      if (meanings.length >= 3) break
    }
    if (meanings.length >= 3) break
  }
  return {
    pronunciation,
    meanings,
  }
}

export function youdaoAudioUrl(word: string, accent: 'us' | 'uk'): string {
  return `${YOUDAO_AUDIO_ENDPOINT}${encodeURIComponent(word)}&type=${accent === 'us' ? 2 : 1}`
}

/** 「v. 爱，热爱」→ { partOfSpeech: 'v.', translations: ['爱，热爱'] }；无词性前缀时词性留空。 */
export function parseYoudaoMeaningLine(line: string): DictionaryMeaning | null {
  const match = line.match(/^([a-zA-Z]+\.|prep\.|conj\.|pron\.)\s+(.+)$/)
  if (!match) return line.trim() ? { partOfSpeech: '', translations: [line.trim()] } : null
  return { partOfSpeech: match[1] ?? '', translations: [match[2] ?? ''] }
}

function readYoudaoLines(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  return readArray(value).filter((item): item is string => typeof item === 'string')
}

export async function lookupYoudao(word: string, accent: 'us' | 'uk', signal?: AbortSignal): Promise<WordResult> {
  const response = await fetchWithTimeout(
    `${YOUDAO_DICT_ENDPOINT}${encodeURIComponent(word.toLowerCase())}`,
    { headers: { Accept: 'application/json' } },
    signal,
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseYoudaoResult(await response.json(), word, accent)
}

// ---------------------------------------------------------------------------
// Bing（ttranslatev3 免密钥 + 词典页音标）
//
// 免密钥流程：先 GET translator 页拿 cookie，再从 HTML 里解析 IG 与
// params_AbusePreventionHelper（key/token），带 token 调 ttranslatev3。
// 缺 token 会返回 statusCode 205。浏览器 cookie 由扩展后台自动维护。
// ---------------------------------------------------------------------------

export function parseBingPage(html: string): { ig: string; key: string; token: string } {
  const ig = html.match(/IG:"([^"]+)"/)?.[1] ?? ''
  const abuse = html.match(/params_AbusePreventionHelper\s*=\s*(\[[^\]]*\])/)?.[1]
  const parsed = abuse ? JSON.parse(abuse) as unknown[] : []
  // key 在真实页面里是数字字面量，token 是 base64 字符串
  const key = parsed[0] === undefined || parsed[0] === null ? '' : String(parsed[0])
  const token = typeof parsed[1] === 'string' ? parsed[1] : ''
  if (!ig || !key || !token) throw new Error('Bing 页面校验参数解析失败。')
  return { ig, key, token }
}

export function parseBingTranslation(payload: unknown): string {
  const first = readRecord(readArray(payload)[0])
  const translations = readArray(first.translations).map(readRecord)
  const text = readText(readRecord(translations[0]).text)
  if (!text) throw new Error('Bing 返回内容为空。')
  return text
}

/** 音标写在词典页的 meta description 里：…美[lʌv]，英[lʌv]…。按原形词给，派生词可能对不上。 */
export function parseBingPronunciation(html: string, accent: 'us' | 'uk'): string {
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''
  const pattern = accent === 'us' ? /美\[([^\]]+)\]/ : /英\[([^\]]+)\]/
  const phone = description.match(pattern)?.[1]
  return phone ? `[${phone}]` : ''
}

export async function lookupBing(word: string, targetLanguage: string, accent: 'us' | 'uk', signal?: AbortSignal): Promise<WordResult> {
  const pageResponse = await fetchWithTimeout(BING_TRANSLATOR_PAGE, { headers: { Accept: 'text/html' } }, signal)
  if (!pageResponse.ok) throw new Error(`HTTP ${pageResponse.status}`)
  const { ig, key, token } = parseBingPage(await pageResponse.text())

  const body = new URLSearchParams({
    fromLang: 'en',
    text: word.toLowerCase(),
    to: bingTargetCode(targetLanguage),
    token,
    key,
  })
  const response = await fetchWithTimeout(
    `${BING_TRANSLATE_ENDPOINT}?isVertical=1&&IG=${encodeURIComponent(ig)}&IID=translator.5028`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    signal,
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const text = parseBingTranslation(await response.json())

  // 音标是锦上添花：词典页抓不到（限流 / 结构变更）不影响译文返回。
  let pronunciation = ''
  try {
    const dictResponse = await fetchWithTimeout(
      `${BING_DICT_PAGE}${encodeURIComponent(word.toLowerCase())}`,
      {},
      signal,
      BING_DICT_TIMEOUT_MS,
    )
    if (dictResponse.ok) pronunciation = parseBingPronunciation(await dictResponse.text(), accent)
  } catch {
    // 忽略音标失败
  }

  return {
    pronunciation,
    meanings: [{ partOfSpeech: '', translations: [text] }],
  }
}

// ---------------------------------------------------------------------------
// Google Free（免密钥 translate_a/single，国内常不可达，探测不过就跳过）
// ---------------------------------------------------------------------------

export function parseGoogleTranslation(payload: unknown): string {
  const segments = readArray(readArray(payload)[0])
  const text = segments.map((segment) => readText(readArray(segment)[0])).join('').trim()
  if (!text) throw new Error('Google 返回内容为空。')
  return text
}

export async function lookupGoogleFree(word: string, targetLanguage: string, signal?: AbortSignal): Promise<WordResult> {
  const response = await fetchWithTimeout(
    `${GOOGLE_FREE_ENDPOINT}&tl=${encodeURIComponent(googleTargetCode(targetLanguage))}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ q: word }).toString(),
    },
    signal,
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const text = parseGoogleTranslation(await response.json())
  return {
    pronunciation: '',
    meanings: [{ partOfSpeech: '', translations: [text] }],
  }
}

// ---------------------------------------------------------------------------
// 源池：随机选择 + 失败换源 + 兜底
// ---------------------------------------------------------------------------

export interface WordLookupOptions {
  /** 参与轮换的源，四个源平级（探测结果只影响随机优先级）。 */
  sources: WordSourceId[]
  targetLanguage: string
  accent: 'us' | 'uk'
  probe?: WordProbeState | null
}

export async function fetchWordResult(source: WordSourceId, word: string, options: WordLookupOptions, signal?: AbortSignal): Promise<WordResult> {
  switch (source) {
    case 'youdao':
      return lookupYoudao(word, options.accent, signal)
    case 'bing':
      return lookupBing(word, options.targetLanguage, options.accent, signal)
    case 'google':
      return lookupGoogleFree(word, options.targetLanguage, signal)
    case 'freedictionaryapi':
      return lookupDictionary(word, signal)
  }
}

/**
 * 出源顺序：探测可用的随机优先，未检测的其次，探测失败的再次。
 * 四个源平级，组内随机；兜底语义由调用方（translate.ts 回落翻译方案）承担。
 */
export function selectSourceOrder(enabled: readonly WordSourceId[], probe: WordProbeState | null): WordSourceId[] {
  const byState = (state: boolean) => shuffle(enabled.filter((source) => probe?.results[source] === state))
  const unknown = shuffle(enabled.filter((source) => probe?.results[source] === undefined))
  return [...byState(true), ...unknown, ...byState(false)]
}

export async function lookupWord(word: string, options: WordLookupOptions, signal?: AbortSignal): Promise<WordResult> {
  const order = selectSourceOrder(options.sources, options.probe ?? null)
  if (!order.length) throw new Error('未启用任何单词翻译源')
  let lastError: unknown = null
  for (const source of order) {
    try {
      return await fetchWordResult(source, word, options, signal)
    } catch (error) {
      // 只有外层取消才向上抛；单源超时/失败换下一个。
      if (signal?.aborted) throw error
      lastError = error
    }
  }
  const message = lastError instanceof Error ? lastError.message : '未知错误'
  throw new Error(`单词翻译失败：${message}`)
}

// ---------------------------------------------------------------------------
// 连通性探测
// ---------------------------------------------------------------------------

const PROBE_WORD = 'hello'
const PROBE_TIMEOUT_MS = 4000

/** 四个源并行探测；单个源失败记 false，不影响其他源。永不 reject。成功源附上探测耗时。 */
export async function probeWordSources(): Promise<WordProbeState> {
  const entries = await Promise.all(WORD_SOURCE_IDS.map(async (source): Promise<[WordSourceId, boolean, number | undefined]> => {
    const startedAt = performance.now()
    try {
      await fetchWordResult(source, PROBE_WORD, { sources: [...WORD_SOURCE_IDS], targetLanguage: '简体中文', accent: 'us' }, AbortSignal.timeout(PROBE_TIMEOUT_MS))
      return [source, true, Math.round(performance.now() - startedAt)]
    } catch {
      return [source, false, undefined]
    }
  }))
  const results: Partial<Record<WordSourceId, boolean>> = {}
  const latency: Partial<Record<WordSourceId, number>> = {}
  for (const [source, ok, ms] of entries) {
    results[source] = ok
    if (ok) latency[source] = ms ?? 0
  }
  return { checkedAt: Date.now(), results, latency }
}

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = result[i] as T
    const b = result[j] as T
    result[i] = b
    result[j] = a
  }
  return result
}
