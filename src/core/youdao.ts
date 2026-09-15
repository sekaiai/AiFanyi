import { md5Hex } from './md5'
import { readArray, readRecord, readText } from './read'
import { fetchWithTimeout } from './request'

const YOUDAO_ENDPOINT = 'https://fanyi.youdao.com/translate_o?client=fanyideskweb&keyfrom=fanyi.web'
const YOUDAO_TIMEOUT_MS = 10000
// 网页版固定签名盐与浏览器指纹，多年未变；若失效错误码 50 会被冷却兜底吸收。
const YOUDAO_SIGN_SECRET = 'Ygy_4c=r#e#4F^2a2)2'
const YOUDAO_BV = md5Hex('5.0 (Windows)')

// 有道网页翻译仅收录确定支持的语言子集；其余语言本地抛错，
// 由方案链顺延到下一方案，避免发出必然失败的请求。
const YOUDAO_TARGET_CODES: Record<string, string> = {
  '简体中文': 'zh-CHS',
  '繁體中文': 'zh-CHT',
  'English': 'en',
  '日本語': 'ja',
  '한국어': 'ko',
  'Français': 'fr',
  'Español': 'es',
  'Deutsch': 'de',
  'Русский': 'ru',
  'Português': 'pt',
}

function youdaoTargetCode(targetLanguage: string): string {
  const code = YOUDAO_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`有道翻译不支持目标语言「${targetLanguage}」，请换用其他翻译方案`)
  return code
}

export function createYoudaoSign(text: string, salt: string): string {
  return md5Hex(`fanyideskweb${text}${salt}${YOUDAO_SIGN_SECRET}`)
}

export function parseYoudaoTranslation(payload: unknown): string {
  const raw = readRecord(payload).errorCode
  const errorCode = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 0
  if (errorCode !== 0) throw new Error(`有道翻译错误 ${errorCode}`)
  const outer = readArray(readRecord(payload).translateResult)
  const inner = readArray(outer[0])
  const text = readText(readRecord(inner[0]).tgt)
  if (!text) throw new Error('有道翻译返回内容为空。')
  return text
}

export async function translateWithYoudao(text: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  const to = youdaoTargetCode(targetLanguage)
  const ts = Date.now()
  const salt = `${ts}${Math.floor(Math.random() * 10)}`
  const body = new URLSearchParams({
    i: text,
    from: 'auto',
    to,
    salt,
    sign: createYoudaoSign(text, salt),
    ts: String(ts),
    mysticTime: String(ts),
    client: 'fanyideskweb',
    keyfrom: 'fanyi.web',
    smartresult: 'dict',
    version: '5.0',
    bv: YOUDAO_BV,
    action: 'FY_BY_REALTlME',
  })
  const response = await fetchWithTimeout(
    YOUDAO_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    YOUDAO_TIMEOUT_MS,
    signal,
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseYoudaoTranslation(await response.json())
}
