import { readRecord, readText } from './read'
import type { VolcengineSchemeSettings } from './types'

const VOLCENGINE_TRANSLATE_ENDPOINT = 'https://translate.volcengineapi.com'
const VOLCENGINE_TRANSLATE_ACTION = 'TranslateText'
const VOLCENGINE_TRANSLATE_VERSION = '2020-06-01'
const VOLCENGINE_TRANSLATE_SERVICE = 'translate'
const VOLCENGINE_DEFAULT_REGION = 'cn-north-1'

const VOLCENGINE_TIMEOUT_MS = 15000

// 该值同时参与签名与实发请求头，必须逐字节一致；改动需同步 CanonicalHeaders。
const VOLCENGINE_CONTENT_TYPE = 'application/json'
// 火山引擎要求：请求中存在 Content-Type 头域时，CanonicalHeaders 必须包含它。
// 顺序需按字典序（content-type < host < x-content-sha256 < x-date）。
const SIGNED_HEADERS = 'content-type;host;x-content-sha256;x-date'

const TARGET_CODES: Record<string, string> = {
  '简体中文': 'zh',
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
  'العربية': 'ar',
  'ไทย': 'th',
  'Tiếng Việt': 'vi',
  'Bahasa Indonesia': 'id',
}

export function volcengineTargetCode(targetLanguage: string): string {
  const code = TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`火山引擎不支持目标语言「${targetLanguage}」，请换用其他翻译方案`)
  return code
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return bytesToHex(new Uint8Array(digest))
}

async function hmacSha256(value: string | Uint8Array, key: string | Uint8Array): Promise<Uint8Array> {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key
  const dataBytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBytes as unknown as BufferSource)
  return new Uint8Array(signature)
}

export async function createVolcengineAuthorization(
  body: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  host = new URL(VOLCENGINE_TRANSLATE_ENDPOINT).host,
  now = new Date(),
): Promise<{ authorization: string; xDate: string; bodyHash: string }> {
  // 凭证统一规范化：控制台复制 AK/SK 常带尾随空格或换行，带空白会让签名静默算错
  // （AK 被 trim 后服务端能识别账号并进入验签，最终报 SignatureDoesNotMatch）。
  const accessKey = accessKeyId.trim()
  const secretKey = secretAccessKey.trim()
  const serviceRegion = region.trim() || VOLCENGINE_DEFAULT_REGION
  const xDate = formatVolcengineDate(now)
  const shortDate = xDate.slice(0, 8)
  const bodyHash = await sha256Hex(body)
  const canonicalQuery = `Action=${VOLCENGINE_TRANSLATE_ACTION}&Version=${VOLCENGINE_TRANSLATE_VERSION}`
  const canonicalHeaders = `content-type:${VOLCENGINE_CONTENT_TYPE}\n`
    + `host:${host}\n`
    + `x-content-sha256:${bodyHash}\n`
    + `x-date:${xDate}\n`
  const canonicalRequest = `POST\n/\n${canonicalQuery}\n${canonicalHeaders}\n${SIGNED_HEADERS}\n${bodyHash}`
  const scope = `${shortDate}/${serviceRegion}/${VOLCENGINE_TRANSLATE_SERVICE}/request`
  const stringToSign = `HMAC-SHA256\n${xDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`
  const kDate = await hmacSha256(shortDate, secretKey)
  const kRegion = await hmacSha256(serviceRegion, kDate)
  const kService = await hmacSha256(VOLCENGINE_TRANSLATE_SERVICE, kRegion)
  const kSigning = await hmacSha256('request', kService)
  const signature = bytesToHex(await hmacSha256(stringToSign, kSigning))
  const authorization = `HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`
  return { authorization, xDate, bodyHash }
}

export async function requestVolcengineTranslation(
  text: string,
  scheme: VolcengineSchemeSettings,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<string> {
  const body = JSON.stringify({ TargetLanguage: volcengineTargetCode(targetLanguage), TextList: [text] })
  const signed = await createVolcengineAuthorization(
    body,
    scheme.accessKeyId,
    scheme.secretAccessKey,
    scheme.region,
  )
  const url = `${VOLCENGINE_TRANSLATE_ENDPOINT}/?Action=${VOLCENGINE_TRANSLATE_ACTION}&Version=${VOLCENGINE_TRANSLATE_VERSION}`
  const timeout = new AbortController()
  const timeoutId = setTimeout(() => timeout.abort(new DOMException('Request timed out', 'TimeoutError')), VOLCENGINE_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': VOLCENGINE_CONTENT_TYPE,
        Authorization: signed.authorization,
        'X-Date': signed.xDate,
        'X-Content-Sha256': signed.bodyHash,
      },
      body,
      signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType && !contentType.includes('application/json')) throw new Error('响应不是 JSON。')
    const payload = await response.json().catch(() => null)
    const record = readRecord(payload)
    const metadata = readRecord(record.ResponseMetadata ?? record.ResponseMetaData)
    const upstreamError = readRecord(metadata.Error ?? record.Error)
    if (Object.keys(upstreamError).length) {
      const code = readText(upstreamError.Code) || readText(upstreamError.code) || '请求失败'
      const message = readText(upstreamError.Message) || readText(upstreamError.message) || '请求失败'
      throw new Error(describeVolcengineError(code, message))
    }
    const resultRecord = readRecord(record.Result)
    const rawTranslations = record.TranslationList ?? resultRecord.TranslationList
    const translations = Array.isArray(rawTranslations) ? rawTranslations : []
    const result = translations
      .map((item) => readText(readRecord(item).Translation))
      .filter(Boolean)
      .join('\n')
      .trim()
    if (!result) throw new Error('火山引擎返回内容为空。')
    return result
  } finally {
    clearTimeout(timeoutId)
  }
}

function formatVolcengineDate(value: Date): string {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  const hours = String(value.getUTCHours()).padStart(2, '0')
  const minutes = String(value.getUTCMinutes()).padStart(2, '0')
  const seconds = String(value.getUTCSeconds()).padStart(2, '0')
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** 火山引擎错误码 → 可执行的排查指引。 */
const VOLCENGINE_ERROR_GUIDES: Record<string, string> = {
  SignatureDoesNotMatch: '签名校验失败。请确认 Secret Access Key 复制完整、首尾没有多余空格或换行，且 AK 与 SK 来自同一密钥对。',
  InvalidClientTokenId: 'Access Key ID 不存在或已失效，请到「访问控制 → 密钥管理」重新生成。',
  InvalidCredential: '凭证无效。请确认该密钥具备机器翻译权限，且账号已开通机器翻译服务。',
  AccessDenied: '权限不足。请为该密钥授予机器翻译接口权限后重试。',
  InvalidTimestamp: '请求时间无效。请校准本机系统时间（与标准时间偏差需在 15 分钟内）。',
  SignatureExpired: '签名已过期。请校准本机系统时间后重试。',
  MissingRequestInfo: '缺少必要请求信息。请确认「地域」填写为 cn-north-1。',
}

/** 仅收录已核实的数字错误码，其余按字符串 Code 匹配。 */
const VOLCENGINE_NUMERIC_CODES: Record<string, string> = {
  '100010': 'SignatureDoesNotMatch',
  '100009': 'InvalidClientTokenId',
  '100025': 'InvalidCredential',
  '100006': 'InvalidTimestamp',
  '100004': 'MissingRequestInfo',
}

function describeVolcengineError(code: string, message: string): string {
  const named = VOLCENGINE_ERROR_GUIDES[code] ? code : VOLCENGINE_NUMERIC_CODES[code]
  const guide = named ? VOLCENGINE_ERROR_GUIDES[named] : ''
  return guide ? `火山引擎 ${code}：${guide}` : `火山引擎 ${code}：${message}`
}
