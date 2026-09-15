import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBaiduWebSign, parseBaiduWebPage, translateWithBaiduWeb } from '../../src/core/baidu-web'
import { translateWithBing } from '../../src/core/bing'
import { md5Hex } from '../../src/core/md5'
import { parseMyMemoryTranslation, translateWithMyMemory } from '../../src/core/mymemory'
import { cloneDefaultSettings, migrateSettings } from '../../src/core/settings'
import { parseTencentTranslation, parseTencentWebPage, translateWithTencent } from '../../src/core/tencent'
import { describeMissingConfig, hasRequiredConfig } from '../../src/core/translate'
import { createYoudaoSign, parseYoudaoTranslation, translateWithYoudao } from '../../src/core/youdao'
import type { SchemeSettings } from '../../src/core/types'

const fetchMock = vi.fn()

const baiduWebScheme: SchemeSettings = { id: 'baidu-web-1', type: 'baiduWeb', enabled: true }
const bingScheme: SchemeSettings = { id: 'bing-1', type: 'bing', enabled: true }
const tencentScheme: SchemeSettings = { id: 'tencent-1', type: 'tencent', enabled: true }
const youdaoScheme: SchemeSettings = { id: 'youdao-1', type: 'youdao', enabled: true }
const myMemoryScheme: SchemeSettings = { id: 'mymemory-1', type: 'mymemory', enabled: true }

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('baiduWeb scheme config', () => {
  it('is a zero-config scheme', () => {
    expect(hasRequiredConfig(baiduWebScheme)).toBe(true)
    expect(describeMissingConfig(baiduWebScheme)).toBeNull()
  })

  it('survives a settings round-trip', () => {
    const settings = cloneDefaultSettings()
    settings.schemes = [baiduWebScheme]
    const migrated = migrateSettings(JSON.parse(JSON.stringify(settings)))
    expect(migrated.schemes).toEqual([baiduWebScheme])
  })
})

describe('parseBaiduWebPage', () => {
  it('extracts token and gtk from the page html', () => {
    const html = '<script>window.gtk = "123.456";</script><script>window.token = "abc123";</script>'
    expect(parseBaiduWebPage(html)).toEqual({ token: 'abc123', gtk: '123.456' })
  })

  it('falls back to the default gtk and throws without token', () => {
    const html = '<script>window.token = "abc123";</script>'
    expect(parseBaiduWebPage(html).gtk).toBe('320305.131321201')
    expect(() => parseBaiduWebPage('<html></html>')).toThrow('token')
  })
})

describe('createBaiduWebSign', () => {
  it('returns the "n.m" signature format deterministically', () => {
    const first = createBaiduWebSign('Hello, world!', '320305.131321201')
    expect(first).toMatch(/^\d+\.\d+$/)
    expect(createBaiduWebSign('Hello, world!', '320305.131321201')).toBe(first)
  })

  it('changes with gtk and handles long queries without throwing', () => {
    expect(createBaiduWebSign('Hello', '320305.131321201')).not.toBe(createBaiduWebSign('Hello', '999999.999999'))
    const long = '这是一个超过三十个字符的长句子，用来覆盖签名函数的截断分支逻辑，确保不抛出异常。'
    expect(createBaiduWebSign(long, '320305.131321201')).toMatch(/^\d+\.\d+$/)
  })
})

describe('translateWithBaiduWeb', () => {
  it('fetches the page with credentials then posts the signed form', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(new Response('<script>window.token = "tok-1";</script>', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ errno: 0, trans_result: { data: [{ src: 'hello', dst: '你好' }] } }))

    const result = await translateWithBaiduWeb('hello', '简体中文')

    expect(result).toBe('你好')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://fanyi.baidu.com/')
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).credentials).toBe('include')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://fanyi.baidu.com/v2transapi')
    const postInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(postInit.method).toBe('POST')
    expect(postInit.credentials).toBe('include')
    const body = new URLSearchParams(postInit.body as string)
    expect(body.get('from')).toBe('auto')
    expect(body.get('to')).toBe('zh')
    expect(body.get('query')).toBe('hello')
    expect(body.get('token')).toBe('tok-1')
    expect(body.get('transtype')).toBe('translang')
    expect(body.get('domain')).toBe('common')
    expect(body.get('sign')).toMatch(/^\d+\.\d+$/)
  })

  it('joins multiple dst segments', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(new Response('<script>window.token = "tok-1";</script>', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ errno: 0, trans_result: { data: [{ dst: '你' }, { dst: '好' }] } }))
    expect(await translateWithBaiduWeb('hello', '简体中文')).toBe('你好')
  })

  it('surfaces non-zero errno as an error', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(new Response('<script>window.token = "tok-1";</script>', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ errno: 1022 }))
    await expect(translateWithBaiduWeb('hello', '简体中文')).rejects.toThrow('百度翻译错误 1022')
  })

  it('throws locally for unsupported targets without any request', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateWithBaiduWeb('hello', 'Türkçe')).rejects.toThrow('百度网页翻译不支持目标语言「Türkçe」')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('bing scheme config', () => {
  it('is a zero-config scheme', () => {
    expect(hasRequiredConfig(bingScheme)).toBe(true)
    expect(describeMissingConfig(bingScheme)).toBeNull()
  })

  it('survives a settings round-trip', () => {
    const settings = cloneDefaultSettings()
    settings.schemes = [bingScheme]
    const migrated = migrateSettings(JSON.parse(JSON.stringify(settings)))
    expect(migrated.schemes).toEqual([bingScheme])
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

describe('tencent scheme config', () => {
  it('is a zero-config scheme', () => {
    expect(hasRequiredConfig(tencentScheme)).toBe(true)
    expect(describeMissingConfig(tencentScheme)).toBeNull()
  })

  it('survives a settings round-trip', () => {
    const settings = cloneDefaultSettings()
    settings.schemes = [tencentScheme]
    const migrated = migrateSettings(JSON.parse(JSON.stringify(settings)))
    expect(migrated.schemes).toEqual([tencentScheme])
  })
})

describe('parseTencentWebPage', () => {
  it('extracts qtv and qtk from the page html', () => {
    const html = '<script>var qtv = "v-1";</script><script>var qtk = "k-1";</script>'
    expect(parseTencentWebPage(html)).toEqual({ qtv: 'v-1', qtk: 'k-1' })
  })

  it('throws when either param is missing', () => {
    expect(() => parseTencentWebPage('<script>var qtk = "k-1";</script>')).toThrow('腾讯翻译参数获取失败')
  })
})

describe('parseTencentTranslation', () => {
  it('joins machineTranslation across records', () => {
    expect(parseTencentTranslation({ translate: { records: [{ machineTranslation: '你' }, { machineTranslation: '好' }] } })).toBe('你好')
  })

  it('throws when the payload has no translation', () => {
    expect(() => parseTencentTranslation({ translate: { records: [] } })).toThrow('腾讯翻译返回内容为空。')
  })
})

describe('translateWithTencent', () => {
  it('fetches the page with credentials then posts the JSON body', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock
      .mockResolvedValueOnce(new Response('<script>var qtv = "v-1";var qtk = "k-1";</script>', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ translate: { records: [{ machineTranslation: '你好' }] } }))

    const result = await translateWithTencent('hello', '简体中文')

    expect(result).toBe('你好')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://fanyi.qq.com/')
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).credentials).toBe('include')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://fanyi.qq.com/api/translate')
    const postInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(postInit.method).toBe('POST')
    expect(postInit.credentials).toBe('include')
    const body = JSON.parse(postInit.body as string) as Record<string, unknown>
    expect(body.source).toBe('auto')
    expect(body.target).toBe('zh')
    expect(body.sourceText).toBe('hello')
    expect(body.qtv).toBe('v-1')
    expect(body.qtk).toBe('k-1')
    expect(String(body.sessionUuid)).toMatch(/^translate_uuid\d+$/)
  })

  it('throws locally for unsupported targets without any request', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateWithTencent('hello', 'Türkçe')).rejects.toThrow('腾讯交互翻译不支持目标语言「Türkçe」')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('youdao scheme config', () => {
  it('is a zero-config scheme', () => {
    expect(hasRequiredConfig(youdaoScheme)).toBe(true)
    expect(describeMissingConfig(youdaoScheme)).toBeNull()
  })

  it('survives a settings round-trip', () => {
    const settings = cloneDefaultSettings()
    settings.schemes = [youdaoScheme]
    const migrated = migrateSettings(JSON.parse(JSON.stringify(settings)))
    expect(migrated.schemes).toEqual([youdaoScheme])
  })
})

describe('createYoudaoSign', () => {
  it('anchors md5Hex against a known vector', () => {
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
  })

  it('composes the fanyideskweb signature deterministically', () => {
    const sign = createYoudaoSign('hello', '1700000000000')
    expect(sign).toMatch(/^[0-9a-f]{32}$/)
    expect(sign).toBe(md5Hex(`fanyideskwebhello1700000000000Ygy_4c=r#e#4F^2a2)2`))
    expect(createYoudaoSign('hello', '1700000000000')).toBe(sign)
    expect(createYoudaoSign('hello', '1700000000001')).not.toBe(sign)
  })
})

describe('parseYoudaoTranslation', () => {
  it('extracts tgt from the first result', () => {
    expect(parseYoudaoTranslation({ errorCode: 0, translateResult: [[{ tgt: '你好' }]] })).toBe('你好')
  })

  it('throws on non-zero errorCode or empty results', () => {
    expect(() => parseYoudaoTranslation({ errorCode: 50 })).toThrow('有道翻译错误 50')
    expect(() => parseYoudaoTranslation({ errorCode: 0, translateResult: [] })).toThrow('有道翻译返回内容为空。')
  })
})

describe('translateWithYoudao', () => {
  it('posts the signed form to translate_o', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse({ errorCode: 0, translateResult: [[{ tgt: '你好' }]] }))

    const result = await translateWithYoudao('hello', '简体中文')

    expect(result).toBe('你好')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://fanyi.youdao.com/translate_o?client=fanyideskweb&keyfrom=fanyi.web')
    const postInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(postInit.method).toBe('POST')
    const body = new URLSearchParams(postInit.body as string)
    expect(body.get('i')).toBe('hello')
    expect(body.get('from')).toBe('auto')
    expect(body.get('to')).toBe('zh-CHS')
    expect(body.get('salt')).toMatch(/^\d{14}$/)
    expect(body.get('ts')).toMatch(/^\d{13}$/)
    expect(body.get('mysticTime')).toBe(body.get('ts'))
    expect(body.get('sign')).toMatch(/^[0-9a-f]{32}$/)
    expect(body.get('client')).toBe('fanyideskweb')
    expect(body.get('keyfrom')).toBe('fanyi.web')
    expect(body.get('version')).toBe('5.0')
    expect(body.get('action')).toBe('FY_BY_REALTlME')
  })

  it('throws locally for unsupported targets without any request', async () => {
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateWithYoudao('hello', 'Türkçe')).rejects.toThrow('有道翻译不支持目标语言「Türkçe」')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('mymemory scheme config', () => {
  it('is a zero-config scheme', () => {
    expect(hasRequiredConfig(myMemoryScheme)).toBe(true)
    expect(describeMissingConfig(myMemoryScheme)).toBeNull()
  })

  it('survives a settings round-trip', () => {
    const settings = cloneDefaultSettings()
    settings.schemes = [myMemoryScheme]
    const migrated = migrateSettings(JSON.parse(JSON.stringify(settings)))
    expect(migrated.schemes).toEqual([myMemoryScheme])
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
