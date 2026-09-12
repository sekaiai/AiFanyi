import { browser } from 'wxt/browser'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import { getBounds, getBubblePlacement, getBubbleSizing } from '../src/core/bubble'
import { isSiteBlacklisted } from '../src/core/settings'
import { createBrowserSettingsStorage } from '../src/extension/storage'
import { classifySelection, getWordAtOffset, isIgnorableElement } from '../src/core/text'
import { createBubbleRenderer, type BubbleRenderer } from '../src/extension/renderer'
import type { ExtensionMessageResponse } from '../src/core/messages'
import type { TranslationSettings } from '../src/core/types'

const CLOSE_DELAY = 180
const SELECTION_DELAY = 90
const CACHE_LIMIT = 80

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  allFrames: true,
  matchAboutBlank: true,
  main(ctx) {
    void run(ctx)
  },
})

async function run(ctx: ContentScriptContext): Promise<void> {
  const storage = createBrowserSettingsStorage()
  let settings = await storage.load()
  const renderer = createBubbleRenderer(settings.bubble)
  const highlight = createHighlight()
  const cache = new Map<string, ExtensionMessageResponse>()
  let currentRange: Range | null = null
  let currentText = ''
  let currentKind: 'dictionary' | 'ai' | null = null
  let currentRequestId = ''
  let currentInteraction: 'hover' | 'selection' | null = null
  let hoveredTarget: { node: Text; start: number; end: number } | null = null
  let pointerDown = false
  let wordHovered = false
  let bubbleHovered = false
  let hoverTimer = 0
  let closeTimer = 0
  let selectionTimer = 0

  const unsubscribe = storage.subscribe((next) => {
    settings = next
    renderer.applySettings(settings.bubble)
    if (!isActive(settings)) close()
    else if (currentRange && renderer.isVisible()) position(renderer, settings, currentRange)
  })

  ctx.addEventListener(document, 'mousemove', (event) => {
    const pointerEvent = event as MouseEvent
    if (!isActive(settings) || !settings.hoverEnabled || pointerDown || hasActiveSelection()) {
      leaveHoverWord()
      return
    }
    if (renderer.root.contains(event.target as Node) || isIgnorableElement(event.target instanceof Element ? event.target : null)) {
      leaveHoverWord()
      return
    }
    const caret = getCaretFromPoint(pointerEvent.clientX, pointerEvent.clientY)
    if (!caret || !(caret.node instanceof Text) || isIgnorableElement(caret.node.parentElement)) {
      leaveHoverWord()
      return
    }
    const word = getWordAtOffset(caret.node.textContent ?? '', caret.offset)
    if (!word) {
      leaveHoverWord()
      return
    }
    const range = document.createRange()
    range.setStart(caret.node, word.start)
    range.setEnd(caret.node, word.end)
    const rect = range.getBoundingClientRect()
    if (!rect.width || !rect.height || pointerEvent.clientX < rect.left || pointerEvent.clientX > rect.right || pointerEvent.clientY < rect.top || pointerEvent.clientY > rect.bottom) {
      leaveHoverWord()
      return
    }
    wordHovered = true
    window.clearTimeout(closeTimer)
    if (hoveredTarget?.node === caret.node && hoveredTarget.start === word.start && hoveredTarget.end === word.end) return
    hoveredTarget = { node: caret.node, start: word.start, end: word.end }
    showHighlight(highlight, rect)
    window.clearTimeout(hoverTimer)
    hoverTimer = window.setTimeout(() => {
      if (!wordHovered || hoveredTarget?.node !== caret.node) return
      currentInteraction = 'hover'
      currentKind = 'dictionary'
      currentRange = range
      currentText = word.word
      void submit(renderer, settings, cache, 'dictionary', word.word, range)
    }, settings.hoverDelayMs)
  }, true)

  ctx.addEventListener(document, 'mousedown', () => {
    pointerDown = true
  }, true)

  ctx.addEventListener(document, 'mouseup', () => {
    pointerDown = false
    window.clearTimeout(selectionTimer)
    selectionTimer = window.setTimeout(handleSelection, SELECTION_DELAY)
  }, true)

  ctx.addEventListener(document, 'selectionchange', () => {
    window.clearTimeout(selectionTimer)
    selectionTimer = window.setTimeout(() => {
      if (!pointerDown) handleSelection()
    }, SELECTION_DELAY)
  })

  ctx.addEventListener(window, 'scroll', () => {
    if (currentInteraction === 'hover') close()
    else if (currentRange && renderer.isVisible()) position(renderer, settings, currentRange)
  }, true)

  ctx.addEventListener(window, 'resize', () => {
    if (currentRange && renderer.isVisible()) position(renderer, settings, currentRange)
  })

  ctx.addEventListener(document, 'keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape') {
      window.getSelection()?.removeAllRanges()
      close()
    }
  }, true)

  renderer.root.addEventListener('mouseenter', () => {
    bubbleHovered = true
    window.clearTimeout(closeTimer)
  })
  renderer.root.addEventListener('mouseleave', () => {
    bubbleHovered = false
    scheduleClose()
  })

  ctx.onInvalidated(() => {
    unsubscribe()
    highlight.remove()
    close()
    renderer.destroy()
  })

  function handleSelection(): void {
    if (!isActive(settings) || !settings.selectionEnabled) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      if (currentInteraction === 'selection') close()
      return
    }
    const range = selection.getRangeAt(0).cloneRange()
    const target = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
    if (isIgnorableElement(target)) return
    const action = classifySelection(selection.toString())
    if (action.type === 'empty') return
    window.clearTimeout(hoverTimer)
    hideHighlight(highlight)
    currentInteraction = 'selection'
    currentKind = action.type
    currentRange = range
    currentText = action.text
    void submit(renderer, settings, cache, action.type, action.text, range)
  }

  async function submit(
    activeRenderer: BubbleRenderer,
    activeSettings: TranslationSettings,
    activeCache: Map<string, ExtensionMessageResponse>,
    kind: 'dictionary' | 'ai',
    text: string,
    range: Range,
  ): Promise<void> {
    abortRequest()
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    currentRequestId = requestId
    const cacheKey = `${kind}:${text.toLowerCase()}`
    const cached = activeCache.get(cacheKey)
    if (cached) {
      renderResponse(activeRenderer, activeSettings, activeCache, cached, text, range)
      return
    }
    activeRenderer.showLoading(kind === 'dictionary' ? '正在查询释义...' : '正在翻译...', kind === 'dictionary' ? text : '')
    position(activeRenderer, activeSettings, range)
    const response = await browser.runtime.sendMessage({
      type: kind === 'dictionary' ? 'dictionary.lookup' : 'translation.request',
      requestId,
      text,
    }) as ExtensionMessageResponse
    if (response.requestId !== currentRequestId || text !== currentText) return
    if (response.ok) putCache(activeCache, cacheKey, response)
    renderResponse(activeRenderer, activeSettings, activeCache, response, text, range)
  }

  function renderResponse(
    activeRenderer: BubbleRenderer,
    activeSettings: TranslationSettings,
    activeCache: Map<string, ExtensionMessageResponse>,
    response: ExtensionMessageResponse,
    text: string,
    range: Range,
  ): void {
    if (!response.ok) {
      activeRenderer.showError(response.error.message, response.error.retryable && currentKind ? () => void submit(activeRenderer, activeSettings, activeCache, currentKind!, text, range) : undefined)
    } else if (response.kind === 'dictionary') {
      activeRenderer.showDictionary(text, response.result)
    } else if (response.kind === 'ai') {
      activeRenderer.showText(response.result)
    }
    position(activeRenderer, activeSettings, range)
  }

  function leaveHoverWord(): void {
    wordHovered = false
    hoveredTarget = null
    window.clearTimeout(hoverTimer)
    hideHighlight(highlight)
    if (currentInteraction === 'hover') scheduleClose()
  }

  function scheduleClose(): void {
    if (currentInteraction !== 'hover') return
    window.clearTimeout(closeTimer)
    closeTimer = window.setTimeout(() => {
      if (!wordHovered && !bubbleHovered) close()
    }, CLOSE_DELAY)
  }

  function close(): void {
    abortRequest()
    window.clearTimeout(hoverTimer)
    window.clearTimeout(closeTimer)
    currentRange = null
    currentText = ''
    currentKind = null
    currentInteraction = null
    hoveredTarget = null
    wordHovered = false
    renderer.hide()
    hideHighlight(highlight)
  }

  function abortRequest(): void {
    if (!currentRequestId) return
    void browser.runtime.sendMessage({ type: 'translation.cancel', requestId: currentRequestId })
    currentRequestId = ''
  }
}

function position(renderer: BubbleRenderer, settings: TranslationSettings, range: Range): void {
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width && rect.height)
  const fallback = range.getBoundingClientRect()
  const bounds = getBounds(rects.length ? rects : [fallback])
  const sizing = getBubbleSizing(bounds.right - bounds.left, window.innerWidth, settings.bubble.side)
  renderer.prepareForMeasure(sizing.minWidth, sizing.maxWidth)
  const rect = renderer.root.getBoundingClientRect()
  const placement = getBubblePlacement(bounds, rect.width, rect.height, window.innerWidth, window.innerHeight, settings.bubble)
  renderer.applyPlacement(placement)
}

function isActive(settings: TranslationSettings): boolean {
  return settings.enabled && !isSiteBlacklisted(location.href, settings.siteBlacklist)
}

function putCache(cache: Map<string, ExtensionMessageResponse>, key: string, response: ExtensionMessageResponse): void {
  cache.set(key, response)
  if (cache.size <= CACHE_LIMIT) return
  const first = cache.keys().next().value
  if (first) cache.delete(first)
}

function createHighlight(): HTMLSpanElement {
  const highlight = document.createElement('span')
  Object.assign(highlight.style, {
    position: 'fixed',
    zIndex: '2147483646',
    display: 'none',
    borderRadius: '3px',
    background: 'rgba(79,132,232,.22)',
    pointerEvents: 'none',
  })
  document.documentElement.append(highlight)
  return highlight
}

function showHighlight(highlight: HTMLElement, rect: DOMRect): void {
  Object.assign(highlight.style, {
    display: 'block',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  })
}

function hideHighlight(highlight: HTMLElement): void {
  highlight.style.display = 'none'
}

function hasActiveSelection(): boolean {
  const selection = window.getSelection()
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim())
}

function getCaretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
  }
  const position = document.caretPositionFromPoint?.(x, y)
  return position ? { node: position.offsetNode, offset: position.offset } : null
}
