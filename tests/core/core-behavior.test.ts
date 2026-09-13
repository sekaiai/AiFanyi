import { describe, expect, it } from 'vitest'
import { getBubblePlacement, getBubbleSizing } from '../../src/core/bubble'
import { isTargetLanguageText } from '../../src/core/lang'
import { buildPrompt } from '../../src/core/prompt'
import {
  MAX_TRANSLATION_TEXT_LENGTH,
  cloneDefaultSettings,
  isSiteBlocked,
  migrateSettings,
  validateAiUrl,
} from '../../src/core/settings'
import { classifySelection, getWordAtOffset, isIgnorableElement, isSelectionIgnorableElement, normalizeSourceText } from '../../src/core/text'
import { toContentSettings } from '../../src/extension/storage'

describe('language detection', () => {
  it('同语言文本判定为跳过', () => {
    expect(isTargetLanguageText('有人记得你爱过的人', '简体中文')).toBe(true)
    expect(isTargetLanguageText('こんにちは世界', '日本語')).toBe(true)
    expect(isTargetLanguageText('사랑해요', '한국어')).toBe(true)
    expect(isTargetLanguageText('Hello world', 'English')).toBe(true)
    expect(isTargetLanguageText('Привет мир', 'Русский')).toBe(true)
    expect(isTargetLanguageText('सभी लोग', 'हिन्दी')).toBe(true)
    expect(isTargetLanguageText('สวัสดี', 'ไทย')).toBe(true)
    expect(isTargetLanguageText('مرحبا', 'العربية')).toBe(true)
    expect(isTargetLanguageText('Γειά σου', 'Ελληνικά')).toBe(true)
  })

  it('跨语言文本不跳过', () => {
    expect(isTargetLanguageText('Someone you loved', '简体中文')).toBe(false)
    expect(isTargetLanguageText('中文汉字', '日本語')).toBe(false) // 无假名不算日语
    expect(isTargetLanguageText('API、cache 和 context', 'English')).toBe(false) // 含汉字
    expect(isTargetLanguageText('café latte', 'English')).toBe(false) // 非纯 ASCII
  })

  it('保留简繁转换场景与安全默认', () => {
    expect(isTargetLanguageText('學習另一種語言', '简体中文')).toBe(false) // 繁体特征字 → 不跳过
    expect(isTargetLanguageText('简体文本', '繁體中文')).toBe(false) // 繁体目标不判定
    expect(isTargetLanguageText('hello', 'Français')).toBe(false) // 拉丁语系其他语言不判定
    expect(isTargetLanguageText('hello', 'Nederlands')).toBe(false) // 未收录规则不跳过
    expect(isTargetLanguageText('', '简体中文')).toBe(false)
  })
})

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

  // 悬停与划词共用基础排除（脚本/控件/编辑器等），差异只在 pre/code：
  // 悬停忽略代码区避免阅读代码时被打断，划词保持可用以便显式翻译。
  it('lets explicit selection opt into code blocks that hover ignores', () => {
    const code = document.createElement('code')
    expect(isIgnorableElement(code)).toBe(true)
    expect(isSelectionIgnorableElement(code)).toBe(false)
    expect(isIgnorableElement(document.createElement('p'))).toBe(false)
    expect(isSelectionIgnorableElement(document.createElement('p'))).toBe(false)
  })

  it('ignores controls and editable regions for both hover and selection', () => {
    expect(isIgnorableElement(document.createElement('button'))).toBe(true)
    expect(isSelectionIgnorableElement(document.createElement('button'))).toBe(true)
    expect(isIgnorableElement(document.createElement('input'))).toBe(true)
    expect(isSelectionIgnorableElement(document.createElement('input'))).toBe(true)
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

  it('keeps expanded target languages during migration', () => {
    expect(migrateSettings({ targetLanguage: 'ไทย' }).targetLanguage).toBe('ไทย')
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

  // 回归：悬停单词（rangeWidth < 160）时 maxWidth 曾是视口宽 - 16，
  // inline maxWidth 覆盖 CSS 后长释义把气泡拉到几百 px 宽（单词 even 即触发）。
  it('caps the bubble width at 290px regardless of viewport width', () => {
    expect(getBubbleSizing(40, 1920, 'top')).toEqual({ minWidth: 160, maxWidth: 290 })
    // 划词长句也不超过上限
    expect(getBubbleSizing(600, 1920, 'top')).toEqual({ minWidth: 0, maxWidth: 290 })
  })
})
