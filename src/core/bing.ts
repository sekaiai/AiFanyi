import { BING_TARGET_CODES, requestBingTranslate } from './word-sources'

function bingTargetCode(targetLanguage: string): string {
  const code = BING_TARGET_CODES[targetLanguage]
  if (!code) throw new Error(`必应翻译不支持目标语言「${targetLanguage}」，请换用其他翻译方案`)
  return code
}

export async function translateWithBing(text: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  return requestBingTranslate(text, 'auto-detect', bingTargetCode(targetLanguage), signal)
}