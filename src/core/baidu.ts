import { md5Hex } from './md5'
import { readRecord } from './read'
import type { BaiduSchemeSettings } from './types'

export const BAIDU_TRANSLATE_ENDPOINT = 'https://fanyi-api.baidu.com/api/trans/vip/translate'
const BAIDU_TIMEOUT_MS = 15000

const BAIDU_TARGET_CODES: Record<string, string> = {
  '简体中文': 'zh',
  '繁體中文': 'cht',
  'English': 'en',
  '日本語': 'jp',
  '한국어': 'kor',
  'Français': 'fra',
  'Deutsch': 'de',
  'Español': 'spa',
  'Português': 'pt',
  'Italiano': 'it',
  'Русский': 'ru',
  'Nederlands': 'nl',
  'Polski': 'pl',
  'العربية': 'ara',
  'ไทย': 'th',
  'Tiếng Việt': 'vie',
  'Ελληνικά': 'el',
  'Svenska': 'swe',
  'Dansk': 'dan',
  'Suomi': 'fin',
  'Čeština': 'csn',
  'Magyar': 'hu',
  'Română': 'rom',
}

export function baiduTargetCode(targetLanguage: string): string {
  const code = BAIDU_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`百度翻译不支持目标语言「${targetLanguage}」，请换用其他翻译方案`)
  return code
}

export function createBaiduSignature(appId: string, text: string, salt: string, secretKey: string): string {
  return md5Hex(`${appId}${text}${salt}${secretKey}`)
}

export async function requestBaiduTranslation(
  text: string,
  scheme: BaiduSchemeSettings,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<string> {
  const salt = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const body = new URLSearchParams({
    q: text,
    from: 'auto',
    to: baiduTargetCode(targetLanguage),
    appid: scheme.appId.trim(),
    salt,
    sign: createBaiduSignature(scheme.appId.trim(), text, salt, scheme.secretKey.trim()),
  })
  const timeout = new AbortController()
  const timeoutId = setTimeout(() => timeout.abort(new DOMException('Request timed out', 'TimeoutError')), BAIDU_TIMEOUT_MS)
  try {
    const response = await fetch(BAIDU_TRANSLATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType && !contentType.includes('application/json')) throw new Error('响应不是 JSON。')
    const payload = await response.json().catch(() => null)
    const record = readRecord(payload)
    if (typeof record.error_code === 'string' || typeof record.error_code === 'number') {
      const code = String(record.error_code)
      const message = typeof record.error_msg === 'string' ? record.error_msg : '请求失败'
      throw new Error(`百度翻译 ${code}：${message}`)
    }
    const translations = Array.isArray(record.trans_result) ? record.trans_result : []
    const result = translations
      .map((item) => readRecord(item).dst)
      .filter((item): item is string => typeof item === 'string')
      .join('\n')
      .trim()
    if (!result) throw new Error('百度翻译返回内容为空。')
    return result
  } finally {
    clearTimeout(timeoutId)
  }
}
