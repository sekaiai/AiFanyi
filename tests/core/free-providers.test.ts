import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBaiduWebSign, parseBaiduWebPage, translateWithBaiduWeb } from '../../src/core/baidu-web'
import { cloneDefaultSettings, migrateSettings } from '../../src/core/settings'
import { describeMissingConfig, hasRequiredConfig } from '../../src/core/translate'
import type { SchemeSettings } from '../../src/core/types'

const fetchMock = vi.fn()

const baiduWebScheme: SchemeSettings = { id: 'baidu-web-1', type: 'baiduWeb', enabled: true }

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
