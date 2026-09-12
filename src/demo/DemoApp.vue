<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import SchemesSection from '../components/SchemesSection.vue'
import SettingsForm from '../components/SettingsForm.vue'
import { toDisplayError, type ExtensionResponse } from '../core/messages'
import { cloneDefaultSettings, type TranslationSettings } from '../core/settings'
import { classifySelection, getCaretFromPoint } from '../core/text'
import { runTranslation, translateWithScheme } from '../core/translate'
import { LruCache } from '../core/lru'
import { getBubblePlacement, getBubbleSizing } from '../core/bubble'
import { boundsFromRange, createBubbleRenderer } from '../extension/renderer'

const props = withDefaults(defineProps<{
  settings?: TranslationSettings
  showSettings?: boolean
  request?: (text: string, requestId: number) => Promise<ExtensionResponse>
}>(), {
  showSettings: true,
})

const localSettings = ref<TranslationSettings>(cloneDefaultSettings())
const settings = computed({
  get: () => props.settings ?? localSettings.value,
  set: (value: TranslationSettings) => {
    if (!props.settings) localSettings.value = value
  },
})
const status = shallowRef('演示设置仅保存在内存')
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

const handleSelectionChange = () => window.setTimeout(handleSelection, 0)
const handleViewportChange = () => {
  if (currentRange && renderer?.isVisible()) positionBubble(currentRange)
}

onMounted(() => {
  renderer = createBubbleRenderer(settings.value.bubble)
  document.addEventListener('selectionchange', handleSelectionChange)
  document.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('scroll', handleViewportChange, true)
  window.addEventListener('resize', handleViewportChange)
})

onUnmounted(() => {
  window.clearTimeout(hoverTimer)
  document.removeEventListener('selectionchange', handleSelectionChange)
  document.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('scroll', handleViewportChange, true)
  window.removeEventListener('resize', handleViewportChange)
  renderer?.destroy()
})

watch(settings, (value) => {
  renderer?.applySettings(value.bubble)
  if (currentRange && renderer?.isVisible()) positionBubble(currentRange)
  status.value = '演示设置已更新'
}, { deep: true })

function reset() {
  settings.value = cloneDefaultSettings()
}

async function testScheme(schemeId: string) {
  const scheme = settings.value.schemes.find((item) => item.id === schemeId)
  if (!scheme) throw new Error('未找到对应的翻译方案')
  status.value = '正在测试方案…'
  try {
    await translateWithScheme(scheme, 'AiFanyi connection test.', settings.value.targetLanguage)
    status.value = '方案连接可用'
    return '方案连接可用'
  } catch (error) {
    const message = toDisplayError(error).message
    status.value = message
    throw new Error(message)
  }
}

function handleSelection() {
  if (!settings.value.enabled || !settings.value.selectionEnabled) return
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
  const range = selection.getRangeAt(0).cloneRange()
  const target = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
  if (!target?.closest('#reading-area') || target.closest('pre, code, input, textarea, [contenteditable]')) return
  const action = classifySelection(selection.toString())
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
  const response = props.request
    ? await props.request(text, id)
    : await translationResponse(id, text)
  if (id !== activeRequest || text !== currentText) return
  cache.set(cacheKey, response)
  renderResponse(response, text, range)
}

async function translationResponse(id: number, text: string): Promise<ExtensionResponse> {
  try {
    const outcome = await runTranslation(text, settings.value)
    return outcome.kind === 'dictionary'
      ? { ok: true, requestId: id, kind: 'dictionary', result: outcome.result }
      : { ok: true, requestId: id, kind: 'text', result: outcome.text }
  } catch (error) {
    return { ok: false, requestId: id, error: toDisplayError(error) }
  }
}

function renderResponse(response: ExtensionResponse, sourceText: string, range: Range) {
  if (!renderer) return
  if (response.ok && response.kind === 'dictionary') renderer.showDictionary(sourceText, response.result)
  else if (response.ok && response.kind === 'text') renderer.showText(response.result)
  else if (!response.ok) renderer.showError(response.error.message, response.error.retryable ? () => void requestTranslation(classifySelection(sourceText).type === 'dictionary' ? 'dictionary' : 'ai', sourceText, range) : undefined)
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
</script>

<template>
  <div :class="showSettings ? 'app-shell' : 'demo-surface'">
    <main id="reading-area" class="demo-pane">
      <h1>翻译交互演示</h1>
      <p class="tip">悬停或选中单词查词典；选中多个词、句子或段落时按翻译方案顺序翻译。</p>
      <div class="reading-copy">
        <p>Someone you loved can sometimes become someone you remember forever. Beautiful memories often remain even after people disappear from our lives.</p>
        <p>Learning another language can help you understand different cultures and communicate with people around the world.</p>
        <p>Technology is changing the way people work, communicate and learn new things every day.</p>
        <p>同一页面里的英文单词也能查询，例如 API、cache 和 context。</p>
        <pre><code>const message = "代码区默认不触发翻译";</code></pre>
      </div>
    </main>
    <aside v-if="showSettings" class="settings-panel" aria-label="演示设置">
      <SettingsForm v-model="settings" :status="status" @reset="reset" />
      <SchemesSection v-model="settings.schemes" v-model:target-language="settings.targetLanguage" :test-scheme="testScheme" demo-mode />
    </aside>
  </div>
</template>
