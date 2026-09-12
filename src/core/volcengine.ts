import type { VolcengineSchemeSettings } from './types'

export const VOLCENGINE_TRANSLATE_ENDPOINT = 'https://translate.volcengineapi.com'
export const VOLCENGINE_TRANSLATE_ACTION = 'TranslateText'
export const VOLCENGINE_TRANSLATE_VERSION = '2020-06-01'
export const VOLCENGINE_TRANSLATE_SERVICE = 'translate'
export const VOLCENGINE_DEFAULT_REGION = 'cn-north-1'

const VOLCENGINE_TIMEOUT_MS = 15000
const SIGNED_HEADERS = 'host;x-content-sha256;x-date'

const TARGET_CODES: Record<string, string> = {
  '简体中文': 'zh',
  '繁體中文': 'zh',
  English: 'en',
  日本語: 'ja',
  한국어: 'ko',
  Français: 'fr',
  Deutsch: 'de',
  Español: 'es',
  Русский: 'ru',
}

export function volcengineTargetCode(targetLanguage: string): string {
  return TARGET_CODES[targetLanguage] ?? 'zh'
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return bytesToHex(new Uint8Array(digest))
}

export async function hmacSha256(value: string | Uint8Array, key: string | Uint8Array): Promise<Uint8Array> {
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
  const xDate = formatVolcengineDate(now)
  const shortDate = xDate.slice(0, 8)
  const bodyHash = await sha256Hex(body)
  const canonicalQuery = `Action=${VOLCENGINE_TRANSLATE_ACTION}&Version=${VOLCENGINE_TRANSLATE_VERSION}`
  const canonicalHeaders = `host:${host}\n` + `x-content-sha256:${bodyHash}\n` + `x-date:${xDate}\n`
  const canonicalRequest = `POST\n/\n${canonicalQuery}\n${canonicalHeaders}\n${SIGNED_HEADERS}\n${bodyHash}`
  const serviceRegion = region.trim() || VOLCENGINE_DEFAULT_REGION
  const scope = `${shortDate}/${serviceRegion}/${VOLCENGINE_TRANSLATE_SERVICE}/request`
  const stringToSign = `HMAC-SHA256\n${xDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`
  const kDate = await hmacSha256(shortDate, secretAccessKey)
  const kRegion = await hmacSha256(serviceRegion, kDate)
  const kService = await hmacSha256(VOLCENGINE_TRANSLATE_SERVICE, kRegion)
  const kSigning = await hmacSha256('request', kService)
  const signature = bytesToHex(await hmacSha256(stringToSign, kSigning))
  const authorization = `HMAC-SHA256 Credential=${accessKeyId.trim()}/${scope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`
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
        'Content-Type': 'application/json',
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
      const code = readString(upstreamError.Code) || readString(upstreamError.code) || '请求失败'
      const message = readString(upstreamError.Message) || readString(upstreamError.message) || '请求失败'
      throw new Error(`火山引擎 ${code}：${message}`)
    }
    const resultRecord = readRecord(record.Result)
    const rawTranslations = record.TranslationList ?? resultRecord.TranslationList
    const translations = Array.isArray(rawTranslations) ? rawTranslations : []
    const result = translations
      .map((item) => readString(readRecord(item).Translation))
      .filter(Boolean)
      .join('\n')
      .trim()
    if (!result) throw new Error('火山引擎返回内容为空。')
    return result
  } finally {
    clearTimeout(timeoutId)
  }
}

export function formatVolcengineDate(value: Date): string {
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

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
