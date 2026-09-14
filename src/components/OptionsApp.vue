<script setup lang="ts">
import { browser } from 'wxt/browser'
import { onMounted, onUnmounted, shallowRef, watchEffect } from 'vue'
import { useSettingsModel } from '../composables/useSettingsModel'
import type { ExtensionResponse, WordSourcesResponse } from '../core/messages'
import type { SchemeSettings } from '../core/types'
import type { UsageStats } from '../core/usage'
import type { WordProbeState } from '../core/word-sources'
import { uid } from '../core/settings'
import { createBrowserSettingsStorage } from '../extension/storage'
import { createUsageStorage } from '../extension/usage-storage'
import DemoApp from '../demo/DemoApp.vue'
import SchemesSection from './SchemesSection.vue'
import SettingsForm from './SettingsForm.vue'
import WordSourcesCard from './WordSourcesCard.vue'

const { settings, stateLabel, reset, syncEnabled, toggleSync, t } = useSettingsModel(createBrowserSettingsStorage())

watchEffect(() => {
  document.title = t('app.docTitle')
  document.documentElement.lang = settings.uiLocale === 'zh' ? 'zh-CN' : 'en'
})

const usage = shallowRef<UsageStats | null>(null)
const usageStorage = createUsageStorage()
let usageUnwatch: (() => void) | null = null

const wordProbe = shallowRef<WordProbeState | null>(null)
const probingWords = shallowRef(false)

onMounted(async () => {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'wordSources.state',
      requestId: `word-state-${uid()}`,
    }) as WordSourcesResponse
    wordProbe.value = response.state
    // 旧版本落库的快照只有 results 没有 latency：自动补测一次，让延迟列立即有数据
    if (response.state.checkedAt && Object.keys(response.state.latency ?? {}).length === 0) {
      void probeWords()
    }
  } catch {
    // 后台不可达时保持 null（显示「未检测」）
  }
})

// 用量展示：挂载时读取一次，之后跟随后台写入实时刷新
onMounted(() => {
  void usageStorage.load().then((stats) => {
    usage.value = stats
  })
  usageUnwatch = usageStorage.watch((next) => {
    usage.value = next
  })
})

onUnmounted(() => {
  usageUnwatch?.()
  usageUnwatch = null
})

async function probeWords(): Promise<void> {
  probingWords.value = true
  try {
    const response = await browser.runtime.sendMessage({
      type: 'wordSources.probe',
      requestId: `word-probe-${uid()}`,
    }) as WordSourcesResponse
    wordProbe.value = response.state
  } catch {
    // 忽略：保留上一次的探测结果
  } finally {
    probingWords.value = false
  }
}

async function testScheme(scheme: SchemeSettings): Promise<string> {
  const response = await browser.runtime.sendMessage({
    type: 'settings.testScheme',
    requestId: `settings-${scheme.id}-${uid()}`,
    scheme,
  }) as ExtensionResponse
  if (!response.ok) throw new Error(response.error.message)
  return t('status.schemeReady')
}

async function requestDemo(
  text: string,
  requestId: number,
): Promise<ExtensionResponse> {
  return await browser.runtime.sendMessage({
    type: 'translation.request',
    requestId: `options-demo-${requestId}`,
    text,
  }) as ExtensionResponse
}
</script>

<template>
  <main class="options-page">
    <div class="demo-column">
      <section :aria-label="t('app.demoInteraction')">
        <DemoApp :settings="settings" :request="requestDemo" :show-settings="false" />
      </section>
            <section class="word-slot" :aria-label="t('section.word')">
        <WordSourcesCard
          v-model="settings"
          :word-probe="wordProbe"
          :probing="probingWords"
          @probe-words="probeWords"
        />
      </section>

      <section class="schemes-slot" :aria-label="t('section.sentence')">
        <SchemesSection
          v-model="settings.schemes"
          v-model:target-language="settings.targetLanguage"
          v-model:scheme-order="settings.schemeOrder"
          show-sync
          :sync-enabled="syncEnabled"
          @toggle-sync="toggleSync"
          :usage="usage"
          :test-scheme="testScheme"
        />
      </section>

    </div>
    <aside class="settings-column" :aria-label="t('app.extensionSettings')">
      <SettingsForm
        v-model="settings"
        :status="stateLabel"
        @reset="reset"
      />
    </aside>
  </main>
</template>
