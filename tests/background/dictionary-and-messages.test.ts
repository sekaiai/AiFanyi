import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDictionaryResult, lookupDictionary } from '../../src/core/dictionary'
import { isExtensionMessage } from '../../src/core/messages'
import { buildPrompt } from '../../src/core/prompt'

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
    const result = parseDictionaryResult('context', {
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

describe('buildPrompt', () => {
  it('replaces every text placeholder in the prompt template', () => {
    expect(buildPrompt('{text} => {text}', 'Hello')).toBe('Hello => Hello')
  })
})
