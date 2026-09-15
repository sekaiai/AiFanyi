import { fetchWithTimeout } from './request'
import { BING_TARGET_CODES, BING_TRANSLATE_ENDPOINT, BING_TRANSLATOR_PAGE, parseBingPage, parseBingTranslation } from './word-sources'

const BING_TIMEOUT_MS = 8000

function bingTargetCode(targetLanguage: string): string {
  const code = BING_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`必应翻译不支持目标语言「${targetLanguage}」，请换用其他翻译方案`)
  return code
}

export async function translateWithBing(text: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  const to = bingTargetCode(targetLanguage)
  const page = await fetchWithTimeout(BING_TRANSLATOR_PAGE, { headers: { Accept: 'text/html' } }, BING_TIMEOUT_MS, signal)
  if (!page.ok) throw new Error(`HTTP ${page.status}`)
  const { ig, key, token } = parseBingPage(await page.text())

  const body = new URLSearchParams({
    fromLang: 'auto-detect',
    text,
    to,
    token,
    key,
  })
  const response = await fetchWithTimeout(
    `${BING_TRANSLATE_ENDPOINT}?isVertical=1&&IG=${encodeURIComponent(ig)}&IID=translator.5028`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    BING_TIMEOUT_MS,
    signal,
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return parseBingTranslation(await response.json())
}
