import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cloneDefaultSettings } from '../../src/core/settings'
import { orderSchemes, hasRequiredConfig, resetSchemeCooldown, runTranslation, translateWithScheme } from '../../src/core/translate'
import { resetWordSourceCooldown } from '../../src/core/word-sources'
import { baiduTargetCode, createBaiduSignature } from '../../src/core/baidu'
import { md5Hex } from '../../src/core/md5'
import { createVolcengineAuthorization, sha256Hex, volcengineTargetCode } from '../../src/core/volcengine'
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
  label: '',
  apiUrl: 'https://api.example.com/v1/chat/completions',
  apiKey: 'sk',
  model: 'test-model',
  timeoutMs: 20000,
}

function settingsWithSchemes(schemes: SchemeSettings[], options?: { wordPool?: boolean }): TranslationSettings {
  const settings = cloneDefaultSettings()
  settings.schemes = schemes
  // 固定为顺序模式：下面的用例验证「按列表顺序」的链式语义；
  // 随机洗牌在 orderSchemes 的专属 describe 里用注入的随机数验证。
  settings.schemeOrder = 'sequential'
  // 默认禁用全部单词源（等价旧的「单词池关闭」）：这里绝大多数用例验证的是「方案链」语义，
  // 全源禁用时池立即让位（不发请求，落到方案链）。单词池的行为在下面的专属 describe 里单独覆盖。
  if (!options?.wordPool) {
    settings.word.sources = { youdao: false, bing: false, google: false, freedictionaryapi: false }
  }
  return settings
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

function requestInit(callIndex: number): RequestInit {
  return fetchMock.mock.calls[callIndex]?.[1] as RequestInit
}

beforeEach(() => {
  // 失败冷却是模块级状态：每个用例前清空，避免用例间相互影响。
  resetSchemeCooldown()
  resetWordSourceCooldown()
})

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

describe('orderSchemes', () => {
  const a: SchemeSettings = { ...deeplScheme, id: 'a' }
  const b: SchemeSettings = { ...googleScheme, id: 'b' }
  const c: SchemeSettings = { ...cloudScheme, id: 'c' }

  it('keeps the list order for sequential mode', () => {
    expect(orderSchemes([a, b, c], 'sequential')).toEqual([a, b, c])
  })

  it('shuffles deterministically with an injected random source', () => {
    // random() 恒返 0：Fisher-Yates 每轮 j=0，两轮交换后得到 [b, c, a]
    expect(orderSchemes([a, b, c], 'random', () => 0)).toEqual([b, c, a])
    // random() 恒取最大：j 恒等于 i，等价于原序
    expect(orderSchemes([a, b, c], 'random', () => 0.99)).toEqual([a, b, c])
  })

  it('leaves lists shorter than two untouched even in random mode', () => {
    expect(orderSchemes([a], 'random', () => 0)).toEqual([a])
    expect(orderSchemes([], 'random')).toEqual([])
  })
})

describe('Baidu signing', () => {
  it('calculates the standard MD5 digest', () => {
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
  })
})

describe('Volcengine signing', () => {
  const fixedDate = new Date('2024-01-02T03:04:05Z')
  const fixedBody = '{"TargetLanguage":"zh","TextList":["hello"]}'

  const signFixed = (ak = 'ak-id', sk = 'secret-key', region = 'cn-north-1') =>
    createVolcengineAuthorization(fixedBody, ak, sk, region, 'translate.volcengineapi.com', fixedDate)

  it('hashes payloads with SHA-256 (lowercase hex)', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  // 固定值回归：期望值由独立实现（Node crypto 与 OpenSSL CLI）交叉复算得出。
  // 签名串里 content-type 必须参与（火山引擎要求「请求中存在 Content-Type 时 CanonicalHeaders 必须包含它」），
  // 任意一次改动如果动了换行、头顺序或派生链，这里会立刻失败。
  it('derives a stable V4 authorization header', async () => {
    const signed = await signFixed()

    expect(signed.xDate).toBe('20240102T030405Z')
    expect(signed.bodyHash).toBe('5b531d1f4a82214c5a0af857be50e3c162e19dbc2ba1ef04a591f5432ed3dc15')
    expect(signed.authorization).toBe(
      'HMAC-SHA256 Credential=ak-id/20240102/cn-north-1/translate/request, '
      + 'SignedHeaders=content-type;host;x-content-sha256;x-date, '
      + 'Signature=e564375a6e199743f85a5faea70a5c10e19deeaf155c7b30943a18a4e2e3d6b9',
    )
  })

  it('normalizes whitespace around credentials before signing', async () => {
    const clean = await signFixed()
    const messy = await signFixed(' ak-id\n', 'secret-key \n', ' cn-north-1 ')

    expect(messy.authorization).toBe(clean.authorization)
  })

  it('maps the traditional Chinese target to zh-Hant', () => {
    expect(volcengineTargetCode('繁體中文')).toBe('zh-Hant')
    expect(volcengineTargetCode('简体中文')).toBe('zh')
  })
})

describe('target language mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('maps the expanded target languages per provider', () => {
    expect(baiduTargetCode('Tiếng Việt')).toBe('vie')
    expect(baiduTargetCode('ไทย')).toBe('th')
    expect(volcengineTargetCode('ไทย')).toBe('th')
    expect(volcengineTargetCode('Tiếng Việt')).toBe('vi')
    expect(volcengineTargetCode('Bahasa Indonesia')).toBe('id')
  })

  it('rejects unsupported targets with an explicit provider error', () => {
    expect(() => baiduTargetCode('Bahasa Melayu')).toThrow('百度翻译不支持目标语言「Bahasa Melayu」')
    expect(() => volcengineTargetCode('Polski')).toThrow('火山引擎不支持目标语言「Polski」')
  })

  it('fails a scheme locally when it cannot handle the target language', async () => {
    await expect(translateWithScheme(deeplScheme, 'hello', 'ไทย')).rejects.toThrow('DeepL 不支持目标语言「ไทย」')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('translates with a Google target code for every listed language', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([[['สวัสดี']]]))

    await expect(translateWithScheme(googleScheme, 'hello', 'ไทย')).resolves.toEqual({ kind: 'text', text: 'สวัสดี' })

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('tl=th')
  })

  it('falls through a provider-unsupported target to the next scheme', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([[['hai']]]))

    const settings = settingsWithSchemes([baiduScheme, googleScheme])
    // 百度不支持马来语：本地抛错顺延到 Google，不发出必然失败的百度请求
    settings.targetLanguage = 'Bahasa Melayu'

    await expect(runTranslation('hello', settings)).resolves.toEqual({ kind: 'text', text: 'hai' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('tl=ms')
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

  it('signs Baidu AI requests with model_type against the aiTextTranslate endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ trans_result: [{ src: 'hello', dst: '你好' }] }))
    const scheme: SchemeSettings = { id: 'baidu-ai-1', type: 'baiduAi', enabled: true, appId: 'app-id', secretKey: 'secret-key', modelType: 'llm' }

    await expect(translateWithScheme(scheme, 'hello', '简体中文')).resolves.toEqual({ kind: 'text', text: '你好' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://fanyi-api.baidu.com/ait/api/aiTextTranslate')
    const body = new URLSearchParams(String(requestInit(0).body))
    expect(body.get('model_type')).toBe('llm')
    expect(body.get('to')).toBe('zh')
    const salt = body.get('salt') ?? ''
    expect(body.get('sign')).toBe(createBaiduSignature('app-id', 'hello', salt, 'secret-key'))
  })

  it('signs Volcengine requests and parses translated segments', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ TranslationList: [{ Translation: '你好' }, { Translation: '世界' }] }))

    await expect(translateWithScheme(volcengineScheme, 'hello world', '简体中文')).resolves.toEqual({ kind: 'text', text: '你好\n世界' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://translate.volcengineapi.com/?Action=TranslateText&Version=2020-06-01')
    const headers = new Headers(requestInit(0).headers)
    expect(headers.get('authorization')).toMatch(/^HMAC-SHA256 Credential=ak-id\/\d{8}\/cn-north-1\/translate\/request, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=[a-f0-9]{64}$/)
    // 签名值与实发值必须一致，否则网关重建 CanonicalHeaders 会报 SignatureDoesNotMatch。
    expect(headers.get('content-type')).toBe('application/json')
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

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/v1/chat/completions')
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
    // 单词池保持启用：中止发生在池的首个在途请求上（与真实划词路径一致）
    const pending = runTranslation('hello', settingsWithSchemes([deeplScheme, googleScheme], { wordPool: true }), controller.signal)

    controller.abort(new DOMException('Cancelled', 'AbortError'))

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('queries single words through the word pool even without any scheme', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([
      {
        pronunciations: [{ type: 'ipa', text: '/həˈloʊ/' }],
        partOfSpeech: 'int.',
        senses: [{ translations: [{ language: { code: 'zh' }, word: '你好' }] }],
      },
    ]))

    const settings = settingsWithSchemes([], { wordPool: true })
    settings.word.sources = { youdao: false, bing: false, google: false, freedictionaryapi: true }

    const outcome = await runTranslation('hello', settings)

    expect(outcome).toEqual({
      kind: 'dictionary',
      result: {
        pronunciation: '/həˈloʊ/',
        meanings: [{ partOfSpeech: 'int.', translations: ['你好'] }],
      },
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://freedictionaryapi.com/api/v1/entries/en/hello?translations=true')
  })

  it('routes single words through the word pool without touching schemes when the pool is enabled', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      ec: {
        word: [
          {
            usphone: 'lʌvd',
            ukphone: 'lʌvd',
            trs: [{ tr: [{ l: { i: ['v. 爱，热爱（love 的过去式和过去分词）'] } }] }],
          },
        ],
      },
    }))

    const settings = settingsWithSchemes([deeplScheme], { wordPool: true })
    settings.word.sources = { youdao: true, bing: false, google: false, freedictionaryapi: true }

    const outcome = await runTranslation('loved', settings, undefined, {
      // freedictionaryapi 置 false：四源平级后组内随机，用探测固定 youdao 打头
      probe: { checkedAt: 1, results: { youdao: true, bing: false, google: false, freedictionaryapi: false } },
    })

    expect(outcome).toEqual({
      kind: 'dictionary',
      result: {
        pronunciation: '/lʌvd/',
        meanings: [{ partOfSpeech: 'v.', translations: ['爱，热爱（love 的过去式和过去分词）'] }],
      },
    })
    // 只打了一个请求：有道命中后立即返回，方案（DeepL）从未被调用
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://dict.youdao.com/jsonapi?q=loved')
  })

  it('falls back to the configured scheme after every word pool source fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ translations: [{ text: '你好' }] }))

    const settings = settingsWithSchemes([deeplScheme], { wordPool: true })
    settings.word.sources = { youdao: true, bing: false, google: false, freedictionaryapi: true }

    const outcome = await runTranslation('loved', settings)

    expect(outcome).toEqual({ kind: 'text', text: '你好' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe('https://api-free.deepl.com/v2/translate')
  })

  it('reports the pool error when all sources fail and no scheme exists', async () => {
    fetchMock.mockResolvedValue(new Response('down', { status: 503 }))

    const settings = settingsWithSchemes([], { wordPool: true })
    settings.word.sources = { youdao: true, bing: false, google: false, freedictionaryapi: true }

    await expect(runTranslation('loved', settings)).rejects.toThrow('单词翻译失败：HTTP 503')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to the scheme when no word source is enabled at all', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ translations: [{ text: '你好' }] }))

    const settings = settingsWithSchemes([deeplScheme], { wordPool: true })
    settings.word.sources = { youdao: false, bing: false, google: false, freedictionaryapi: false }

    const outcome = await runTranslation('loved', settings)

    expect(outcome).toEqual({ kind: 'text', text: '你好' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api-free.deepl.com/v2/translate')
  })

  it('does not use the dictionary fallback for multi-word text', async () => {
    await expect(runTranslation('hello world', settingsWithSchemes([]))).rejects.toThrow('请先在设置中添加翻译方案')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves the scheme error when a scheme was attempted', async () => {
    fetchMock.mockResolvedValue(new Response('error', { status: 500 }))

    await expect(runTranslation('hello world', settingsWithSchemes([deeplScheme]))).rejects.toThrow('HTTP 500')
  })

  it('prefers the scheme error over the word pool failure for single words', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('deepl')) return new Response('unauthorized', { status: 401 })
      return new Response('not found', { status: 404 })
    })

    await expect(runTranslation('hello', settingsWithSchemes([deeplScheme]))).rejects.toThrow('HTTP 401')
    // 源全部禁用：池让位时不发请求，只有 DeepL 的 1 次调用
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('records word-pool hits through the usage sink', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([
      {
        pronunciations: [{ type: 'ipa', text: '/həˈloʊ/' }],
        partOfSpeech: 'int.',
        senses: [{ translations: [{ language: { code: 'zh' }, word: '你好' }] }],
      },
    ]))

    const settings = settingsWithSchemes([], { wordPool: true })
    settings.word.sources = { youdao: false, bing: false, google: false, freedictionaryapi: true }

    const onSentence = vi.fn()
    const onWord = vi.fn()
    await runTranslation('hello', settings, undefined, undefined, { onSentence, onWord })

    // 单词命中：只记单词用量（'hello' 共 5 字符），方案用量不动
    expect(onWord).toHaveBeenCalledTimes(1)
    expect(onWord).toHaveBeenCalledWith(5)
    expect(onSentence).not.toHaveBeenCalled()
  })

  it('records only the winning scheme through the usage sink', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([[['你好']]]))

    const onSentence = vi.fn()
    const outcome = await runTranslation('hello world', settingsWithSchemes([deeplScheme, googleScheme]), undefined, undefined, { onSentence })

    expect(outcome).toEqual({ kind: 'text', text: '你好' })
    // 记在成功的 Google 方案头上；失败的 DeepL 与重试次数都不额外计数
    expect(onSentence).toHaveBeenCalledTimes(1)
    expect(onSentence).toHaveBeenCalledWith('google-1', 11)
  })

  it('records only the scheme after every word pool source fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ translations: [{ text: '你好' }] }))

    const settings = settingsWithSchemes([deeplScheme], { wordPool: true })
    settings.word.sources = { youdao: true, bing: false, google: false, freedictionaryapi: true }

    const onSentence = vi.fn()
    const onWord = vi.fn()
    await runTranslation('loved', settings, undefined, undefined, { onSentence, onWord })

    // 池全败不算用量，最终由方案兜底成功时计一次
    expect(onWord).not.toHaveBeenCalled()
    expect(onSentence).toHaveBeenCalledTimes(1)
    expect(onSentence).toHaveBeenCalledWith('deepl-1', 5)
  })

  it('does not record usage when the whole chain fails', async () => {
    fetchMock.mockResolvedValue(new Response('error', { status: 500 }))

    const onSentence = vi.fn()
    await expect(runTranslation('hello world', settingsWithSchemes([deeplScheme]), undefined, undefined, { onSentence }))
      .rejects.toThrow('HTTP 500')

    expect(onSentence).not.toHaveBeenCalled()
  })
})

describe('方案失败冷却', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // DeepL 恒失败、Google 恒成功：用于观测方案链的调用顺序与次数
  const gateDeepL = async (url: string): Promise<Response> =>
    url.includes('deepl') ? new Response('down', { status: 500 }) : jsonResponse([[['你好']]])

  it('失败的方案在冷却期内被跳过', async () => {
    fetchMock.mockImplementation(gateDeepL)
    const settings = settingsWithSchemes([deeplScheme, googleScheme])

    // 第一次：DeepL 失败进入冷却，Google 兜底成功
    await expect(runTranslation('hello world', settings)).resolves.toEqual({ kind: 'text', text: '你好' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // 第二次：DeepL 仍在冷却 → 只打 Google
    fetchMock.mockClear()
    await expect(runTranslation('hello world', settings)).resolves.toEqual({ kind: 'text', text: '你好' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('translate_a/single')
  })

  it('只有一个方案时失败也不跳过，按原逻辑照常调用', async () => {
    fetchMock.mockResolvedValue(new Response('down', { status: 500 }))
    const settings = settingsWithSchemes([deeplScheme])

    await expect(runTranslation('hello world', settings)).rejects.toThrow('HTTP 500')
    await expect(runTranslation('hello world', settings)).rejects.toThrow('HTTP 500')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('全部方案都在冷却时回退原逻辑，逐个照常调用', async () => {
    fetchMock.mockResolvedValue(new Response('down', { status: 500 }))
    const settings = settingsWithSchemes([deeplScheme, googleScheme])

    await expect(runTranslation('hello world', settings)).rejects.toThrow('HTTP 500')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // 过滤后为空（全部冷却）→ 回退原候选，不再跳过
    fetchMock.mockClear()
    await expect(runTranslation('hello world', settings)).rejects.toThrow('HTTP 500')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('方案成功后清除冷却，后续重新参与调用', async () => {
    fetchMock.mockImplementation(gateDeepL)
    const settings = settingsWithSchemes([deeplScheme, googleScheme])
    await runTranslation('hello world', settings)

    // 单方案（候选不足 2 个，不跳过）成功 → 清除 DeepL 的冷却
    fetchMock.mockImplementation(async () => jsonResponse({ translations: [{ text: '你好' }] }))
    await runTranslation('hello world', settingsWithSchemes([deeplScheme]))

    fetchMock.mockClear()
    await runTranslation('hello world', settings)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api-free.deepl.com/v2/translate')
  })

  it('冷却到期后方案重新参与调用', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    fetchMock.mockImplementation(gateDeepL)
    const settings = settingsWithSchemes([deeplScheme, googleScheme])
    await runTranslation('hello world', settings)

    // 冷却期内：只打 Google
    fetchMock.mockClear()
    await runTranslation('hello world', settings)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 超过 10 分钟：DeepL 重新参与
    vi.setSystemTime(new Date('2026-01-01T00:11:00Z'))
    fetchMock.mockClear()
    await runTranslation('hello world', settings)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('冷却期内手动测试成功清除冷却，下次翻译重新调用该方案', async () => {
    fetchMock.mockImplementation(gateDeepL)
    const settings = settingsWithSchemes([deeplScheme, googleScheme])

    // 第一次：DeepL 失败进入冷却
    await runTranslation('hello world', settings)

    // 冷却期内：DeepL 被跳过，只打 Google
    fetchMock.mockClear()
    await runTranslation('hello world', settings)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 用户手动测试成功 → 经 translateWithScheme 自动清除 DeepL 冷却
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(jsonResponse({ translations: [{ text: 'ok' }] }))
    await translateWithScheme(deeplScheme, 'hello', '简体中文')
    fetchMock.mockImplementation(gateDeepL)

    // 再次翻译：DeepL 重新排在首位参与调用
    fetchMock.mockClear()
    await runTranslation('hello world', settings)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api-free.deepl.com/v2/translate')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('手动测试失败也进入冷却，下次翻译跳过该方案', async () => {
    fetchMock.mockImplementation(gateDeepL)
    const settings = settingsWithSchemes([deeplScheme, googleScheme])

    // 手动测试 DeepL：失败 → 由 translateWithScheme 记入冷却
    await expect(translateWithScheme(deeplScheme, 'hello', '简体中文')).rejects.toThrow('HTTP 500')

    // 随后翻译：DeepL 被跳过，只打 Google
    fetchMock.mockClear()
    await expect(runTranslation('hello world', settings)).resolves.toEqual({ kind: 'text', text: '你好' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('deepl')
  })
})
