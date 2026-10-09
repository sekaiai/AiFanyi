import { bingTargetCode, requestBingTranslate } from './word-sources'

export async function translateWithBing(text: string, targetLanguage: string, signal?: AbortSignal): Promise<string> {
  return requestBingTranslate(text, 'auto-detect', bingTargetCode(targetLanguage), signal)
}
