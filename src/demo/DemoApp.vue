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
  status.value = '演示设置已更新'
}, { deep: true })

function reset() {
  settings.value = resetToDefaults(settings.value)
}

async function testScheme(scheme: SchemeSettings) {
  status.value = '正在测试方案…'
  try {
    await translateWithScheme(scheme, SCHEME_TEST_PHRASE, settings.value.targetLanguage)
    status.value = '方案连接可用'
    return '方案连接可用'
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
        <p class="tip">悬停或选中单词查词典；选中多个词、句子或段落时按翻译方案顺序翻译。划词对代码区同样生效，悬停不会在代码区弹泡。与目标语言相同的文本不会触发翻译。</p>
        <div class="reading-copy">
          <p>Someone you loved can sometimes become someone you remember forever. Beautiful memories often remain even after people disappear from our lives.</p>
          <p>Learning another language can help you understand different cultures and communicate with people around the world.</p>
          <p>Technology is changing the way people work, communicate and learn new things every day.</p>
          <pre><code>const message = "代码区不触发悬停，但划词可显式翻译";</code></pre>
        </div>
      </main>
      <template v-if="showSettings">
        <section class="word-slot" aria-label="单词翻译">
          <WordSourcesCard v-model="settings" />
        </section>
        <section class="schemes-slot" aria-label="句子翻译">
          <SchemesSection v-model="settings.schemes" v-model:target-language="settings.targetLanguage" v-model:scheme-order="settings.schemeOrder" :test-scheme="testScheme" demo-mode />
        </section>
      </template>
    </div>
    <aside v-if="showSettings" class="settings-column" aria-label="演示设置">
      <SettingsForm v-model="settings" :status="status" @reset="reset" />
    </aside>
  </div>
</template>
