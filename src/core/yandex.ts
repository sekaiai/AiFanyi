import { readArray, readRecord, readText } from './read'
import { fetchWithTimeout } from './request'
import { GOOGLE_TARGET_CODES } from './word-sources'

const YANDEX_API_BASE = 'https://browser.translate.yandex.net/api/v1/tr.json'
const YANDEX_SRV = 'browser_video_translation'
const YANDEX_TIMEOUT_MS = 10000

// Yandex 目标码与 Google 基本一致，但不支持繁體中文（接口对 zh-TW 返回 501），本地拦截由方案链顺延。
function yandexTargetCode(targetLanguage: string): string {
  if (targetLanguage === '繁體中文') throw new Error('Yandex 翻译不支持目标语言「繁體中文」，请换用其他翻译方案')
  const code = GOOGLE_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`Yandex 翻译不支持目标语言「${targetLanguage}」，请换用其他翻译方案`)
  return code
}

// code 在错误时可能是数字或数字字符串，统一读成数字再判断。
function readCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return null
}

function requireYandexOk(payload: unknown): Record<string, unknown> {
  const record = readRecord(payload)
  const code = readCode(record.code)
  if (code === null) throw new Error('Yandex 返回异常。')
  if (code !== 200) {
    const message = readText(record.message)
    throw new Error(message ? `Yandex 错误 ${code}：${message}` : `Yandex 错误 ${code}`)
  }
  return record
}

export function parseYandexDetection(payload: unknown): string {
  const lang = readText(requireYandexOk(payload).lang)
  if (!lang) throw new Error('Yandex 未能识别源语言。')
  return lang
}

export function parseYandexTranslation(payload: unknown): string {
  const text = readText(readArray(requireYandexOk(payload).text)[0])
  if (!text) throw new Error('Yandex 返回内容为空。')
  return text
}

async function requestYandex(method: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  // text/lang 放在 POST 表单体里，避免长文本触发 URL 长度限制。
  const response = await fetchWithTimeout(`${YANDEX_API_BASE}/${method}?srv=${YANDEX_SRV}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  }, YANDEX_TIMEOUT_MS, signal)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export async function translateWithYandex(text: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  const to = yandexTargetCode(targetLanguage)
  // Yandex 不接受 auto 源语言（返回 501），必须先 detect 拿到源语言码再翻译。
  const from = parseYandexDetection(await requestYandex('detect', { text }, signal))
  return parseYandexTranslation(await requestYandex('translate', { text, lang: `${from}-${to}` }, signal))
}
