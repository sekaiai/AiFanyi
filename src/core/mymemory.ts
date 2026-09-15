import { readRecord, readText } from './read'
import { fetchWithTimeout } from './request'
import { GOOGLE_TARGET_CODES } from './word-sources'

const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get'
const MYMEMORY_TIMEOUT_MS = 10000
// MyMemory 官方限制单次查询最多 500 字节（UTF-8 计），超限本地直接报错由方案链顺延。
const MYMEMORY_MAX_BYTES = 500

// MyMemory 接受 RFC3066 语言码，与 Google 目标码一致；源语言用 Autodetect 自动检测。
function myMemoryTargetCode(targetLanguage: string): string {
  const code = GOOGLE_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`MyMemory 不支持目标语言「${targetLanguage}」，请换用其他翻译方案`)
  return code
}

// responseStatus 在错误时可能是数字或数字字符串（HTTP 层仍为 200），统一读成数字。
function readResponseStatus(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return null
}

export function parseMyMemoryTranslation(payload: unknown): string {
  const record = readRecord(payload)
  const status = readResponseStatus(record.responseStatus)
  if (status !== null && status !== 200) {
    const details = readText(record.responseDetails)
    throw new Error(details ? `MyMemory 错误 ${status}：${details}` : `MyMemory 错误 ${status}`)
  }
  const text = readText(readRecord(record.responseData).translatedText)
  if (!text) throw new Error('MyMemory 返回内容为空。')
  if (text.includes('MYMEMORY WARNING')) throw new Error('MyMemory 免费额度已用完，请明日再试或换用其他翻译方案')
  return text
}

export async function translateWithMyMemory(text: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  const to = myMemoryTargetCode(targetLanguage)
  // 中英混排按 UTF-8 字节计：中文单字占 3 字节，长句很快触顶。
  if (new TextEncoder().encode(text).byteLength > MYMEMORY_MAX_BYTES) {
    throw new Error('MyMemory 单次查询最多 500 字节，请缩短文本或换用其他翻译方案')
  }
  const query = new URLSearchParams({ q: text, langpair: `Autodetect|${to}` })
  const response = await fetchWithTimeout(`${MYMEMORY_ENDPOINT}?${query.toString()}`, {}, MYMEMORY_TIMEOUT_MS, signal)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseMyMemoryTranslation(await response.json())
}
