import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  lookupWord,
  parseBingPage,
  parseBingPronunciation,
  parseBingTranslation,
  parseGoogleTranslation,
  parseYoudaoMeaningLine,
  parseYoudaoResult,
  probeWordSources,
  resetWordSourceCooldown,
  selectSourceOrder,
  youdaoAudioUrl,
  type WordProbeState,
} from '../../src/core/word-sources'
import type { WordSourceId } from '../../src/core/types'

const fetchMock = vi.fn()

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  // mockReset（而非 clearAllMocks）：连 mockResolvedValueOnce 的排队值一起清掉，
  // 否则上一个用例没消费完的队列会泄漏到下一个用例。
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  // 失败冷却是模块级状态：每个用例前清空，避免用例间相互影响。
  resetWordSourceCooldown()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// 有道 jsonapi 的真实返回体（2026-09-12 抓取自 dict.youdao.com/jsonapi?q=loved）
const YOUDAO_LOVED = {
  ec: {
    word: [
      {
        usphone: 'lʌvd',
        ukphone: 'lʌvd',
        usspeech: 'gg:loved',
        ukspeech: 'gg:loved_1',
        trs: [
          { tr: [{ l: { i: ['v. 爱，热爱（love 的过去式和过去分词）'] } }] },
          { tr: [{ l: { i: ['adj. 受珍爱的，被爱的，心爱的（常作定语，如 loved ones 亲人）'] } }] },
        ],
        'return-phrase': { l: { i: 'loved' } },
        prototype: { word: 'love', phrase: [] },
      },
    ],
  },
}

describe('parseYoudaoResult', () => {
  it('解析真实返回体：英美音标与词性释义（音频改为点击朗读时懒加载，结果不再携带）', () => {
    const result = parseYoudaoResult(YOUDAO_LOVED, 'loved', 'us')

    expect(result.pronunciation).toBe('/lʌvd/')
    expect(result.meanings).toEqual([
      { partOfSpeech: 'v.', translations: ['爱，热爱（love 的过去式和过去分词）'] },
      { partOfSpeech: 'adj.', translations: ['受珍爱的，被爱的，心爱的（常作定语，如 loved ones 亲人）'] },
    ])
    expect('audioUrl' in result).toBe(false)
  })

  it('英音用 type=1 的音频', () => {
    expect(youdaoAudioUrl('loved', 'uk')).toBe('https://dict.youdao.com/dictvoice?audio=loved&type=1')
  })

  it('未收录的词抛错（由源池换下一个源）', () => {
    expect(() => parseYoudaoResult({}, 'zzzqqq', 'us')).toThrow('未收录')
  })

  it('解析无词性前缀的释义行', () => {
    expect(parseYoudaoMeaningLine('爱；喜欢')).toEqual({ partOfSpeech: '', translations: ['爱；喜欢'] })
    expect(parseYoudaoMeaningLine('v. 爱')).toEqual({ partOfSpeech: 'v.', translations: ['爱'] })
  })
})

describe('Bing 免密钥链路', () => {
  // 真实页面里 IG 是 _G 对象属性的冒号写法，AbusePrevention 的 key 是数字字面量
  const PAGE_HTML = '<script>var _G={IG:"D1A2B3C4D5E6487F"};params_AbusePreventionHelper=[1234567890123,"eyJ0IjoxMjM0NTY3ODkwMTIzfQ==",3600000];</script>'

  it('从 translator 页面解析 IG 与 AbusePrevention 参数', () => {
    expect(parseBingPage(PAGE_HTML)).toEqual({
      ig: 'D1A2B3C4D5E6487F',
      key: '1234567890123',
      token: 'eyJ0IjoxMjM0NTY3ODkwMTIzfQ==',
    })
  })

  it('缺 token 时直接抛错（会拿到 statusCode 205）', () => {
    expect(() => parseBingPage('<script>IG:"abc";</script>')).toThrow('解析失败')
  })

  it('解析 ttranslatev3 响应里的第一条译文', () => {
    expect(parseBingTranslation([
      { translations: [{ text: '被爱', to: 'zh-Hans' }], detectedLanguage: { language: 'en' } },
    ])).toBe('被爱')
    expect(() => parseBingTranslation([{ statusCode: 205 }])).toThrow('为空')
  })

  it('从词典页 meta description 抓口音音标', () => {
    const html = '<meta name="description" content="必应词典为您提供loved的释义，美[lʌv]，英[lʌv]，n. 爱；" />'
    expect(parseBingPronunciation(html, 'us')).toBe('[lʌv]')
    expect(parseBingPronunciation(html, 'uk')).toBe('[lʌv]')
    expect(parseBingPronunciation('<html></html>', 'us')).toBe('')
  })

  it('完整请求：先取页面参数，再带 token 发翻译', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(PAGE_HTML, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse([{ translations: [{ text: '被爱' }] }]))
      .mockResolvedValueOnce(new Response('<meta name="description" content="美[lʌv]，英[lʌv]" />', { status: 200 }))

    const result = await lookupWord('loved', { sources: ['bing'], targetLanguage: '简体中文', accent: 'us' })

    expect(result).toMatchObject({ pronunciation: '[lʌv]', meanings: [{ partOfSpeech: '', translations: ['被爱'] }] })
    const translateUrl = String(fetchMock.mock.calls[1]?.[0])
    expect(translateUrl).toContain('ttranslatev3')
    expect(translateUrl).toContain('IG=D1A2B3C4D5E6487F')
    const body = new URLSearchParams(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(body.get('token')).toBe('eyJ0IjoxMjM0NTY3ODkwMTIzfQ==')
    expect(body.get('to')).toBe('zh-Hans')
  })
})

describe('parseGoogleTranslation', () => {
  it('拼接分段译文', () => {
    expect(parseGoogleTranslation([[['你'], ['好，', null], ['世界']]])).toBe('你好，世界')
    expect(() => parseGoogleTranslation([[]])).toThrow('为空')
  })
})

describe('selectSourceOrder', () => {
  const ALL: WordSourceId[] = ['youdao', 'bing', 'google', 'freedictionaryapi']

  it('可用的在前、未检测的其次、失败的再次（四源平级，组内随机）', () => {
    const probe: WordProbeState = { checkedAt: 1, results: { youdao: true, bing: false, google: true } }
    const order = selectSourceOrder(ALL, probe)
    // freedictionaryapi 未检测 → 中间组；bing 探测失败 → 最后组
    expect(order[3]).toBe('bing')
    expect(order[2]).toBe('freedictionaryapi')
    expect(order.slice(0, 2).sort()).toEqual(['google', 'youdao'])
  })

  it('同组内随机（多源同组时不能保证原顺序）', () => {
    const probe: WordProbeState = { checkedAt: 1, results: { youdao: false, bing: false, google: false } }
    const order = selectSourceOrder(ALL, probe)
    // freedictionaryapi 未检测 → 唯一的中间组，排最前；其余三个失败组随机
    expect(order[0]).toBe('freedictionaryapi')
    expect([...order.slice(1)].sort()).toEqual(['bing', 'google', 'youdao'])
  })

  it('无探测数据时全部视为未检测，整体随机', () => {
    const order = selectSourceOrder(ALL, null)
    expect(order).toHaveLength(4)
    expect([...order].sort()).toEqual([...ALL].sort())
  })

  it('只传一个源时就返回它自己', () => {
    expect(selectSourceOrder(['youdao'], null)).toEqual(['youdao'])
  })
})

describe('lookupWord', () => {
  it('按顺序换源：第一个失败后落到下一个', async () => {
    fetchMock
      // 有道：未收录
      .mockResolvedValueOnce(jsonResponse({}))
      // freedictionaryapi 兜底
      .mockResolvedValueOnce(jsonResponse([
        {
          pronunciations: [{ type: 'ipa', text: '/həˈloʊ/' }],
          partOfSpeech: 'int.',
          senses: [{ translations: [{ language: { code: 'zh' }, word: '你好' }] }],
        },
      ]))

    const result = await lookupWord('hello', {
      sources: ['youdao', 'freedictionaryapi'],
      targetLanguage: '简体中文',
      accent: 'us',
      // 四源平级后组内是随机的：用探测把 youdao 固定到第一位，mock 队列才有确定顺序
      probe: { checkedAt: 1, results: { youdao: true, freedictionaryapi: false } },
    })

    expect(result.pronunciation).toBe('/həˈloʊ/')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('全部失败时抛「单词翻译失败」并带上最后一个错误', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 503 }))

    await expect(lookupWord('hello', { sources: ['google', 'freedictionaryapi'], targetLanguage: '简体中文', accent: 'us' }))
      .rejects.toThrow('单词翻译失败：HTTP 503')
  })

  it('探测结果为 false 的源仍会被尝试（只是排后）', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(YOUDAO_LOVED))

    const result = await lookupWord('loved', {
      sources: ['youdao'],
      targetLanguage: '简体中文',
      accent: 'us',
      probe: { checkedAt: 1, results: { youdao: false } },
    })

    // 唯一源探测为 false 仍发起了请求并成功返回（pronunciation 来自有道解析）
    expect(result.pronunciation).toBe('/lʌvd/')
  })
})

describe('probeWordSources', () => {
  it('逐源探测且永不 reject，成功源附带探测耗时', async () => {
    // 四源并行探测：每次调用都要给新的 Response（响应体只能读一次，共享实例会让其余源必然失败）
    fetchMock.mockImplementation(async () => jsonResponse(YOUDAO_LOVED))

    const state = await probeWordSources()

    expect(Object.keys(state.results).sort()).toEqual(['bing', 'freedictionaryapi', 'google', 'youdao'])
    expect(state.checkedAt).toBeGreaterThan(0)
    // mock 返回体只有 youdao 认可：成功源必有耗时，失败的源不带 latency
    expect(state.results.youdao).toBe(true)
    expect(state.latency?.youdao).toBeGreaterThanOrEqual(0)
    for (const [source, ok] of Object.entries(state.results)) {
      if (ok) expect(state.latency?.[source as WordSourceId]).toBeGreaterThanOrEqual(0)
      else expect(state.latency?.[source as WordSourceId]).toBeUndefined()
    }
  })
})

describe('单词源失败冷却', () => {
  // 有道恒失败、freedictionaryapi 恒成功：用于观测源池的调用顺序与次数
  const gateYoudao = async (url: string): Promise<Response> =>
    url.includes('youdao') ? new Response('down', { status: 503 }) : jsonResponse([
      {
        pronunciations: [{ type: 'ipa', text: '/həˈloʊ/' }],
        partOfSpeech: 'int.',
        senses: [{ translations: [{ language: { code: 'zh' }, word: '你好' }] }],
      },
    ])

  // 探测把 youdao 固定到第一位（组内随机），mock 调用顺序才有确定性
  const probe: WordProbeState = { checkedAt: 1, results: { youdao: true, freedictionaryapi: false } }
  const options = { sources: ['youdao', 'freedictionaryapi'] as WordSourceId[], targetLanguage: '简体中文', accent: 'us' as const, probe }

  it('失败的源在冷却期内被跳过', async () => {
    fetchMock.mockImplementation(gateYoudao)

    // 第一次：youdao 失败进入冷却，freedictionaryapi 兜底成功
    await expect(lookupWord('hello', options)).resolves.toMatchObject({ pronunciation: '/həˈloʊ/' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // 第二次：youdao 仍在冷却 → 只打 freedictionaryapi
    fetchMock.mockClear()
    await expect(lookupWord('hello', options)).resolves.toMatchObject({ pronunciation: '/həˈloʊ/' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('freedictionaryapi.com')
  })

  it('只有一个源时失败也不跳过，按原逻辑照常调用', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 503 }))

    await expect(lookupWord('hello', { sources: ['google'], targetLanguage: '简体中文', accent: 'us' })).rejects.toThrow('单词翻译失败：HTTP 503')
    await expect(lookupWord('hello', { sources: ['google'], targetLanguage: '简体中文', accent: 'us' })).rejects.toThrow('单词翻译失败：HTTP 503')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('全部源都在冷却时回退原逻辑，逐个照常调用', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 503 }))

    await expect(lookupWord('hello', options)).rejects.toThrow('单词翻译失败：HTTP 503')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // 过滤后为空（全部冷却）→ 回退原候选，不再跳过
    fetchMock.mockClear()
    await expect(lookupWord('hello', options)).rejects.toThrow('单词翻译失败：HTTP 503')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('冷却中的源经单源调用成功后清除冷却，后续重新参与', async () => {
    fetchMock.mockImplementation(gateYoudao)
    await lookupWord('hello', options)

    // 单源（候选不足 2 个，不跳过）成功 → 清除 youdao 的冷却
    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(jsonResponse(YOUDAO_LOVED))
    await lookupWord('loved', { sources: ['youdao'], targetLanguage: '简体中文', accent: 'us' })

    // 再次双源查询：youdao 重新排首位并被调用
    fetchMock.mockClear()
    fetchMock.mockImplementation(gateYoudao)
    await expect(lookupWord('hello', options)).resolves.toMatchObject({ pronunciation: '/həˈloʊ/' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('dict.youdao.com')
  })

  it('冷却到期后源重新参与调用', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    fetchMock.mockImplementation(gateYoudao)
    await lookupWord('hello', options)

    // 冷却期内：只打 freedictionaryapi
    fetchMock.mockClear()
    await lookupWord('hello', options)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 超过 10 分钟：youdao 重新参与
    vi.setSystemTime(new Date('2026-01-01T00:11:00Z'))
    fetchMock.mockClear()
    await lookupWord('hello', options)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
