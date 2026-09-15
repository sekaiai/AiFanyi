import { readArray, readRecord, readText } from './read'
import { fetchWithTimeout } from './request'

const REVERSO_API_URL = 'https://api.reverso.net/translate/v1/translation'
const REVERSO_TIMEOUT_MS = 10000

// Reverso 使用自有三字码（荷兰语是 dut 而非 nld），仅支持 15 种目标语言；繁體中文不在其中。
const REVERSO_TARGET_CODES: Record<string, string> = {
  '简体中文': 'chi',
  'English': 'eng',
  '日本語': 'jpn',
  'Français': 'fra',
  'Deutsch': 'ger',
  'Español': 'spa',
  'Português': 'por',
  'Italiano': 'ita',
  'Русский': 'rus',
  'Nederlands': 'dut',
  'Polski': 'pol',
  'Türkçe': 'tur',
  'العربية': 'ara',
  'Română': 'rum',
  'Українська': 'ukr',
}

// 接口不接受 auto 源语言，且服务端对非拉丁文字的检测纠正不可靠，按文字系统在本地识别。
function reversoSourceCode(text: string): string {
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'jpn'
  if (/[\u4e00-\u9fff]/.test(text)) return 'chi'
  if (/[\u0400-\u04ff]/.test(text)) return 'rus'
  if (/[\u0600-\u06ff]/.test(text)) return 'ara'
  return 'eng'
}

function reversoTargetCode(targetLanguage: string): string {
  if (targetLanguage === '繁體中文') throw new Error('Reverso 翻译不支持目标语言「繁體中文」，请换用其他翻译方案')
  const code = REVERSO_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`Reverso 翻译不支持目标语言「${targetLanguage}」，请换用其他翻译方案`)
  return code
}

export function parseReversoTranslation(payload: unknown): string {
  const text = readArray(readRecord(payload).translation).map((item) => readText(item)).join('')
  if (!text) throw new Error('Reverso 返回内容为空。')
  return text
}

export async function translateWithReverso(text: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  const to = reversoTargetCode(targetLanguage)
  const from = reversoSourceCode(text)
  // 同向请求（如英→英）会被接口直接拒绝，本地按同语传回处理。
  if (from === to) return text
  // reversomobile 来源可避开主站页面的 Cloudflare 校验；languageDetection 留给服务端纠正拉丁文语种的误判。
  const response = await fetchWithTimeout(REVERSO_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 'text',
      from,
      to,
      input: text,
      options: { contextResults: false, languageDetection: true, sentenceSplitter: false, origin: 'reversomobile' },
    }),
  }, REVERSO_TIMEOUT_MS, signal)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseReversoTranslation(await response.json())
}
