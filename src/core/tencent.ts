import { readArray, readRecord, readText } from './read'
import { fetchWithTimeout } from './request'

const TENCENT_WEB_PAGE = 'https://fanyi.qq.com/'
const TENCENT_API_ENDPOINT = 'https://fanyi.qq.com/api/translate'
const TENCENT_TIMEOUT_MS = 10000

// 腾讯交互翻译仅收录确定支持的语言子集；其余语言本地抛错，
// 由方案链顺延到下一方案，避免发出必然失败的请求。
const TENCENT_TARGET_CODES: Record<string, string> = {
  '简体中文': 'zh',
  '繁體中文': 'zh-TW',
  'English': 'en',
  '日本語': 'ja',
  '한국어': 'ko',
  'Français': 'fr',
  'Deutsch': 'de',
  'Español': 'es',
  'Italiano': 'it',
  'Русский': 'ru',
  'Português': 'pt',
}

function tencentTargetCode(targetLanguage: string): string {
  const code = TENCENT_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`腾讯交互翻译不支持目标语言「${targetLanguage}」，请换用其他翻译方案`)
  return code
}

export function parseTencentWebPage(html: string): { qtv: string; qtk: string } {
  const qtv = /var qtv = "([^"]+)"/.exec(html)?.[1]
  const qtk = /var qtk = "([^"]+)"/.exec(html)?.[1]
  if (!qtv || !qtk) throw new Error('腾讯翻译参数获取失败')
  return { qtv, qtk }
}

export function parseTencentTranslation(payload: unknown): string {
  const translate = readRecord(readRecord(payload).translate)
  const records = readArray(translate.records).map(readRecord)
  const text = records.map((record) => readText(record.machineTranslation)).join('')
  if (!text) throw new Error('腾讯翻译返回内容为空。')
  return text
}

export async function translateWithTencent(text: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  const target = tencentTargetCode(targetLanguage)
  const page = await fetchWithTimeout(
    TENCENT_WEB_PAGE,
    { headers: { Accept: 'text/html' }, credentials: 'include' },
    TENCENT_TIMEOUT_MS,
    signal,
  )
  if (!page.ok) throw new Error(`HTTP ${page.status}`)
  const { qtv, qtk } = parseTencentWebPage(await page.text())

  const response = await fetchWithTimeout(
    TENCENT_API_ENDPOINT,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'auto',
        target,
        sourceText: text,
        qtv,
        qtk,
        sessionUuid: `translate_uuid${Date.now()}`,
      }),
    },
    TENCENT_TIMEOUT_MS,
    signal,
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseTencentTranslation(await response.json())
}
