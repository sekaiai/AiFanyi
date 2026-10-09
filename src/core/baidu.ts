import { requestJson } from './request'
import { md5Hex } from './md5'
import { readRecord } from './read'
import type { BaiduAiSchemeSettings, BaiduSchemeSettings } from './types'

const BAIDU_TRANSLATE_ENDPOINT = 'https://fanyi-api.baidu.com/api/trans/vip/translate'
const BAIDU_AI_ENDPOINT = 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate'
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
  scheme: BaiduSchemeSettings | BaiduAiSchemeSettings,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<string> {
  const isAi = scheme.type === 'baiduAi'
  const salt = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const body = new URLSearchParams({
    q: text,
    from: 'auto',
    to: baiduTargetCode(targetLanguage),
    appid: scheme.appId.trim(),
    salt,
    sign: createBaiduSignature(scheme.appId.trim(), text, salt, scheme.secretKey.trim()),
    ...(isAi ? { model_type: scheme.modelType } : {}),
  })
  const payload = await requestJson(
    isAi ? BAIDU_AI_ENDPOINT : BAIDU_TRANSLATE_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    BAIDU_TIMEOUT_MS,
    signal,
  )
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
}
