import { describe, expect, it } from 'vitest'
import {
  USAGE_STORAGE_KEY,
  currentMonthKey,
  emptyUsage,
  formatUsageCounter,
  normalizeUsage,
  recordSentence,
  recordWord,
  type UsageStats,
} from '../../src/core/usage'

// 统一用数字构造本地日期，避免断言受运行环境时区影响
const march2024 = new Date(2024, 2, 15, 10, 30)

describe('month keys', () => {
  it('exposes a stable storage key', () => {
    expect(USAGE_STORAGE_KEY).toBe('aifanyi.usage.v1')
  })

  it('formats the calendar month as YYYY-MM', () => {
    expect(currentMonthKey(march2024)).toBe('2024-03')
    expect(currentMonthKey(new Date(2025, 11, 1))).toBe('2025-12')
  })
})

describe('emptyUsage', () => {
  it('creates zeroed stats pinned to the current month', () => {
    expect(emptyUsage(march2024)).toEqual({
      month: '2024-03',
      sentence: {},
      word: { month: 0, monthChars: 0, total: 0, totalChars: 0 },
    })
  })
})

describe('normalizeUsage', () => {
  it('returns empty stats for missing or malformed input', () => {
    expect(normalizeUsage(null, march2024)).toEqual(emptyUsage(march2024))
    expect(normalizeUsage('nope', march2024)).toEqual(emptyUsage(march2024))
  })

  it('keeps month counters for the same month', () => {
    const stored = {
      month: '2024-03',
      sentence: { 'scheme-1': { month: 3, monthChars: 45, total: 10, totalChars: 200 } },
      word: { month: 2, monthChars: 10, total: 7, totalChars: 35 },
    }
    expect(normalizeUsage(stored, march2024)).toEqual(stored)
  })

  it('zeroes month counters but keeps totals when the stored month differs', () => {
    const stored = {
      month: '2024-02',
      sentence: { 'scheme-1': { month: 3, monthChars: 45, total: 10, totalChars: 200 } },
      word: { month: 2, monthChars: 10, total: 7, totalChars: 35 },
    }
    expect(normalizeUsage(stored, march2024)).toEqual({
      month: '2024-03',
      sentence: { 'scheme-1': { month: 0, monthChars: 0, total: 10, totalChars: 200 } },
      word: { month: 0, monthChars: 0, total: 7, totalChars: 35 },
    })
  })

  it('treats an unparsable month as rolled over and sanitizes counters', () => {
    const stored = {
      month: 'March',
      sentence: { 'scheme-1': { month: -5, monthChars: 1.9, total: '12', totalChars: null } },
      word: { month: Number.NaN, monthChars: 3, total: Number.POSITIVE_INFINITY, totalChars: 9 },
    }
    expect(normalizeUsage(stored, march2024)).toEqual({
      month: '2024-03',
      sentence: { 'scheme-1': { month: 0, monthChars: 0, total: 12, totalChars: 0 } },
      word: { month: 0, monthChars: 0, total: 0, totalChars: 9 },
    })
  })

  it('drops empty scheme keys', () => {
    const stored = {
      month: '2024-03',
      sentence: { '': { month: 1, monthChars: 1, total: 1, totalChars: 1 }, 'scheme-1': { month: 1, monthChars: 2, total: 1, totalChars: 2 } },
      word: { month: 0, monthChars: 0, total: 0, totalChars: 0 },
    }
    expect(Object.keys(normalizeUsage(stored, march2024).sentence)).toEqual(['scheme-1'])
  })
})

describe('recordSentence', () => {
  it('accumulates per scheme id', () => {
    let stats = emptyUsage(march2024)
    stats = recordSentence(stats, 'deepl-1', 30, march2024)
    stats = recordSentence(stats, 'deepl-1', 12, march2024)
    stats = recordSentence(stats, 'google-1', 8, march2024)
    expect(stats.sentence['deepl-1']).toEqual({ month: 2, monthChars: 42, total: 2, totalChars: 42 })
    expect(stats.sentence['google-1']).toEqual({ month: 1, monthChars: 8, total: 1, totalChars: 8 })
  })

  it('falls back to unknown for blank ids and clamps bad char counts', () => {
    const stats = recordSentence(emptyUsage(march2024), '  ', 0, march2024)
    expect(stats.sentence.unknown).toEqual({ month: 1, monthChars: 0, total: 1, totalChars: 0 })
  })

  it('rolls counters over at the month boundary before recording', () => {
    const stale: UsageStats = {
      month: '2024-02',
      sentence: { 'deepl-1': { month: 3, monthChars: 45, total: 10, totalChars: 200 } },
      word: { month: 1, monthChars: 5, total: 2, totalChars: 10 },
    }
    const stats = recordSentence(stale, 'deepl-1', 20, march2024)
    expect(stats.month).toBe('2024-03')
    expect(stats.sentence['deepl-1']).toEqual({ month: 1, monthChars: 20, total: 11, totalChars: 220 })
    expect(stats.word).toEqual({ month: 0, monthChars: 0, total: 2, totalChars: 10 })
  })
})

describe('recordWord', () => {
  it('accumulates word usage', () => {
    let stats = emptyUsage(march2024)
    stats = recordWord(stats, 6, march2024)
    stats = recordWord(stats, 9, march2024)
    expect(stats.word).toEqual({ month: 2, monthChars: 15, total: 2, totalChars: 15 })
  })

  it('rolls counters over at the month boundary before recording', () => {
    const stats = recordWord({ ...emptyUsage(march2024), month: '2024-02' }, 4, march2024)
    expect(stats.month).toBe('2024-03')
    expect(stats.word).toEqual({ month: 1, monthChars: 4, total: 1, totalChars: 4 })
  })
})

describe('formatUsageCounter', () => {
  it('formats zero usage', () => {
    expect(formatUsageCounter()).toBe('月 0 次 · 0 / 共 0 次 · 0')
  })

  it('groups thousands and switches to 万 above ten thousand chars', () => {
    expect(formatUsageCounter({ month: 1234, monthChars: 9999, total: 12345, totalChars: 123456 }))
      .toBe('月 1,234 次 · 9,999 / 共 12,345 次 · 12.3万')
    expect(formatUsageCounter({ month: 0, monthChars: 10000, total: 0, totalChars: 10000 }))
      .toBe('月 0 次 · 1万 / 共 0 次 · 1万')
  })

  it('formats the compact en counter with k-scaled chars', () => {
    expect(formatUsageCounter(undefined, 'en')).toBe('0/0 · 0/0')
    expect(formatUsageCounter({ month: 1234, monthChars: 9999, total: 12345, totalChars: 123456 }, 'en'))
      .toBe('1,234/10k · 12,345/123.5k')
  })
})
