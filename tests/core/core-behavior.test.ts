import { describe, expect, it } from 'vitest'
import { getBubblePlacement, getBubbleSizing } from '../../src/core/bubble'
import { buildPrompt } from '../../src/core/prompt'
import {
  MAX_TRANSLATION_TEXT_LENGTH,
  cloneDefaultSettings,
  isSiteBlocked,
  migrateSettings,
  validateAiEndpoint,
} from '../../src/core/settings'
import { classifySelection, getWordAtOffset, normalizeSourceText } from '../../src/core/text'

describe('text classification', () => {
  it.each([
    ['Hello', 'dictionary', 'Hello'],
    ['hello!', 'dictionary', 'hello'],
    ["don't", 'dictionary', "don't"],
    ['U.S.A.', 'ai', 'U.S.A.'],
    ['two words', 'ai', 'two words'],
    ['   ', 'empty', ''],
  ] as const)('classifies %j as %s', (input, type, text) => {
    expect(classifySelection(input)).toEqual({ type, text })
  })

  it('finds contractions at a text offset and excludes the end boundary', () => {
    expect(getWordAtOffset("A user's guide", 4)?.word).toBe("user's")
    expect(getWordAtOffset('word', 4)).toBeNull()
  })

  it('normalizes and limits submitted content', () => {
    expect(normalizeSourceText(`  hello\n world  `)).toBe('hello world')
    expect(normalizeSourceText('x'.repeat(MAX_TRANSLATION_TEXT_LENGTH + 10))).toHaveLength(MAX_TRANSLATION_TEXT_LENGTH)
  })
})

describe('settings', () => {
  it('migrates partial and invalid values safely', () => {
    const migrated = migrateSettings({ hoverDelayMs: 9999, bubble: { side: 'invalid', gap: -5 } })
    expect(migrated.version).toBe(1)
    expect(migrated.hoverDelayMs).toBe(1000)
    expect(migrated.bubble.side).toBe('top')
    expect(migrated.bubble.gap).toBe(0)
    expect(migrated.ai.apiKey).toBe('')
  })

  it('validates AI URLs without accepting credentials or unsafe schemes', () => {
    expect(validateAiEndpoint('https://api.example.com/v1/chat/completions')).toBe('')
    expect(validateAiEndpoint('javascript:alert(1)')).toContain('http')
    expect(validateAiEndpoint('https://user:secret@example.com')).toContain('不安全')
  })

  it('matches exact, wildcard, and substring blacklist rules', () => {
    expect(isSiteBlocked('https://docs.example.com/page', ['*.example.com'])).toBe(true)
    expect(isSiteBlocked('https://example.com/page', ['example.com'])).toBe(true)
    expect(isSiteBlocked('not a url', ['example.com'])).toBe(false)
  })

  it('builds prompts even when the template has no placeholder', () => {
    expect(buildPrompt('Translate: {text} / {text}', 'Hello')).toBe('Translate: Hello / Hello')
    expect(buildPrompt('Translate this', 'Hello')).toContain('Hello')
  })
})

describe('bubble placement', () => {
  const settings = { side: 'top', align: 'center', gap: 8, offsetX: 0, offsetY: 0, radius: 8 } as const

  it('flips at the top edge and clamps within the viewport', () => {
    const placement = getBubblePlacement(
      { left: 2, right: 42, top: 4, bottom: 24 },
      180,
      80,
      320,
      240,
      settings,
    )
    expect(placement.side).toBe('bottom')
    expect(placement.left).toBe(8)
    expect(placement.top).toBeGreaterThanOrEqual(8)
  })

  it.each(['top', 'bottom', 'left', 'right'] as const)('supports %s placement', (side) => {
    const placement = getBubblePlacement(
      { left: 220, right: 280, top: 180, bottom: 210 },
      120,
      60,
      500,
      400,
      { ...settings, side },
    )
    expect(placement.side).toBe(side)
    expect(placement.left).toBeGreaterThanOrEqual(8)
    expect(placement.top).toBeGreaterThanOrEqual(8)
  })

  it('uses the selection width for long selected text', () => {
    expect(getBubbleSizing(240, 800, 'top')).toEqual({ minWidth: 0, maxWidth: 240 })
    expect(getBubbleSizing(40, 180, 'top')).toEqual({ minWidth: 160, maxWidth: 164 })
    expect(cloneDefaultSettings()).not.toBe(cloneDefaultSettings())
  })
})
