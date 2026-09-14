import { translate } from './i18n'
import type { UiLocale } from './types'

export const USAGE_STORAGE_KEY = 'aifanyi.usage.v1'

interface UsageCounter {
  month: number
  monthChars: number
  total: number
  totalChars: number
}

export interface UsageStats {
  month: string
  sentence: Record<string, UsageCounter>
  word: UsageCounter
}

export function currentMonthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function emptyUsage(now: Date = new Date()): UsageStats {
  return { month: currentMonthKey(now), sentence: {}, word: emptyCounter() }
}

export function normalizeUsage(value: unknown, now: Date = new Date()): UsageStats {
  const raw = isRecord(value) ? value : {}
  const storedMonth = typeof raw.month === 'string' && /^\d{4}-\d{2}$/.test(raw.month) ? raw.month : ''
  const rolled = storedMonth !== currentMonthKey(now)
  const sentence: Record<string, UsageCounter> = {}
  if (isRecord(raw.sentence)) {
    for (const [key, item] of Object.entries(raw.sentence)) {
      if (!key) continue
      sentence[key] = readCounter(item, rolled)
    }
  }
  return { month: currentMonthKey(now), sentence, word: readCounter(raw.word, rolled) }
}

export function recordSentence(stats: UsageStats, schemeId: string, chars: number, now: Date = new Date()): UsageStats {
  const base = rollTo(stats, now)
  const key = schemeId.trim() || 'unknown'
  return { ...base, sentence: { ...base.sentence, [key]: bump(base.sentence[key], chars) } }
}

export function recordWord(stats: UsageStats, chars: number, now: Date = new Date()): UsageStats {
  const base = rollTo(stats, now)
  return { ...base, word: bump(base.word, chars) }
}

export function formatUsageCounter(counter?: UsageCounter, locale: UiLocale = 'zh'): string {
  const value = counter ?? emptyCounter()
  return translate(locale, 'usage.counter', {
    month: formatCount(value.month),
    monthChars: formatChars(value.monthChars, locale),
    total: formatCount(value.total),
    totalChars: formatChars(value.totalChars, locale),
  })
}

function emptyCounter(): UsageCounter {
  return { month: 0, monthChars: 0, total: 0, totalChars: 0 }
}

function readCounter(value: unknown, rolled: boolean): UsageCounter {
  const raw = isRecord(value) ? value : {}
  const total = readCount(raw.total)
  const totalChars = readCount(raw.totalChars)
  if (rolled) return { month: 0, monthChars: 0, total, totalChars }
  return { month: readCount(raw.month), monthChars: readCount(raw.monthChars), total, totalChars }
}

function rollTo(stats: UsageStats, now: Date): UsageStats {
  const month = currentMonthKey(now)
  if (stats.month === month) return stats
  const sentence = Object.fromEntries(
    Object.entries(stats.sentence).map(([key, counter]) => [key, { month: 0, monthChars: 0, total: counter.total, totalChars: counter.totalChars }]),
  )
  return { month, sentence, word: { month: 0, monthChars: 0, total: stats.word.total, totalChars: stats.word.totalChars } }
}

function bump(counter: UsageCounter | undefined, chars: number): UsageCounter {
  const base = counter ?? emptyCounter()
  const delta = readCount(chars)
  return {
    month: base.month + 1,
    monthChars: base.monthChars + delta,
    total: base.total + 1,
    totalChars: base.totalChars + delta,
  }
}

function readCount(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return 0
  return Math.floor(number)
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

function formatChars(value: number, locale: UiLocale): string {
  if (locale === 'en' && value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, '')}万`
  return formatCount(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
