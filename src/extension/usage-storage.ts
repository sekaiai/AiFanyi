import { browser } from 'wxt/browser'
import { USAGE_STORAGE_KEY, normalizeUsage, recordSentence, recordWord, type UsageStats } from '../core/usage'

/**
 * 用量统计的浏览器存储层：独立于设置存储，写入经 promise 链串行化，
 * 避免并发读改写丢失更新；单次读写失败静默吞掉，不影响翻译主流程。
 */
export function createUsageStorage() {
  let chain: Promise<unknown> = Promise.resolve()

  function enqueue(task: () => Promise<void>): void {
    chain = chain.then(task, task)
    chain.catch(() => undefined)
  }

  async function readCurrent(): Promise<UsageStats> {
    const record = await browser.storage.local.get(USAGE_STORAGE_KEY)
    return normalizeUsage(record[USAGE_STORAGE_KEY])
  }

  async function load(): Promise<UsageStats> {
    try {
      return await readCurrent()
    } catch {
      return normalizeUsage(null)
    }
  }

  function recordSentenceUsage(schemeId: string, chars: number): void {
    enqueue(async () => {
      const stats = await readCurrent()
      await browser.storage.local.set({ [USAGE_STORAGE_KEY]: recordSentence(stats, schemeId, chars) })
    })
  }

  function recordWordUsage(chars: number): void {
    enqueue(async () => {
      const stats = await readCurrent()
      await browser.storage.local.set({ [USAGE_STORAGE_KEY]: recordWord(stats, chars) })
    })
  }

  function watch(callback: (usage: UsageStats) => void): () => void {
    const listener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, areaName: string) => {
      if (areaName !== 'local' || !changes[USAGE_STORAGE_KEY]) return
      callback(normalizeUsage(changes[USAGE_STORAGE_KEY].newValue))
    }
    browser.storage.onChanged.addListener(listener)
    return () => browser.storage.onChanged.removeListener(listener)
  }

  return { load, recordSentence: recordSentenceUsage, recordWord: recordWordUsage, watch }
}
