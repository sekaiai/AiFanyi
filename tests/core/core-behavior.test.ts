import { describe, expect, it } from 'vitest'
import { getBubblePlacement, getBubbleSizing } from '../../src/core/bubble'
import { buildPrompt } from '../../src/core/prompt'
import {
  MAX_TRANSLATION_TEXT_LENGTH,
  cloneDefaultSettings,
  isSiteBlocked,
  migrateSettings,
  validateAiUrl,
} from '../../src/core/settings'
import { classifySelection, getWordAtOffset, normalizeSourceText } from '../../src/core/text'
import { toContentSettings } from '../../src/extension/storage'

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
    expect(migrated.version).toBe(2)
    expect(migrated.hoverDelayMs).toBe(5000)
    expect(migrated.bubble.side).toBe('top')
    expect(migrated.bubble.gap).toBe(0)
    expect(migrated.schemes).toEqual([])
  })

  it('migrates v1 AI settings into an enabled scheme', () => {
    const migrated = migrateSettings({
      ai: { apiUrl: 'https://api.example.com/v1/chat/completions', apiKey: 'sk-x', model: 'm', timeoutMs: 8000 },
    })
    expect(migrated.schemes).toHaveLength(1)
    expect(migrated.schemes[0]).toMatchObject({
      type: 'ai',
      enabled: true,
      apiUrl: 'https://api.example.com/v1/chat/completions',
      apiKey: 'sk-x',
      model: 'm',
      timeoutMs: 8000,
    })
  })

  it('does not create a scheme when v1 AI settings are empty', () => {
    const migrated = migrateSettings({ ai: { apiUrl: '', apiKey: '', model: '', timeoutMs: 20000 } })
    expect(migrated.schemes).toEqual([])
  })

  it('drops unknown scheme types and backfills missing ids', () => {
    const migrated = migrateSettings({
      schemes: [
        { type: 'deepl', enabled: true, authKey: 'k' },
        { id: 'g1', type: 'google' },
        { id: 'bad', type: 'nope' },
      ],
    })
    expect(migrated.schemes.map((scheme) => scheme.type)).toEqual(['deepl', 'google'])
    expect(migrated.schemes[0]?.id).toBeTruthy()
    expect(migrated.schemes[1]?.id).toBe('g1')
  })

  it('keeps Baidu scheme credentials during migration', () => {
    const migrated = migrateSettings({
      schemes: [{ id: 'b1', type: 'baidu', enabled: true, appId: 'app', secretKey: 'key' }],
    })
    expect(migrated.schemes).toEqual([{ id: 'b1', type: 'baidu', enabled: true, appId: 'app', secretKey: 'key' }])
  })

  it('keeps Volcengine scheme credentials during migration', () => {
    const migrated = migrateSettings({
      schemes: [{ id: 'v1', type: 'volcengine', enabled: true, accessKeyId: 'ak', secretAccessKey: 'sk', region: 'cn-beijing' }],
    })
    expect(migrated.schemes).toEqual([{ id: 'v1', type: 'volcengine', enabled: true, accessKeyId: 'ak', secretAccessKey: 'sk', region: 'cn-beijing' }])
  })

  it('strips all provider credentials from content settings snapshots', () => {
    const settings = cloneDefaultSettings()
    settings.schemes = [
      { id: 'a', type: 'ai', enabled: true, apiUrl: 'https://example.com', apiKey: 'secret', model: 'm', timeoutMs: 20000 },
      { id: 'b', type: 'volcengine', enabled: true, accessKeyId: 'ak', secretAccessKey: 'sk', region: 'cn-north-1' },
    ]
    const publicSettings = toContentSettings(settings)
    expect(publicSettings.schemes).toEqual([])
    expect(settings.schemes).toHaveLength(2)
  })

  it('validates AI URLs without accepting credentials or unsafe schemes', () => {
    expect(validateAiUrl('https://api.example.com/v1/chat/completions')).toBe('https://api.example.com/v1/chat/completions')
    expect(() => validateAiUrl('javascript:alert(1)')).toThrow('AI 地址必须是 http 或 https')
    expect(() => validateAiUrl('https://user:secret@example.com')).toThrow('AI 地址格式不安全')
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
