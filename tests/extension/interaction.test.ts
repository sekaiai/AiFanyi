import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneDefaultSettings } from '../../src/core/settings'
import { createInteraction } from '../../src/extension/interaction'
import type { BubbleRenderer } from '../../src/extension/renderer'
import type { ExtensionResponse } from '../../src/core/messages'
import type { TranslationSettings } from '../../src/core/types'

function createRenderer(): BubbleRenderer & { hide: ReturnType<typeof vi.fn> } {
  const container = document.createElement('div')
  const root = document.createElement('div')
  const content = document.createElement('div')
  container.append(root)
  document.body.append(container)
  let visible = false
  return {
    root,
    container,
    content,
    showLoading: () => { visible = true },
    showDictionary: () => {},
    showText: () => {},
    showError: () => {},
    prepareForMeasure: () => {},
    applyPlacement: () => {},
    applySettings: () => {},
    hide: vi.fn(() => { visible = false }),
    destroy: () => container.remove(),
    isVisible: () => visible,
  }
}

function selectText(node: Text): void {
  const range = document.createRange()
  range.selectNodeContents(node)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
}

function dictionaryResponse(): ExtensionResponse {
  return { ok: true, requestId: 1, kind: 'dictionary', result: { pronunciation: '', meanings: [] } }
}

describe('settings updates in the interaction controller', () => {
  let interaction: ReturnType<typeof createInteraction> | null = null
  let renderer: ReturnType<typeof createRenderer> | null = null

  afterEach(() => {
    interaction?.destroy()
    renderer?.destroy()
    interaction = null
    renderer = null
    window.getSelection()?.removeAllRanges()
    vi.useRealTimers()
  })

  it('clears a cached translation after the target language changes', async () => {
    vi.useFakeTimers()
    let settings: TranslationSettings = cloneDefaultSettings()
    settings.hoverDelayMs = 0
    renderer = createRenderer()
    const send = vi.fn().mockResolvedValue(dictionaryResponse())
    interaction = createInteraction({
      getSettings: () => settings,
      renderer,
      highlight: document.createElement('div'),
      isActive: () => true,
      acceptHoverTarget: () => true,
      acceptSelectTarget: () => true,
      send,
      cancel: () => {},
    })
    interaction.start()
    const text = document.createTextNode('beautiful')
    document.body.append(text)

    selectText(text)
    await vi.runAllTimersAsync()
    expect(send).toHaveBeenCalledTimes(1)

    settings = { ...settings, targetLanguage: '日本語' }
    interaction.updateSettings(settings)
    selectText(text)
    await vi.runAllTimersAsync()

    expect(send).toHaveBeenCalledTimes(2)
    text.remove()
  })

  it('cancels a pending translation when settings change', async () => {
    vi.useFakeTimers()
    let settings = cloneDefaultSettings()
    settings.hoverDelayMs = 0
    renderer = createRenderer()
    let signal: AbortSignal | undefined
    interaction = createInteraction({
      getSettings: () => settings,
      renderer,
      highlight: document.createElement('div'),
      isActive: () => true,
      acceptHoverTarget: () => true,
      acceptSelectTarget: () => true,
      send: (_text, _requestId, nextSignal) => {
        signal = nextSignal
        return new Promise<ExtensionResponse>(() => {})
      },
      cancel: () => {},
    })
    interaction.start()
    const text = document.createTextNode('beautiful')
    document.body.append(text)

    selectText(text)
    await vi.runAllTimersAsync()
    interaction.updateSettings({ ...settings, targetLanguage: '日本語' })

    expect(signal?.aborted).toBe(true)
    expect(renderer.hide).toHaveBeenCalled()
    text.remove()
  })
})
