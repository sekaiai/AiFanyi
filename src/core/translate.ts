import { requestAiTranslation } from './ai'
import { requestBaiduTranslation } from './baidu'
import { translateWithBaiduWeb } from './baidu-web'
import { translateWithBing } from './bing'
import { createCooldownTracker, withoutCoolingDown } from './cooldown'
import { requestJson } from './request'
import { requestVolcengineTranslation } from './volcengine'
import { readArray, readRecord, readText } from './read'
import { translateWithTencent } from './tencent'
import { extractSingleWord, normalizeSourceText } from './text'
import { translateWithYoudao } from './youdao'
import { GOOGLE_TARGET_CODES, lookupWord, shuffle, WORD_SOURCE_IDS, type WordProbeState, type WordResult } from './word-sources'
import type {
  AiSchemeSettings,
  DeeplSchemeSettings,
  GoogleCloudSchemeSettings,
  SchemeOrder,
  SchemeSettings,
  TranslationSettings,
} from './types'

const SCHEME_TIMEOUT_MS = 15000
// 方案失败冷却：请求失败的方案 10 分钟内跳过（候选不足 2 个或全部冷却时回退原逻辑）。
const schemeCooldown = createCooldownTracker()
const DEEPL_FREE_ENDPOINT = 'https://api-free.deepl.com/v2/translate'
const DEEPL_PRO_ENDPOINT = 'https://api.deepl.com/v2/translate'
const GOOGLE_FREE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t'
const GOOGLE_CLOUD_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2'

// DeepL 保守收录确定支持的语言；不确定的（tr/th/vi/id/ms/hi）不收录，
// 选中后显式报错由方案链顺延到下一方案，避免发出必然失败的请求。
// google 码共用 word-sources.ts 的权威表，这里只维护 DeepL 一列。
const DEEPL_TARGET_CODES: Record<string, string> = {
  '简体中文': 'ZH',
  '繁體中文': 'ZH',
  'English': 'EN',
  '日本語': 'JA',
  '한국어': 'KO',
  'Français': 'FR',
  'Deutsch': 'DE',
  'Español': 'ES',
  'Português': 'PT',
  'Italiano': 'IT',
  'Русский': 'RU',
  'Nederlands': 'NL',
  'Polski': 'PL',
  'العربية': 'AR',
  'Ελληνικά': 'EL',
  'Svenska': 'SV',
  'Dansk': 'DA',
  'Suomi': 'FI',
  'Norsk': 'NB',
  'Čeština': 'CS',
  'Magyar': 'HU',
  'Română': 'RO',
  'Українська': 'UK',
}

function deeplTargetCode(targetLanguage: string): string {
  const code = DEEPL_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`DeepL 不支持目标语言「${targetLanguage}」，请换用其他翻译方案`)
  return code
}

function googleTargetCode(targetLanguage: string): string {
  const code = GOOGLE_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`Google 翻译不支持目标语言「${targetLanguage}」`)
  return code
}

export type TranslateOutcome =
  | { kind: 'dictionary'; result: WordResult }
  | { kind: 'text'; text: string }

interface WordLookupContext {
  probe?: WordProbeState | null
}

interface UsageSink {
  onSentence?: (schemeId: string, chars: number) => void
  onWord?: (chars: number) => void
}

/** 清空方案失败冷却记录（重置 / 测试用）。 */
export function resetSchemeCooldown(): void {
  schemeCooldown.reset()
}

/**
 * 按用户选择的顺序重排方案链。
 * random：Fisher-Yates 洗牌后仍依次尝试（等价「随机抽取一个，失败后从剩余中随机再抽」）。
 * sequential：保持列表原序。不足 2 个方案时无需重排。
 */
export function orderSchemes(schemes: SchemeSettings[], order: SchemeOrder, random: () => number = Math.random): SchemeSettings[] {
  if (order !== 'random' || schemes.length < 2) return schemes
  return shuffle(schemes, random)
}

export function hasRequiredConfig(scheme: SchemeSettings): boolean {
  return describeMissingConfig(scheme) === null
}

/** 返回方案缺失的必填项提示；配置齐全时返回 null。 */
export function describeMissingConfig(scheme: SchemeSettings): string | null {
  switch (scheme.type) {
    case 'deepl':
      return scheme.authKey.trim() ? null : '请填写 Auth Key'
    case 'google':
      return null
    case 'googleCloud':
      return scheme.apiKey.trim() ? null : '请填写 API Key'
    case 'baidu':
      return scheme.appId.trim() && scheme.secretKey.trim() ? null : '请填写 AppID 与密钥'
    case 'baiduAi':
      return scheme.appId.trim() && scheme.secretKey.trim() ? null : '请填写 AppID 与密钥'
    case 'baiduWeb':
      return null
    case 'bing':
      return null
    case 'tencent':
      return null
    case 'youdao':
      return null
    case 'volcengine':
      return scheme.accessKeyId.trim() && scheme.secretAccessKey.trim() && scheme.region.trim()
        ? null
        : '请填写 Access Key ID、Secret Access Key 与地域'
    case 'ai':
      return scheme.apiUrl.trim() && scheme.apiKey.trim() && scheme.model.trim()
        ? null
        : '请填写 AI 地址、模型与 API 密钥'
  }
}

/** 各方案测试连通性时使用的固定探针文本。 */
export const SCHEME_TEST_PHRASE = 'AiFanyi connection test.'

/**
 * 方案级调用：翻译链与手动测试的唯一共用入口。
 * 冷却在此绑定——成功清除、失败（非 abort）进入冷却，调用方无需各自记录。
 */
export async function translateWithScheme(
  scheme: SchemeSettings,
  text: string,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<TranslateOutcome> {
  try {
    const outcome = await dispatchScheme(scheme, text, targetLanguage, signal)
    schemeCooldown.succeed(scheme.id)
    return outcome
  } catch (error) {
    if (!isAbortError(error)) schemeCooldown.fail(scheme.id)
    throw error
  }
}

async function dispatchScheme(
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
    case 'baiduAi':
      return { kind: 'text', text: await requestBaiduTranslation(source, scheme, targetLanguage, signal) }
    case 'baiduWeb':
      return { kind: 'text', text: await translateWithBaiduWeb(source, targetLanguage, signal) }
    case 'bing':
      return { kind: 'text', text: await translateWithBing(source, targetLanguage, signal) }
    case 'tencent':
      return { kind: 'text', text: await translateWithTencent(source, targetLanguage, signal) }
    case 'youdao':
      return { kind: 'text', text: await translateWithYoudao(source, targetLanguage, signal) }
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
  wordContext?: WordLookupContext,
  usage?: UsageSink,
): Promise<TranslateOutcome> {
  // 单词源池：划选单个单词时按已启用的免费源轮换（四源平级），不消耗「翻译方案」额度；
  // 全部源都失败（或一个都没启用）时回落方案链。
  const singleWord = extractSingleWord(text)
  let poolTried = false
  let poolError: unknown = null
  if (singleWord) {
    poolTried = true
    const enabledSources = [...WORD_SOURCE_IDS].filter((source) => settings.word.sources[source] !== false)
    try {
      const result = await lookupWord(singleWord, {
        sources: enabledSources,
        targetLanguage: settings.targetLanguage,
        accent: settings.word.accent,
        probe: wordContext?.probe ?? null,
      }, signal)
      usage?.onWord?.(singleWord.length)
      return { kind: 'dictionary', result }
    } catch (error) {
      if (isAbortError(error)) throw error
      poolError = error
    }
  }

  const ordered = orderSchemes(settings.schemes.filter((scheme) => scheme.enabled && hasRequiredConfig(scheme)), settings.schemeOrder)
  const schemes = withoutCoolingDown(ordered, (scheme) => scheme.id, schemeCooldown)
  const sourceChars = normalizeSourceText(text).length
  let schemeError: unknown = null
  let schemeTried = false
  for (const scheme of schemes) {
    schemeTried = true
    try {
      const outcome = await translateWithScheme(scheme, text, settings.targetLanguage, signal)
      usage?.onSentence?.(scheme.id, sourceChars)
      return outcome
    } catch (error) {
      if (isAbortError(error)) throw error
      schemeError = error
    }
  }

  if (schemeTried) throw schemeError ?? new Error('翻译失败')
  if (poolTried) throw poolError ?? new Error('单词翻译失败')
  throw new Error('请先在设置中添加翻译方案')
}

async function translateWithDeepl(
  scheme: DeeplSchemeSettings,
  source: string,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<string> {
  const payload = await requestJson(
    scheme.endpoint === 'pro' ? DEEPL_PRO_ENDPOINT : DEEPL_FREE_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `DeepL-Auth-Key ${scheme.authKey}`,
      },
      body: JSON.stringify({ text: [source], target_lang: deeplTargetCode(targetLanguage) }),
    },
    SCHEME_TIMEOUT_MS,
    signal,
  )
  const translations = readArray(readRecord(payload).translations)
  const text = readText(readRecord(translations[0]).text)
  if (!text) throw new Error('DeepL 返回内容为空。')
  return text
}

async function translateWithGoogle(source: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  const payload = await requestJson(`${GOOGLE_FREE_ENDPOINT}&tl=${encodeURIComponent(googleTargetCode(targetLanguage))}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q: source }).toString(),
  }, SCHEME_TIMEOUT_MS, signal)
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
  const payload = await requestJson(
    `${GOOGLE_CLOUD_ENDPOINT}?key=${encodeURIComponent(scheme.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: source, target: googleTargetCode(targetLanguage), format: 'text' }),
    },
    SCHEME_TIMEOUT_MS,
    signal,
  )
  const translations = readArray(readRecord(readRecord(payload).data).translations)
  const text = readText(readRecord(translations[0]).translatedText)
  if (!text) throw new Error('Google Cloud 返回内容为空。')
  return text
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
