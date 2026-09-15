import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleMessage, broadcastSettingsUpdate } from '../../entrypoints/background'
import { browser } from 'wxt/browser'
import { parseDictionaryResult, lookupDictionary } from '../../src/core/dictionary'
import { isExtensionMessage } from '../../src/core/messages'
import { cloneDefaultSettings, SETTINGS_STORAGE_KEY } from '../../src/core/settings'
import type { SchemeSettings } from '../../src/core/types'

const fetchMock = vi.fn()

describe('lookupDictionary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ meanings: [] }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  it('requests the fixed dictionary endpoint with the lowercased word', async () => {
    await lookupDictionary('Beautiful')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://freedictionaryapi.com/api/v1/entries/en/beautiful?translations=true')
  })

  it('throws when the dictionary endpoint returns an HTTP error', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }))

    await expect(lookupDictionary('missing')).rejects.toThrow('HTTP 404')
  })
})

describe('parseDictionaryResult', () => {
  it('extracts Chinese translations from sense translations', () => {
    const result = parseDictionaryResult({
      entries: [
        {
          pronunciations: [{ type: 'ipa', text: '/ˈkɑːntekst/' }],
          partOfSpeech: 'n.',
          senses: [
            {
              translations: [
                { language: { code: 'zh' }, word: '语境' },
                { language: 'cmn', text: '上下文' },
              ],
            },
          ],
        },
      ],
    })

    expect(result.meanings[0]).toEqual({ partOfSpeech: 'n.', translations: ['语境', '上下文'] })
  })
})

describe('isExtensionMessage', () => {
  it('accepts messages with a type and request id', () => {
    expect(isExtensionMessage({ type: 'translation.cancel', requestId: 'req-1' })).toBe(true)
  })

  it('rejects messages without a request id', () => {
    expect(isExtensionMessage({ type: 'translation.cancel' })).toBe(false)
  })
})

describe('handleMessage same-text merge', () => {
  const deeplScheme: SchemeSettings = { id: 'deepl-1', type: 'deepl', enabled: true, authKey: 'dl-key', endpoint: 'free' }

  function jsonResponse(): Response {
    return new Response(JSON.stringify({ translations: [{ text: '你好世界' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    const settings = cloneDefaultSettings()
    // 内置补回后默认链含 5 个免密方案：固定顺序确保夹具的 deepl 恒定优先被选中
    settings.schemeOrder = 'sequential'
    settings.schemes = [deeplScheme]
    await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings })
  })

  it('merges concurrent same-text requests into one upstream call', async () => {
    let release!: () => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => {
      release = () => resolve(jsonResponse())
    }))
    const first = handleMessage({ type: 'translation.request', requestId: 'req-1', text: 'hello world' })
    const second = handleMessage({ type: 'translation.request', requestId: 'req-2', text: 'hello world' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    release()
    const [firstResponse, secondResponse] = await Promise.all([first, second])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(firstResponse.requestId).toBe('req-1')
    expect(secondResponse.requestId).toBe('req-2')
    expect(secondResponse.ok).toBe(true)
  })

  it('keeps the shared upstream alive while another participant remains', async () => {
    let release!: () => void
    let signal: AbortSignal | null | undefined
    fetchMock.mockImplementationOnce((_url: unknown, init?: RequestInit) => new Promise<Response>((resolve) => {
      signal = init?.signal
      release = () => resolve(jsonResponse())
    }))
    const first = handleMessage({ type: 'translation.request', requestId: 'req-1', text: 'shared sentence here' })
    const second = handleMessage({ type: 'translation.request', requestId: 'req-2', text: 'shared sentence here' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const cancelResponse = await handleMessage({ type: 'translation.cancel', requestId: 'req-1' })
    expect(signal?.aborted).toBe(false)
    release()
    const [firstResponse, secondResponse] = await Promise.all([first, second])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(cancelResponse.ok).toBe(false)
    expect(firstResponse.ok).toBe(true)
    expect(secondResponse.ok).toBe(true)
  })

  it('aborts the shared upstream once the last participant cancels', async () => {
    let signal: AbortSignal | null | undefined
    fetchMock.mockImplementationOnce((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const first = handleMessage({ type: 'translation.request', requestId: 'req-1', text: 'last one leaves' })
    const second = handleMessage({ type: 'translation.request', requestId: 'req-2', text: 'last one leaves' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const cancelFirst = handleMessage({ type: 'translation.cancel', requestId: 'req-1' })
    const cancelSecond = handleMessage({ type: 'translation.cancel', requestId: 'req-2' })
    expect(signal?.aborted).toBe(true)
    const [firstResponse, secondResponse] = await Promise.all([first, second, cancelFirst, cancelSecond])
    expect(firstResponse.ok).toBe(false)
    expect(secondResponse.ok).toBe(false)
  })

  it('does not merge requests with different text', async () => {
    fetchMock.mockImplementation(async () => jsonResponse())
    const [first, second] = await Promise.all([
      handleMessage({ type: 'translation.request', requestId: 'req-1', text: 'first text' }),
      handleMessage({ type: 'translation.request', requestId: 'req-2', text: 'second text' }),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
  })
})

describe('broadcastSettingsUpdate', () => {
  function stubTabs(queryResult: unknown) {
    const tabs = {
      query: vi.fn().mockResolvedValue(queryResult),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    }
    ;(browser as unknown as { tabs: unknown }).tabs = tabs
    return tabs
  }

  it('delivers the public settings update to every tab', async () => {
    const tabs = stubTabs([{ id: 1 }, {}, { id: 3 }])
    const settings = cloneDefaultSettings()
    settings.enabled = false

    await broadcastSettingsUpdate(settings)

    expect(tabs.query).toHaveBeenCalledWith({})
    expect(tabs.sendMessage).toHaveBeenCalledTimes(2)
    expect(tabs.sendMessage.mock.calls.map((call) => call[0])).toEqual([1, 3])
    const message = tabs.sendMessage.mock.calls[0]?.[1] as { type: string; settings: { enabled: boolean } }
    expect(message.type).toBe('settings.public.update')
    expect(message.settings.enabled).toBe(false)
  })

  it('ignores per-tab delivery failures', async () => {
    const tabs = stubTabs([{ id: 1 }, { id: 2 }])
    tabs.sendMessage.mockImplementation((tabId: number) =>
      tabId === 1 ? Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')) : Promise.resolve())

    await expect(broadcastSettingsUpdate(cloneDefaultSettings())).resolves.toBeUndefined()
    expect(tabs.sendMessage).toHaveBeenCalledTimes(2)
  })
})
