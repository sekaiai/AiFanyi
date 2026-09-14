<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import SchemesSection from '../components/SchemesSection.vue'
import SettingsForm from '../components/SettingsForm.vue'
import WordSourcesCard from '../components/WordSourcesCard.vue'
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
          <p>悬停或选中单词查词典；选中多个词、句子或段落时按翻译方案顺序翻译。划词对代码区同样生效，悬停不会在代码区弹泡。与目标语言相同的文本不会触发翻译。</p>
          <p>Hover over or select a word to look it up; when multiple words, a sentence or a paragraph is selected, schemes are tried in order. Selection also works inside code blocks, while hover never pops up over them. Text identical to the target language is not translated.</p>
          <p>你曾经深爱的人，有时会变成你永远铭记的人。美好的回忆往往在人离开后依然留存。</p>
          <p>Someone you loved can sometimes become someone you remember forever. Beautiful memories often remain even after people disappear from our lives.</p>
          <p>配置与密钥通过浏览器账号同步存储，在各设备间自动同步；密钥仅由后台请求使用，网页内容脚本不会接收密钥。</p>
          <p>Settings and keys are stored with browser account sync and stay in sync across devices; keys are used only by background requests, and content scripts never receive them.</p>
          <pre><code>const message = "代码区不触发悬停，但划词可显式翻译";</code></pre>
        </div>
      </main>
      <template v-if="showSettings">
        <section class="word-slot" :aria-label="t('section.word')">
          <WordSourcesCard v-model="settings" />
        </section>
        <section class="schemes-slot" :aria-label="t('section.sentence')">
          <SchemesSection v-model="settings.schemes" v-model:target-language="settings.targetLanguage" v-model:scheme-order="settings.schemeOrder" :test-scheme="testScheme" demo-mode />
        </section>
      </template>
    </div>
    <aside v-if="showSettings" class="settings-column" :aria-label="t('demo.ariaSettings')">
      <SettingsForm v-model="settings" :status="status" @reset="reset" />
    </aside>
  </div>
</template>
