import { BAIDU_TARGET_CODES } from './baidu'
import { fetchWithTimeout } from './request'

const BAIDU_WEB_PAGE = 'https://fanyi.baidu.com/'
const BAIDU_WEB_ENDPOINT = 'https://fanyi.baidu.com/v2transapi'
const BAIDU_WEB_TIMEOUT_MS = 10000
// 页面未显式注入 gtk 时的通用回退值（历史固定值，网页版签名可用）。
const DEFAULT_GTK = '320305.131321201'

function baiduWebTargetCode(targetLanguage: string): string {
  const code = BAIDU_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`百度网页翻译不支持目标语言「${targetLanguage}」，请换用其他翻译方案`)
  return code
}

/** 从 fanyi.baidu.com 首页 HTML 提取 token 与 gtk；token 缺失视为页面结构变化，直接抛错。 */
export function parseBaiduWebPage(html: string): { token: string; gtk: string } {
  const token = /window\.token\s*=\s*"([^"]+)"/.exec(html)?.[1]
  if (!token) throw new Error('百度网页翻译：未能获取 token，页面结构可能已变化')
  const gtk = /window\.gtk\s*=\s*"([^"]+)"/.exec(html)?.[1] || DEFAULT_GTK
  return { token, gtk }
}

// sign v2 的位移混合步：以 gtk 派生的掩码对 32 位整数做移位/异或迭代。
function mixBits(value: number, mask: string): number {
  for (let i = 0; i < mask.length - 2; i += 3) {
    const flag = mask.charAt(i + 2)
    const offset = flag >= 'a' ? flag.charCodeAt(0) - 87 : Number(flag)
    const shifted = mask.charAt(i + 1) === '+' ? value >>> offset : value << offset
    value = mask.charAt(i) === '+' ? value + shifted : value ^ shifted
  }
  return value
}

/** 百度网页版 v2transapi 的 sign v2：gtk 分段派生种子，对查询文本的 UTF-8 字节加权迭代。 */
export function createBaiduWebSign(query: string, gtk: string): string {
  // 超长查询按首 10 + 中 10 + 尾 10 截断后再参与签名，与网页版行为一致。
  let text = query
  if (text.length > 30) {
    text = text.slice(0, 10) + text.slice(Math.floor(text.length / 2) - 5, Math.floor(text.length / 2) + 5) + text.slice(-10)
  }
  const [head = '', tail = ''] = gtk.split('.')
  const h = Number(head) || 0
  const m = Number(tail) || 0
  const bytes = Array.from(new TextEncoder().encode(text))
  let s = h
  for (const byte of bytes) {
    s = mixBits(s + byte, '+-a^+6')
  }
  s += m
  for (const byte of bytes) {
    s = mixBits(s, '+-3^+b+-f')
  }
  s ^= m
  if (s < 0) s = (2147483647 & s) + 2147483648
  const n = s % 1000000
  return `${n}.${n ^ h}`
}

export async function translateWithBaiduWeb(text: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  const to = baiduWebTargetCode(targetLanguage)
  // 带凭据访问首页：BAIDUID 等 Cookie 是 v2transapi 校验的一部分；MV3 后台请求默认不带 Cookie，必须显式 include。
  const page = await fetchWithTimeout(BAIDU_WEB_PAGE, { credentials: 'include', headers: { Accept: 'text/html' } }, BAIDU_WEB_TIMEOUT_MS, signal)
  if (!page.ok) throw new Error(`HTTP ${page.status}`)
  const { token, gtk } = parseBaiduWebPage(await page.text())

  const body = new URLSearchParams({
    from: 'auto',
    to,
    query: text,
    transtype: 'translang',
    sign: createBaiduWebSign(text, gtk),
    token,
    ts: String(Date.now()),
    domain: 'common',
  })
  const response = await fetchWithTimeout(BAIDU_WEB_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: body.toString(),
  }, BAIDU_WEB_TIMEOUT_MS, signal)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const payload = (await response.json()) as {
    errno?: number
    trans_result?: { data?: Array<{ dst?: string }> }
  }
  if (typeof payload.errno === 'number' && payload.errno !== 0) throw new Error(`百度翻译错误 ${payload.errno}`)
  const result = (payload.trans_result?.data ?? []).map((item) => item.dst ?? '').join('')
  if (!result) throw new Error('百度翻译错误：响应缺少译文')
  return result
}
