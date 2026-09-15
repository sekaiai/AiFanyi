import { readArray, readRecord, readText } from './read'
import { fetchWithTimeout } from './request'

const CAIYUN_ENDPOINT = 'https://api.interpreter.caiyunai.com/v1/translator'
const CAIYUN_TIMEOUT_MS = 10000
// 彩云小译网页版公开令牌，随页面脚本下发；若失效由方案失败冷却兜底吸收。
const CAIYUN_AUTHORIZATION = '3975l6lr5pcbvidl6jl2'

// 彩云小译公开接口固定 auto2zh 通道，仅支持译为简体中文；其余语言本地抛错，
// 由方案链顺延到下一方案，避免发出必然失败的请求。
const CAIYUN_TARGET_CODES: Record<string, string> = {
  '简体中文': 'zh',
}

function caiyunTargetCode(targetLanguage: string): string {
  const code = CAIYUN_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`彩云小译仅支持译为简体中文，不支持目标语言「${targetLanguage}」`)
  return code
}

export function parseCaiyunTranslation(payload: unknown): string {
  const target = readArray(readRecord(payload).target)
  const text = readText(target[0])
  if (!text) throw new Error('彩云小译返回内容为空。')
  return text
}

export async function translateWithCaiyun(text: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  caiyunTargetCode(targetLanguage)
  const response = await fetchWithTimeout(
    CAIYUN_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Authorization': CAIYUN_AUTHORIZATION },
      body: JSON.stringify({ source: [text], trans_type: 'auto2zh', request_id: 'aifanyi', detect: true }),
    },
    CAIYUN_TIMEOUT_MS,
    signal,
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseCaiyunTranslation(await response.json())
}
