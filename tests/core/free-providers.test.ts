import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translateWithBing } from '../../src/core/bing'
import { parseMyMemoryTranslation, translateWithMyMemory } from '../../src/core/mymemory'
import { parseReversoTranslation, translateWithReverso } from '../../src/core/reverso'
import { cloneDefaultSettings, migrateSettings } from '../../src/core/settings'
import { describeMissingConfig, hasRequiredConfig } from '../../src/core/translate'
import { parseYandexDetection, parseYandexTranslation, translateWithYandex } from '../../src/core/yandex'
import type { SchemeSettings } from '../../src/core/types'

const fetchMock = vi.fn()

const bingScheme: SchemeSettings = { id: 'bing-1', type: 'bing', enabled: true }
const myMemoryScheme: SchemeSettings = { id: 'mymemory-1', type: 'mymemory', enabled: true }
const yandexScheme: SchemeSettings = { id: 'yandex-1', type: 'yandex', enabled: true }
const reversoScheme: SchemeSettings = { id: 'reverso-1', type: 'reverso', enabled: true }

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bing scheme config', () => {
  it('is a zero-config scheme', () => {
    expect(hasRequiredConfig(bingScheme)).toBe(true)
    expect(describeMissingConfig(bingScheme)).toBeNull()
  })

  it('survives a settings round-trip and re-adds missing built-in schemes', () => {
    const settings = cloneDefaultSettings()
    settings.schemes = [bingScheme]
    const migrated = migrateSettings(JSON.parse(JSON.stringify(settings)))
    expect(migrated.schemes[0]).toEqual(bingScheme)
    expect(migrated.schemes.map((scheme) => scheme.type)).toEqual(['bing', 'google', 'mymemory', 'yandex', 'reverso'])
  })
})

describe('translateWithBing', () => {
  it('fetches the translator page then posts to ttranslatev3 with IG params', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(new Response('IG:"ABC123";params_AbusePreventionHelper = [123, "tok=="]', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse([{ translations: [{ text: '你好', to: 'zh-Hans' }] }]))

    const result = await translateWithBing('hello', '简体中文')

    expect(result).toBe('你好')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://cn.bing.com/translator')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://cn.bing.com/ttranslatev3?isVertical=1&&IG=ABC123&IID=translator.5028')
    const postInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(postInit.method).toBe('POST')
    const body = new URLSearchParams(postInit.body as string)
    expect(body.get('fromLang')).toBe('auto-detect')
    expect(body.get('to')).toBe('zh-Hans')
    expect(body.get('text')).toBe('hello')
    expect(body.get('token')).toBe('tok==')
    expect(body.get('key')).toBe('123')
  })

  it('surfaces a non-ok page as an HTTP error', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(new Response('blocked', { status: 429 }))
    await expect(translateWithBing('hello', '简体中文')).rejects.toThrow('HTTP 429')
  })

  it('throws locally for unsupported targets without any request', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateWithBing('hello', 'Klingon')).rejects.toThrow('必应翻译不支持目标语言「Klingon」')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('mymemory scheme config', () => {
  it('is a zero-config scheme', () => {
    expect(hasRequiredConfig(myMemoryScheme)).toBe(true)
    expect(describeMissingConfig(myMemoryScheme)).toBeNull()
  })

  it('survives a settings round-trip and re-adds missing built-in schemes', () => {
    const settings = cloneDefaultSettings()
    settings.schemes = [myMemoryScheme]
    const migrated = migrateSettings(JSON.parse(JSON.stringify(settings)))
    expect(migrated.schemes[0]).toEqual(myMemoryScheme)
    expect(migrated.schemes.map((scheme) => scheme.type)).toEqual(['mymemory', 'bing', 'google', 'yandex', 'reverso'])
  })
})

describe('parseMyMemoryTranslation', () => {
  it('reads the translated text and rejects empty payloads', () => {
    expect(parseMyMemoryTranslation({ responseData: { translatedText: '您好', match: 0.85 }, responseStatus: 200 })).toBe('您好')
    expect(() => parseMyMemoryTranslation({ responseData: { translatedText: '' }, responseStatus: 200 })).toThrow('MyMemory 返回内容为空。')
  })

  it('rejects error statuses carried in a 200 response', () => {
    expect(() => parseMyMemoryTranslation({
      responseData: { translatedText: 'PLEASE SELECT TWO DISTINCT LANGUAGES' },
      responseDetails: 'PLEASE SELECT TWO DISTINCT LANGUAGES',
      responseStatus: '403',
    })).toThrow('MyMemory 错误 403：PLEASE SELECT TWO DISTINCT LANGUAGES')
  })

  it('rejects quota warnings even when the status is 200', () => {
    expect(() => parseMyMemoryTranslation({
      responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.' },
      responseStatus: 200,
    })).toThrow('MyMemory 免费额度已用完')
  })
})

describe('translateWithMyMemory', () => {
  it('queries the api with an autodetect langpair', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse({ responseData: { translatedText: '您好', match: 0.85 }, responseStatus: 200 }))

    const result = await translateWithMyMemory('hello', '简体中文')

    expect(result).toBe('您好')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.mymemory.translated.net/get?q=hello&langpair=Autodetect%7Czh-CN')
  })

  it('throws locally for oversized text without any request', async () => {
    vi.stubGlobal('fetch', fetchMock)
    const long = '测'.repeat(167)
    await expect(translateWithMyMemory(long, 'English')).rejects.toThrow('MyMemory 单次查询最多 500 字节')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('yandex scheme config', () => {
  it('is a zero-config scheme', () => {
    expect(hasRequiredConfig(yandexScheme)).toBe(true)
    expect(describeMissingConfig(yandexScheme)).toBeNull()
  })

  it('survives a settings round-trip and re-adds missing built-in schemes', () => {
    const settings = cloneDefaultSettings()
    settings.schemes = [yandexScheme]
    const migrated = migrateSettings(JSON.parse(JSON.stringify(settings)))
    expect(migrated.schemes[0]).toEqual(yandexScheme)
    expect(migrated.schemes.map((scheme) => scheme.type)).toEqual(['yandex', 'bing', 'google', 'mymemory', 'reverso'])
  })
})

describe('parseYandexDetection', () => {
  it('reads the detected language and rejects error codes', () => {
    expect(parseYandexDetection({ code: 200, lang: 'en' })).toBe('en')
    expect(parseYandexDetection({ code: '200', lang: 'en' })).toBe('en')
    expect(() => parseYandexDetection({ code: 400, message: 'Invalid lang' })).toThrow('Yandex 错误 400：Invalid lang')
    expect(() => parseYandexDetection({ code: 200 })).toThrow('Yandex 未能识别源语言。')
  })
})

describe('parseYandexTranslation', () => {
  it('reads the first text segment and rejects empties', () => {
    expect(parseYandexTranslation({ code: 200, lang: 'en-zh', text: ['你好', '世界'] })).toBe('你好')
    expect(() => parseYandexTranslation({ code: 200, text: [] })).toThrow('Yandex 返回内容为空。')
    expect(() => parseYandexTranslation({ code: '501', message: 'The specified translation direction is not supported' })).toThrow('Yandex 错误 501')
  })
})

describe('translateWithYandex', () => {
  it('detects the source language then translates with an explicit pair', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, lang: 'en' }))
      .mockResolvedValueOnce(jsonResponse({ code: 200, lang: 'en-zh', text: ['你好'] }))

    const result = await translateWithYandex('hello', '简体中文')

    expect(result).toBe('你好')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://browser.translate.yandex.net/api/v1/tr.json/detect?srv=browser_video_translation')
    const detectInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(detectInit.method).toBe('POST')
    const detectBody = new URLSearchParams(detectInit.body as string)
    expect(detectBody.get('text')).toBe('hello')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://browser.translate.yandex.net/api/v1/tr.json/translate?srv=browser_video_translation')
    const translateInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(translateInit.method).toBe('POST')
    const translateBody = new URLSearchParams(translateInit.body as string)
    expect(translateBody.get('text')).toBe('hello')
    expect(translateBody.get('lang')).toBe('en-zh')
  })

  it('throws locally for unsupported targets without any request', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateWithYandex('hello', '繁體中文')).rejects.toThrow('Yandex 翻译不支持目标语言「繁體中文」')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('reverso scheme config', () => {
  it('is a zero-config scheme', () => {
    expect(hasRequiredConfig(reversoScheme)).toBe(true)
    expect(describeMissingConfig(reversoScheme)).toBeNull()
  })

  it('survives a settings round-trip and re-adds missing built-in schemes', () => {
    const settings = cloneDefaultSettings()
    settings.schemes = [reversoScheme]
    const migrated = migrateSettings(JSON.parse(JSON.stringify(settings)))
    expect(migrated.schemes[0]).toEqual(reversoScheme)
    expect(migrated.schemes.map((scheme) => scheme.type)).toEqual(['reverso', 'bing', 'google', 'mymemory', 'yandex'])
  })
})

describe('parseReversoTranslation', () => {
  it('joins translation segments and rejects empties', () => {
    expect(parseReversoTranslation({ translation: ['你好世界'] })).toBe('你好世界')
    expect(parseReversoTranslation({ translation: ['你好', '世界'] })).toBe('你好世界')
    expect(() => parseReversoTranslation({ translation: [] })).toThrow('Reverso 返回内容为空。')
    expect(() => parseReversoTranslation({})).toThrow('Reverso 返回内容为空。')
  })
})

describe('translateWithReverso', () => {
  it('posts a reversomobile payload with a script-based source code', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse({ translation: ['Hello world'], languageDetection: { detectedLanguage: 'chi', isDirectionChanged: false }, engines: ['Lingvanex'] }))

    const result = await translateWithReverso('你好世界', 'English')

    expect(result).toBe('Hello world')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.reverso.net/translate/v1/translation')
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({
      format: 'text',
      from: 'chi',
      to: 'eng',
      input: '你好世界',
      options: { contextResults: false, languageDetection: true, sentenceSplitter: false, origin: 'reversomobile' },
    })
  })

  it('prefers kana over cjk ideographs when detecting the source', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse({ translation: ['今天天气很好。'] }))

    const result = await translateWithReverso('今日はとても良い天気ですね。', '简体中文')

    expect(result).toBe('今天天气很好。')
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string).from).toBe('jpn')
  })

  it('returns the original text for same-direction pairs without any request', async () => {
    vi.stubGlobal('fetch', fetchMock)
    expect(await translateWithReverso('hello world', 'English')).toBe('hello world')
    await expect(translateWithReverso('hello', '繁體中文')).rejects.toThrow('Reverso 翻译不支持目标语言「繁體中文」')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
