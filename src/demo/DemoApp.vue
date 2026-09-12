<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import SettingsForm from '../components/SettingsForm.vue'
import type { ExtensionResponse } from '../core/messages'
import { cloneSettings, DEFAULT_SETTINGS, sanitizeSettings, validateAiEndpoint, type TranslationSettings } from '../core/settings'
import { classifyText } from '../core/text'
import { buildPrompt } from '../core/prompt'
import { DICTIONARY_API_BASE, parseDictionaryResult } from '../core/dictionary'
import { LruCache } from '../core/lru'
import { getBubblePlacement, getBubbleSizing } from '../core/bubble'
import { boundsFromRange, createBubbleRenderer } from '../extension/renderer'

const settings = ref<TranslationSettings>(cloneSettings())
const status = shallowRef('Demo 设置仅保存在内存')
const cache = new LruCache<string, ExtensionResponse>(80)
let renderer: ReturnType<typeof createBubbleRenderer> | null = null
let currentRange: Range | null = null
let currentText = ''
let requestId = 0
let activeRequest = 0
let hoverTimer = 0

const handleMouseMove = (event: MouseEvent) => {
  window.clearTimeout(hoverTimer)
  if (!settings.value.enabled || !settings.value.hoverEnabled || window.getSelection()?.toString().trim()) return
  const caret = getCaretFromPoint(event.clientX, event.clientY)
  if (!caret || !(caret.node instanceof Text)) return
  const target = caret.node.parentElement
  if (!target?.closest('#reading-area') || target.closest('pre, code, input, textarea, [contenteditable]')) return
  const text = caret.node.textContent ?? ''
  const match = Array.from(text.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g))
    .find((item) => caret.offset >= (item.index ?? 0) && caret.offset <= (item.index ?? 0) + item[0].length)
  if (!match || match.index === undefined) return
  const range = document.createRange()
  range.setStart(caret.node, match.index)
  range.setEnd(caret.node, match.index + match[0].length)
  const rect = range.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return
  hoverTimer = window.setTimeout(() => {
    currentRange = range
    currentText = match[0]
    void requestTranslation('dictionary', match[0], range)
  }, settings.value.hoverDelayMs)
}

onMounted(() => {
  renderer = createBubbleRenderer(settings.value.bubble)
  document.addEventListener('selectionchange', () => window.setTimeout(handleSelection, 0))
  document.addEventListener('mousemove', handleMouseMove)
})

onUnmounted(() => {
  window.clearTimeout(hoverTimer)
  document.removeEventListener('mousemove', handleMouseMove)
  renderer?.destroy()
})

watch(settings, (value) => {
  settings.value = sanitizeSettings(value)
  renderer?.applySettings(settings.value.bubble)
  if (currentRange && renderer?.isVisible()) positionBubble(currentRange)
  status.value = 'Demo 设置已更新'
}, { deep: true })

function reset() {
  settings.value = cloneSettings(DEFAULT_SETTINGS)
}

async function testAi() {
  status.value = '正在测试 AI…'
  const response = await translateWithAi(Date.now(), 'hello')
  status.value = response.ok ? 'AI 连接可用' : response.error.message
  if (!response.ok) throw new Error(response.error.message)
  return 'AI 连接可用'
}

function handleSelection() {
  if (!settings.value.enabled || !settings.value.selectionEnabled) return
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
  const range = selection.getRangeAt(0).cloneRange()
  const target = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
  if (!target?.closest('#reading-area') || target.closest('pre, code, input, textarea, [contenteditable]')) return
  const action = classifyText(selection.toString())
  if (action.type === 'empty') return
  currentRange = range
  currentText = action.text
  void requestTranslation(action.type, action.text, range)
}

async function requestTranslation(kind: 'dictionary' | 'ai', text: string, range: Range) {
  if (!renderer) return
  const id = ++requestId
  activeRequest = id
  const cacheKey = `${kind}:${text.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached) {
    renderResponse(cached, text, range)
    return
  }
  renderer.showLoading(kind === 'dictionary' ? '正在查询释义…' : '正在翻译…', kind === 'dictionary' ? text : '')
  positionBubble(range)
  const response = kind === 'dictionary' ? await lookupDictionary(id, text) : await translateWithAi(id, text)
  if (id !== activeRequest || text !== currentText) return
  cache.set(cacheKey, response)
  renderResponse(response, text, range)
}

async function lookupDictionary(id: number, text: string): Promise<ExtensionResponse> {
  try {
    const response = await fetch(`${DICTIONARY_API_BASE}/entries/en/${encodeURIComponent(text.trim().toLowerCase())}?translations=true`)
    if (!response.ok) return { ok: false, requestId: id, error: { code: 'http', message: `词典查询失败：HTTP ${response.status}`, retryable: true } }
    return { ok: true, requestId: id, kind: 'dictionary', result: parseDictionaryResult(await response.json()) }
  } catch {
    return { ok: false, requestId: id, error: { code: 'network', message: '词典查询失败。', retryable: true } }
  }
}

async function translateWithAi(id: number, text: string): Promise<ExtensionResponse> {
  const ai = settings.value.ai
  const endpointError = validateAiEndpoint(ai.apiUrl)
  if (endpointError || !ai.apiKey || !ai.model) {
    return { ok: false, requestId: id, error: { code: 'bad_config', message: '请先填写可用的 AI 地址、API Key 和模型。', retryable: false } }
  }
  try {
    const response = await fetch(ai.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: 'user', content: buildPrompt(ai.prompt, text) }],
        temperature: 0.1,
        stream: false,
      }),
    })
    if (!response.ok) return { ok: false, requestId: id, error: { code: 'http', message: `AI 翻译失败：HTTP ${response.status}`, retryable: true } }
    const data = await response.json().catch(() => null)
    const result = data?.choices?.[0]?.message?.content
    if (typeof result !== 'string' || !result.trim()) return { ok: false, requestId: id, error: { code: 'empty', message: 'AI 返回内容为空。', retryable: true } }
    return { ok: true, requestId: id, kind: 'ai', result: result.trim() }
  } catch {
    return { ok: false, requestId: id, error: { code: 'network', message: 'AI 翻译失败。', retryable: true } }
  }
}

function renderResponse(response: ExtensionResponse, sourceText: string, range: Range) {
  if (!renderer) return
  if (response.ok && response.kind === 'dictionary') renderer.showDictionary(sourceText, response.result)
  else if (response.ok && response.kind === 'ai') renderer.showText(response.result)
  else if (!response.ok) renderer.showError(response.error.message, response.error.retryable ? () => void requestTranslation(classifyText(sourceText).type === 'dictionary' ? 'dictionary' : 'ai', sourceText, range) : undefined)
  positionBubble(range)
}

function positionBubble(range: Range) {
  if (!renderer) return
  const bounds = boundsFromRange(range)
  if (!bounds) return
  const sizing = getBubbleSizing(bounds.right - bounds.left, window.innerWidth, settings.value.bubble.side)
  renderer.prepareForMeasure(sizing.minWidth, sizing.maxWidth)
  const rect = renderer.root.getBoundingClientRect()
  const placement = getBubblePlacement(bounds, rect.width, rect.height, window.innerWidth, window.innerHeight, settings.value.bubble)
  renderer.applyPlacement(placement)
}

function getCaretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
  }
  const position = document.caretPositionFromPoint?.(x, y)
  return position ? { node: position.offsetNode, offset: position.offset } : null
}
</script>

<template>
  <div class="app-shell">
    <main id="reading-area" class="demo-pane">
      <h1>Translation Demo</h1>
      <p class="tip">悬停或选中单词查词典；选中多个词、句子或段落自动使用 AI。</p>
      <div class="reading-copy">
        <p>Someone you loved can sometimes become someone you remember forever. Beautiful memories often remain even after people disappear from our lives.</p>
        <p>Learning another language can help you understand different cultures and communicate with people around the world.</p>
        <p>Technology is changing the way people work, communicate and learn new things every day.</p>
        <p>同一页面里的英文单词也能查询，例如 API、cache 和 context。</p>
        <pre><code>const message = "代码区默认不触发翻译";</code></pre>
      </div>
    </main>
    <aside class="settings-panel" aria-label="Demo 设置">
      <SettingsForm v-model="settings" :status="status" :test-ai="testAi" demo-mode @reset="reset" />
    </aside>
  </div>
</template>
