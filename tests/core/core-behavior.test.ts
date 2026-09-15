import { describe, expect, it } from 'vitest'
import { getBubblePlacement, getBubbleSizing } from '../../src/core/bubble'
import { isTargetLanguageText } from '../../src/core/lang'
import {
  COLOR_PRESETS,
  DEFAULT_BAIDU_WEB_SCHEME,
  DEFAULT_BING_SCHEME,
  DEFAULT_GOOGLE_SCHEME,
  DEFAULT_TENCENT_SCHEME,
  MAX_TRANSLATION_TEXT_LENGTH,
  cloneDefaultSettings,
  isSiteBlocked,
  migrateSettings,
  resetToDefaults,
  validateAiUrl,
} from '../../src/core/settings'
import { classifySelection, extractSingleWord, getWordAtOffset, isIgnorableElement, isSelectionIgnorableElement, normalizeSourceText } from '../../src/core/text'
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
    ['你好', 'dictionary', '你好'],
    ['你', 'ai', '你'],
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

  it('extracts CJK and accented words with a two-character CJK minimum', () => {
    expect(extractSingleWord('你好')).toBe('你好')
    expect(extractSingleWord('你')).toBeNull()
    expect(extractSingleWord('你好世界')).toBeNull() // 两个词不算单词
    expect(extractSingleWord('café')).toBe('café')
    expect(extractSingleWord('こんにちは')).toBe('こんにちは')
  })

  it('finds CJK words at a text offset and rejects single characters', () => {
    expect(getWordAtOffset('你好，世界', 0)).toEqual({ word: '你好', start: 0, end: 2 })
    expect(getWordAtOffset('你好，世界', 3)).toEqual({ word: '世界', start: 3, end: 5 })
    expect(getWordAtOffset('你好吗', 2)).toBeNull() // 单字不取词
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
    expect(migrated.schemes).toEqual([DEFAULT_GOOGLE_SCHEME, DEFAULT_BAIDU_WEB_SCHEME, DEFAULT_BING_SCHEME, DEFAULT_TENCENT_SCHEME])
  })

  it('strips unknown bubble keys instead of carrying them into the migrated settings', () => {
    const migrated = migrateSettings({ bubble: { gap: 12, fontFamily: 'mono', legacyExtra: 'junk' } })
    expect(migrated.bubble.gap).toBe(12)
    expect(migrated.bubble.fontFamily).toBe('mono')
    expect('legacyExtra' in migrated.bubble).toBe(false)
  })

  it('keeps expanded target languages during migration', () => {
    expect(migrateSettings({ targetLanguage: 'ไทย' }).targetLanguage).toBe('ไทย')
  })

  it('migrates the hover highlight color with the color presets', () => {
    expect(cloneDefaultSettings().bubble.highlightColor).toBe('#4f84e81c')
    // 旧版 6 位 hex 渲染时固定附加约 22% 透明度，迁移补上 alpha 位保持观感一致
    expect(migrateSettings({ bubble: { colorPreset: 'custom', highlightColor: '#ff8800' } }).bubble.highlightColor).toBe('#ff880038')
    // 旧版存档没有 colorPreset 字段：手改的高亮不得被缺省的 paper 预设吞掉
    expect(migrateSettings({ bubble: { highlightColor: '#ff8800' } }).bubble.highlightColor).toBe('#ff880038')
    // 高亮色属于配色预设：显式选择预设的存档迁移后跟随预设
    expect(migrateSettings({ bubble: { colorPreset: 'night', highlightColor: '#ff8800' } }).bubble.highlightColor).toBe(COLOR_PRESETS.night.highlightColor)
    // 新版 8 位 hex 自带透明度，迁移保持原样
    expect(migrateSettings({ bubble: { colorPreset: 'custom', highlightColor: '#ff880080' } }).bubble.highlightColor).toBe('#ff880080')
    // 迁移必须幂等：content script 会把 background 已迁移的结果再迁移一次，缺省补全的 paper 不得被当成显式选择去覆盖手改高亮
    const once = migrateSettings({ bubble: { highlightColor: '#ff8800' } })
    expect(migrateSettings(once).bubble.highlightColor).toBe('#ff880038')
    // 未显式选预设的存档按颜色反推归属：手改高亮不匹配任何预设 → custom；纯默认配色 → paper
    expect(once.bubble.colorPreset).toBe('custom')
    expect(migrateSettings(undefined).bubble.colorPreset).toBe('paper')
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
    expect(migrated.schemes).toEqual([DEFAULT_GOOGLE_SCHEME, DEFAULT_BAIDU_WEB_SCHEME, DEFAULT_BING_SCHEME, DEFAULT_TENCENT_SCHEME])
  })

  it('seeds the free default scheme chain for fresh installs', () => {
    const schemes = cloneDefaultSettings().schemes
    expect(schemes).toHaveLength(4)
    expect(schemes.map((scheme) => scheme.type)).toEqual(['google', 'baiduWeb', 'bing', 'tencent'])
  })

  it('keeps the new keyless schemes and strips unknown fields during migration', () => {
    const migrated = migrateSettings({
      schemes: [
        { id: 'w1', type: 'baiduWeb', enabled: true, junk: 'x' },
        { id: 'w2', type: 'bing', enabled: true, junk: 'x' },
        { id: 'w3', type: 'tencent', enabled: true, junk: 'x' },
        { id: 'w4', type: 'youdao', enabled: true, junk: 'x' },
        { id: 'w5', type: 'mymemory', enabled: true, junk: 'x' },
      ],
    })
    expect(migrated.schemes).toEqual([
      { id: 'w1', type: 'baiduWeb', enabled: true },
      { id: 'w2', type: 'bing', enabled: true },
      { id: 'w3', type: 'tencent', enabled: true },
      { id: 'w4', type: 'youdao', enabled: true },
      { id: 'w5', type: 'mymemory', enabled: true },
    ])
  })

  it('resetToDefaults 只重置表单项，保留句子翻译与单词翻译卡片', () => {
    const current = cloneDefaultSettings()
    current.enabled = false
    current.siteBlacklist = ['example.com']
    current.hoverDelayMs = 700
    current.bubble.fontSize = 20
    current.targetLanguage = 'English'
    current.schemeOrder = 'sequential'
    current.schemes = [{
      id: 'ai-x',
      type: 'ai',
      enabled: true,
      label: '',
      apiUrl: 'https://api.example.com/v1/chat/completions',
      apiKey: 'sk-x',
      model: 'm',
      timeoutMs: 8000,
    }]
    current.word = { showOriginal: false, speakEnabled: false, accent: 'uk', sources: { youdao: false, bing: true, google: true, freedictionaryapi: true } }

    const next = resetToDefaults(current)

    expect(next.enabled).toBe(true)
    expect(next.siteBlacklist).toEqual([])
    expect(next.hoverDelayMs).toBe(200)
    expect(next.bubble.fontSize).toBe(16)
    expect(next.targetLanguage).toBe('English')
    expect(next.schemeOrder).toBe('sequential')
    expect(next.schemes).toEqual(current.schemes)
    expect(next.word).toEqual(current.word)
    expect(current.enabled).toBe(false)
  })

  it('migrates the UI locale with a Chinese default and rejects invalid values', () => {
    expect(cloneDefaultSettings().uiLocale).toBe('zh')
    expect(migrateSettings({}).uiLocale).toBe('zh')
    expect(migrateSettings({ uiLocale: 'en' }).uiLocale).toBe('en')
    expect(migrateSettings({ uiLocale: 'fr' }).uiLocale).toBe('zh')
  })

  it('resetToDefaults keeps the chosen UI locale', () => {
    const current = cloneDefaultSettings()
    current.uiLocale = 'en'

    expect(resetToDefaults(current).uiLocale).toBe('en')
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

  it('keeps Baidu AI scheme credentials and clamps the model type during migration', () => {
    const migrated = migrateSettings({
      schemes: [{ id: 'ba1', type: 'baiduAi', enabled: true, appId: 'app', secretKey: 'key', modelType: 'llm' }],
    })
    expect(migrated.schemes).toEqual([{ id: 'ba1', type: 'baiduAi', enabled: true, appId: 'app', secretKey: 'key', modelType: 'llm' }])

    const fallback = migrateSettings({
      schemes: [{ id: 'ba2', type: 'baiduAi', enabled: true, appId: 'app', secretKey: 'key', modelType: 'nope' }],
    })
    expect(fallback.schemes[0]).toMatchObject({ type: 'baiduAi', modelType: 'nmt' })
  })

  it('keeps Volcengine scheme credentials during migration', () => {
    const migrated = migrateSettings({
      schemes: [{ id: 'v1', type: 'volcengine', enabled: true, accessKeyId: 'ak', secretAccessKey: 'sk', region: 'cn-beijing' }],
    })
    expect(migrated.schemes).toEqual([{ id: 'v1', type: 'volcengine', enabled: true, accessKeyId: 'ak', secretAccessKey: 'sk', region: 'cn-beijing' }])
  })

  it('sanitizes custom AI scheme labels with trimming and a 50-char cap', () => {
    const migrated = migrateSettings({
      schemes: [
        { id: 'ai1', type: 'ai', enabled: true, label: '  我的智谱  ', apiUrl: 'https://api.example.com', apiKey: 'k', model: 'm', timeoutMs: 20000 },
        { id: 'ai2', type: 'ai', enabled: true, label: 'x'.repeat(80), apiUrl: 'https://api.example.com', apiKey: 'k', model: 'm', timeoutMs: 20000 },
        { id: 'ai3', type: 'ai', enabled: true, apiUrl: 'https://api.example.com', apiKey: 'k', model: 'm', timeoutMs: 20000 },
        { id: 'ai4', type: 'ai', enabled: true, label: 42, apiUrl: 'https://api.example.com', apiKey: 'k', model: 'm', timeoutMs: 20000 },
      ],
    })
    expect(migrated.schemes[0]).toMatchObject({ type: 'ai', label: '我的智谱' })
    expect((migrated.schemes[1] as { label: string }).label).toHaveLength(50)
    expect((migrated.schemes[2] as { label: string }).label).toBe('')
    expect((migrated.schemes[3] as { label: string }).label).toBe('')
  })

  it('strips all provider credentials from content settings snapshots', () => {
    const settings = cloneDefaultSettings()
    settings.schemes = [
      { id: 'a', type: 'ai', enabled: true, label: '', apiUrl: 'https://example.com', apiKey: 'secret', model: 'm', timeoutMs: 20000 },
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

  // 回归：句子翻译不受单词气泡 290px 封顶，宽度上限是选区所在块级容器宽度。
  it('caps sentence bubbles at their container width instead of the 290px word cap', () => {
    expect(getBubbleSizing(600, 1920, 'top', { sentenceContainerWidth: 800 })).toEqual({ minWidth: 0, maxWidth: 800 })
    // 仍受视口留白（containerWidth - 16）约束
    expect(getBubbleSizing(600, 800, 'top', { sentenceContainerWidth: 4000 })).toEqual({ minWidth: 0, maxWidth: 784 })
    expect(getBubbleSizing(600, 1920, 'top', { sentenceContainerWidth: 120 })).toEqual({ minWidth: 0, maxWidth: 120 })
    // 左右弹出维持单词气泡 290px 封顶
    expect(getBubbleSizing(600, 1920, 'right', { sentenceContainerWidth: 800 })).toEqual({ minWidth: 160, maxWidth: 290 })
    // 容器宽度测不出（0）时回退原行为
    expect(getBubbleSizing(600, 1920, 'top', { sentenceContainerWidth: 0 })).toEqual({ minWidth: 0, maxWidth: 290 })
    // 短选区（rangeWidth < 160）维持现状：160px 最小可读宽
    expect(getBubbleSizing(80, 1920, 'top', { sentenceContainerWidth: 800 })).toEqual({ minWidth: 160, maxWidth: 290 })
  })
})
