import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cloneDefaultSettings } from '../../src/core/settings'
import { hasRequiredConfig, runTranslation, translateWithScheme } from '../../src/core/translate'
import { createBaiduSignature } from '../../src/core/baidu'
import { md5Hex } from '../../src/core/md5'
import { createVolcengineAuthorization, sha256Hex } from '../../src/core/volcengine'
import type { SchemeSettings, TranslationSettings } from '../../src/core/types'

const fetchMock = vi.fn()

const deeplScheme: SchemeSettings = { id: 'deepl-1', type: 'deepl', enabled: true, authKey: 'dl-key', endpoint: 'free' }
const googleScheme: SchemeSettings = { id: 'google-1', type: 'google', enabled: true }
const cloudScheme: SchemeSettings = { id: 'cloud-1', type: 'googleCloud', enabled: true, apiKey: 'gcp-key' }
const baiduScheme: SchemeSettings = { id: 'baidu-1', type: 'baidu', enabled: true, appId: 'app-id', secretKey: 'secret-key' }
const volcengineScheme: SchemeSettings = {
  id: 'volcengine-1',
  type: 'volcengine',
  enabled: true,
  accessKeyId: 'ak-id',
  secretAccessKey: 'secret-key',
  region: 'cn-north-1',
}
const aiScheme: SchemeSettings = {
  id: 'ai-1',
  type: 'ai',
  enabled: true,
  apiUrl: 'https://api.example.com/v1/chat/completions',
  apiKey: 'sk',
  model: 'test-model',
  timeoutMs: 20000,
}

function settingsWithSchemes(schemes: SchemeSettings[]): TranslationSettings {
  const settings = cloneDefaultSettings()
  settings.schemes = schemes
  return settings
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

function requestInit(callIndex: number): RequestInit {
  return fetchMock.mock.calls[callIndex]?.[1] as RequestInit
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('hasRequiredConfig', () => {
  it('requires per-scheme credentials', () => {
    expect(hasRequiredConfig(deeplScheme)).toBe(true)
    expect(hasRequiredConfig({ ...deeplScheme, authKey: ' ' })).toBe(false)
    expect(hasRequiredConfig(googleScheme)).toBe(true)
    expect(hasRequiredConfig({ ...cloudScheme, apiKey: '' })).toBe(false)
    expect(hasRequiredConfig(baiduScheme)).toBe(true)
    expect(hasRequiredConfig({ ...baiduScheme, secretKey: ' ' })).toBe(false)
    expect(hasRequiredConfig(volcengineScheme)).toBe(true)
    expect(hasRequiredConfig({ ...volcengineScheme, region: ' ' })).toBe(false)
    expect(hasRequiredConfig(aiScheme)).toBe(true)
    expect(hasRequiredConfig({ ...aiScheme, model: '' })).toBe(false)
  })
})

describe('Baidu signing', () => {
  it('calculates the standard MD5 digest', () => {
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
  })
})

describe('Volcengine signing', () => {
  it('calculates SHA-256 and builds a V4 authorization header', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const signed = await createVolcengineAuthorization(
      '{"TargetLanguage":"zh","TextList":["hello"]}',
      'ak-id',
      'secret-key',
      'cn-north-1',
      'translate.volcengineapi.com',
      new Date('2024-01-02T03:04:05Z'),
    )
    expect(signed.xDate).toBe('20240102T030405Z')
    expect(signed.bodyHash).toMatch(/^[a-f0-9]{64}$/)
    expect(signed.authorization).toMatch(/^HMAC-SHA256 Credential=ak-id\/20240102\/cn-north-1\/translate\/request, SignedHeaders=host;x-content-sha256;x-date, Signature=[a-f0-9]{64}$/)
  })
})

describe('translateWithScheme', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('calls the DeepL free endpoint with the auth key and parses the first translation', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ translations: [{ text: ' 你好 ' }] }))

    await expect(translateWithScheme(deeplScheme, ' hello ', '简体中文')).resolves.toEqual({ kind: 'text', text: '你好' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api-free.deepl.com/v2/translate')
    expect(new Headers(requestInit(0).headers).get('authorization')).toBe('DeepL-Auth-Key dl-key')
    expect(JSON.parse(String(requestInit(0).body))).toEqual({ text: ['hello'], target_lang: 'ZH' })
  })

  it('uses the DeepL pro endpoint when configured', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ translations: [{ text: '你好' }] }))

    await translateWithScheme({ ...deeplScheme, endpoint: 'pro' }, 'hello', '简体中文')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.deepl.com/v2/translate')
  })

  it('posts form data to the free Google endpoint and joins the segments', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([[['你'], ['好，', null], ['世界']]]))

    await expect(translateWithScheme(googleScheme, 'hello world', '简体中文')).resolves.toEqual({ kind: 'text', text: '你好，世界' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=zh-CN')
    expect(new Headers(requestInit(0).headers).get('content-type')).toContain('application/x-www-form-urlencoded')
    expect(String(requestInit(0).body)).toBe('q=hello+world')
  })

  it('passes the API key in the query string for Google Cloud', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { translations: [{ translatedText: '你好' }] } }))

    await expect(translateWithScheme(cloudScheme, 'hello', '简体中文')).resolves.toEqual({ kind: 'text', text: '你好' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://translation.googleapis.com/language/translate/v2?key=gcp-key')
    expect(JSON.parse(String(requestInit(0).body))).toEqual({ q: 'hello', target: 'zh-CN', format: 'text' })
  })

  it('signs Baidu requests and parses translated segments', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trans_result: [{ src: 'hello', dst: '你好' }, { src: 'world', dst: '世界' }] }))

    await expect(translateWithScheme(baiduScheme, 'hello world', '简体中文')).resolves.toEqual({ kind: 'text', text: '你好\n世界' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://fanyi-api.baidu.com/api/trans/vip/translate')
    expect(new Headers(requestInit(0).headers).get('content-type')).toContain('application/x-www-form-urlencoded')
    const body = new URLSearchParams(String(requestInit(0).body))
    expect(body.get('q')).toBe('hello world')
    expect(body.get('from')).toBe('auto')
    expect(body.get('to')).toBe('zh')
    expect(body.get('appid')).toBe('app-id')
    const salt = body.get('salt') ?? ''
    expect(body.get('sign')).toBe(createBaiduSignature('app-id', 'hello world', salt, 'secret-key'))
    expect(body.get('sign')).toMatch(/^[a-f0-9]{32}$/)
  })

  it('signs Volcengine requests and parses translated segments', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ TranslationList: [{ Translation: '你好' }, { Translation: '世界' }] }))

    await expect(translateWithScheme(volcengineScheme, 'hello world', '简体中文')).resolves.toEqual({ kind: 'text', text: '你好\n世界' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://translate.volcengineapi.com/?Action=TranslateText&Version=2020-06-01')
    const headers = new Headers(requestInit(0).headers)
    expect(headers.get('authorization')).toMatch(/^HMAC-SHA256 Credential=ak-id\//)
    expect(headers.get('x-date')).toMatch(/^\d{8}T\d{6}Z$/)
    expect(headers.get('x-content-sha256')).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.parse(String(requestInit(0).body))).toEqual({ TargetLanguage: 'zh', TextList: ['hello world'] })
  })

  it('maps the target language per provider', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ translations: [{ text: 'hello' }] }))

    await translateWithScheme(deeplScheme, 'hello', 'English')

    expect(JSON.parse(String(requestInit(0).body))).toEqual({ text: ['hello'], target_lang: 'EN' })
  })

  it('routes AI schemes through the AI request path', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '你好' } }] }))

    await expect(translateWithScheme(aiScheme, 'hello', '简体中文')).resolves.toEqual({ kind: 'text', text: '你好' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(aiScheme.apiUrl)
  })

  it('rejects empty upstream payloads', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ translations: [] }))
    await expect(translateWithScheme(deeplScheme, 'hello', '简体中文')).rejects.toThrow('DeepL 返回内容为空。')

    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    await expect(translateWithScheme(googleScheme, 'hello', '简体中文')).rejects.toThrow('Google 返回内容为空。')

    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { translations: [] } }))
    await expect(translateWithScheme(cloudScheme, 'hello', '简体中文')).rejects.toThrow('Google Cloud 返回内容为空。')

    fetchMock.mockResolvedValueOnce(jsonResponse({ trans_result: [] }))
    await expect(translateWithScheme(baiduScheme, 'hello', '简体中文')).rejects.toThrow('百度翻译返回内容为空。')

    fetchMock.mockResolvedValueOnce(jsonResponse({ TranslationList: [] }))
    await expect(translateWithScheme(volcengineScheme, 'hello', '简体中文')).rejects.toThrow('火山引擎返回内容为空。')
  })
})

describe('runTranslation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('uses the first configured scheme and stops', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ translations: [{ text: '你好' }] }))

    const outcome = await runTranslation('hello', settingsWithSchemes([deeplScheme, googleScheme]))

    expect(outcome).toEqual({ kind: 'text', text: '你好' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries the next scheme after a failure', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([[['你好']]]))

    const outcome = await runTranslation('hello', settingsWithSchemes([deeplScheme, googleScheme]))

    expect(outcome).toEqual({ kind: 'text', text: '你好' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('skips disabled and unconfigured schemes without marking them as attempted', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([[['你好']]]))

    const outcome = await runTranslation('hello', settingsWithSchemes([
      { ...deeplScheme, enabled: false },
      { ...cloudScheme, apiKey: '' },
      googleScheme,
    ]))

    expect(outcome).toEqual({ kind: 'text', text: '你好' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('translate_a/single')
  })

  it('aborts the whole chain immediately when cancelled', async () => {
    fetchMock.mockImplementationOnce(async (_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const controller = new AbortController()
    const pending = runTranslation('hello', settingsWithSchemes([deeplScheme, googleScheme]), controller.signal)

    controller.abort(new DOMException('Cancelled', 'AbortError'))

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the dictionary for single words when no schemes exist', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([
      {
        pronunciations: [{ type: 'ipa', text: '/həˈloʊ/' }],
        partOfSpeech: 'int.',
        senses: [{ translations: [{ language: { code: 'zh' }, word: '你好' }] }],
      },
    ]))

    const outcome = await runTranslation('hello', settingsWithSchemes([]))

    expect(outcome).toEqual({
      kind: 'dictionary',
      result: { source: 'hello', pronunciation: '/həˈloʊ/', meanings: [{ partOfSpeech: 'int.', translations: ['你好'] }] },
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://freedictionaryapi.com/api/v1/entries/en/hello?translations=true')
  })

  it('does not use the dictionary fallback for multi-word text', async () => {
    await expect(runTranslation('hello world', settingsWithSchemes([]))).rejects.toThrow('请先在设置中添加翻译方案')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves the scheme error when a scheme was attempted', async () => {
    fetchMock.mockResolvedValue(new Response('error', { status: 500 }))

    await expect(runTranslation('hello world', settingsWithSchemes([deeplScheme]))).rejects.toThrow('HTTP 500')
  })

  it('prefers the scheme error over a dictionary failure for single words', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('deepl')) return new Response('unauthorized', { status: 401 })
      return new Response('not found', { status: 404 })
    })

    await expect(runTranslation('hello', settingsWithSchemes([deeplScheme]))).rejects.toThrow('HTTP 401')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
