<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import SchemesSection from '../components/SchemesSection.vue'
import SettingsForm from '../components/SettingsForm.vue'
import WordSourcesCard from '../components/WordSourcesCard.vue'
import GeneralSection from '../components/GeneralSection.vue'
import { toDisplayError, type ExtensionResponse } from '../core/messages'
import { cloneDefaultSettings, resetToDefaults, type TranslationSettings } from '../core/settings'
import { runTranslation, SCHEME_TEST_PHRASE, translateWithScheme } from '../core/translate'
import type { SchemeSettings } from '../core/types'
import { createHighlight } from '../extension/highlight'
import { createInteraction } from '../extension/interaction'
import { createBubbleRenderer } from '../extension/renderer'
import { provideUiLocale } from '../composables/useUiLocale'

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
const { t } = provideUiLocale(computed(() => settings.value.uiLocale))
const status = shallowRef(t('demo.memoryOnly'))
let interaction: ReturnType<typeof createInteraction> | null = null

onMounted(() => {
  const renderer = createBubbleRenderer(settings.value.bubble)
  const highlight = createHighlight()
  // 交互状态机与扩展端 content script 共享，这里只注入演示页差异：
  // 限定 #reading-area 生效 + 直连翻译核心（无消息通道）。
  interaction = createInteraction({
    getSettings: () => settings.value,
    renderer,
    highlight,
    isActive: (current) => current.enabled,
    acceptHoverTarget: (target) => Boolean(target?.closest('#reading-area')),
    acceptSelectTarget: (target) => Boolean(target?.closest('#reading-area')),
    send: (text, requestId, signal) => (props.request ? props.request(text, requestId) : translationResponse(text, signal)),
    cancel: () => {},
  })
  interaction.start()
})

onUnmounted(() => {
  interaction?.destroy()
  interaction = null
})

watch(settings, (value) => {
  interaction?.updateSettings(value)
  status.value = t('demo.updated')
}, { deep: true })

function reset() {
  settings.value = resetToDefaults(settings.value)
}

async function testScheme(scheme: SchemeSettings) {
  status.value = t('demo.testing')
  try {
    await translateWithScheme(scheme, SCHEME_TEST_PHRASE, settings.value.targetLanguage)
    status.value = t('demo.schemeOk')
    return t('demo.schemeOk')
  } catch (error) {
    const message = toDisplayError(error).message
    status.value = message
    throw new Error(message)
  }
}

// 演示页直连翻译核心（无消息通道），requestId 仅占位，由交互控制器自校验
async function translationResponse(text: string, signal?: AbortSignal): Promise<ExtensionResponse> {
  try {
    const outcome = await runTranslation(text, settings.value, signal)
    return outcome.kind === 'dictionary'
      ? { ok: true, requestId: 0, kind: 'dictionary', result: outcome.result }
      : { ok: true, requestId: 0, kind: 'text', result: outcome.text }
  } catch (error) {
    return { ok: false, requestId: 0, error: toDisplayError(error) }
  }
}
</script>

<template>
  <div :class="showSettings ? 'options-page' : 'demo-surface'">
    <div :class="showSettings ? 'demo-column' : undefined">
      <main id="reading-area" class="demo-pane">
        <h1>Translation demo</h1>
        <div class="reading-copy">
          <p>悬停或选中文本时显示翻译；多个词或段落选中时按设定的翻译方案依次尝试翻译。代码不支持悬停翻译，需要选中才会触发翻译。文本与翻译语言相同时不进行翻译。</p>
          <p>Hover over or select text to show a translation. When multiple words or paragraphs are selected, the configured translation schemes are tried in order. Hover translation is disabled for code; select the text to translate it. Text in the target language is not translated.</p>
          <pre><code>const zh = "代码区不触发悬停，但划词可显式翻译。
const en = 'No hover in code blocks; select text to translate'</code></pre>
        </div>
      </main>
      <template v-if="showSettings">
        <GeneralSection v-model:ui-locale="settings.uiLocale" v-model:target-language="settings.targetLanguage" v-model:scheme-order="settings.schemeOrder" />
        <WordSourcesCard v-model="settings" />
        <SchemesSection v-model="settings.schemes" :test-scheme="testScheme" demo-mode />
      </template>
    </div>
    <aside v-if="showSettings" class="settings-column" :aria-label="t('demo.ariaSettings')">
      <SettingsForm v-model="settings" :status="status" @reset="reset" />
    </aside>
  </div>
</template>
