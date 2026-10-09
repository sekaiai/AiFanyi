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

describe('interaction controller', () => {
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

  /** 挂载交互控制器（hoverDelayMs=0），原生控件相关用例共用。 */
  function mountInteraction(send: (text: string, requestId: number, signal: AbortSignal) => Promise<ExtensionResponse>): void {
    const settings = cloneDefaultSettings()
    settings.hoverDelayMs = 0
    renderer = createRenderer()
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
  }

  it('translates a word selected inside a button', async () => {
    vi.useFakeTimers()
    const send = vi.fn().mockResolvedValue(dictionaryResponse())
    mountInteraction(send)
    const text = document.createTextNode('beautiful')
    const button = document.createElement('button')
    button.append(text)
    document.body.append(button)

    selectText(text)
    await vi.runAllTimersAsync()

    expect(send.mock.calls[0]?.[0]).toBe('beautiful')
    button.remove()
  })

  it('reads a selection made inside a text input control', async () => {
    vi.useFakeTimers()
    const send = vi.fn().mockResolvedValue(dictionaryResponse())
    mountInteraction(send)
    const input = document.createElement('input')
    input.value = 'beautiful'
    document.body.append(input)
    input.focus()
    input.setSelectionRange(0, 9)

    input.dispatchEvent(new MouseEvent('mouseup'))
    await vi.runAllTimersAsync()

    expect(send.mock.calls[0]?.[0]).toBe('beautiful')
    input.remove()
  })

  it('reads a keyboard selection inside a textarea via captured selectionchange', async () => {
    vi.useFakeTimers()
    const send = vi.fn().mockResolvedValue(dictionaryResponse())
    mountInteraction(send)
    const textarea = document.createElement('textarea')
    textarea.value = 'Learning another language'
    document.body.append(textarea)
    textarea.focus()
    textarea.setSelectionRange(0, textarea.value.length)

    // 控件内部 selectionchange 以控件为 target 且不冒泡，只有 capture 监听能收到
    textarea.dispatchEvent(new Event('selectionchange'))
    await vi.runAllTimersAsync()

    expect(send.mock.calls[0]?.[0]).toBe('Learning another language')
    textarea.remove()
  })
})
