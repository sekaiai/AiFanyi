import { describe, expect, it } from 'vitest'
import { UI_MESSAGES, translate } from '../../src/core/i18n'
import { detectUiLocale } from '../../src/core/settings'

describe('detectUiLocale', () => {
  it('maps Chinese browser languages to zh', () => {
    expect(detectUiLocale('zh-CN')).toBe('zh')
    expect(detectUiLocale('zh-TW')).toBe('zh')
    expect(detectUiLocale('zh')).toBe('zh')
    expect(detectUiLocale('ZH-cn')).toBe('zh')
  })

  it('falls back to en for non-Chinese languages', () => {
    expect(detectUiLocale('en-US')).toBe('en')
    expect(detectUiLocale('ja')).toBe('en')
    expect(detectUiLocale('')).toBe('en')
  })
})

describe('translate', () => {
  it('returns dictionary text per locale with parameter interpolation', () => {
    expect(translate('zh', 'form.title')).toBe('设置')
    expect(translate('en', 'form.title')).toBe('Settings')
    expect(translate('zh', 'schemes.testOk', { ms: 123 })).toBe('成功 · 123 ms')
    expect(translate('en', 'schemes.testOk', { ms: 123 })).toBe('Success · 123 ms')
    expect(translate('en', 'editor.testFailed', { error: 'HTTP 401' })).toBe('API test failed: HTTP 401')
  })
})

describe('UI_MESSAGES', () => {
  it('keeps the zh and en dictionaries key-aligned', () => {
    expect(Object.keys(UI_MESSAGES.en).sort()).toEqual(Object.keys(UI_MESSAGES.zh).sort())
  })
})
