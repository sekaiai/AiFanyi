<script setup lang="ts">
import { browser } from 'wxt/browser'
import { onMounted, shallowRef } from 'vue'
import { useSettingsModel } from '../composables/useSettingsModel'
import type { ExtensionResponse, WordSourcesResponse } from '../core/messages'
import type { SchemeSettings } from '../core/types'
import type { WordProbeState } from '../core/word-sources'
import { createBrowserSettingsStorage } from '../extension/storage'
import DemoApp from '../demo/DemoApp.vue'
import SchemesSection from './SchemesSection.vue'
import SettingsForm from './SettingsForm.vue'
import WordSourcesCard from './WordSourcesCard.vue'

const { settings, stateLabel, reset } = useSettingsModel(createBrowserSettingsStorage())

const wordProbe = shallowRef<WordProbeState | null>(null)
const probingWords = shallowRef(false)

onMounted(async () => {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'wordSources.state',
      requestId: `word-state-${Date.now()}`,
    }) as WordSourcesResponse
    wordProbe.value = response.state
  } catch {
    // 后台不可达时保持 null（显示「未检测」）
  }
})

async function probeWords(): Promise<void> {
  probingWords.value = true
  try {
    const response = await browser.runtime.sendMessage({
      type: 'wordSources.probe',
      requestId: `word-probe-${Date.now()}`,
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
    requestId: `settings-${scheme.id}-${Date.now()}`,
    scheme,
  }) as ExtensionResponse
  if (!response.ok) throw new Error(response.error.message)
  return '方案配置可用'
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
      <section aria-label="翻译交互演示">
        <DemoApp :settings="settings" :request="requestDemo" :show-settings="false" />
      </section>
      <section class="schemes-slot" aria-label="翻译方案">
        <SchemesSection v-model="settings.schemes" v-model:target-language="settings.targetLanguage" :test-scheme="testScheme" />
      </section>
      <section class="word-slot" aria-label="单词查询">
        <WordSourcesCard
          v-model="settings"
          :word-probe="wordProbe"
          :probing="probingWords"
          @probe-words="probeWords"
        />
      </section>
    </div>
    <aside class="settings-column" aria-label="扩展设置">
      <SettingsForm
        v-model="settings"
        :status="stateLabel"
        @reset="reset"
      />
    </aside>
  </main>
</template>

<style scoped>
.options-page {
  display: grid;
  grid-template-columns: minmax(360px, 1fr) minmax(480px, 560px);
  width: min(1440px, 100%);
  min-height: 100vh;
  margin: 0 auto;
}

.demo-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  background: var(--af-page);
}

.schemes-slot {
  padding: 0 52px 8px;
}

.word-slot {
  padding: 0 52px 64px;
}

.settings-column {
  min-width: 0;
  border-left: 1px solid var(--af-line);
  background: var(--af-panel);
}

@media (max-width: 980px) {
  .options-page {
    grid-template-columns: 1fr;
  }

  .schemes-slot {
    padding: 0 52px 8px;
  }

  .word-slot {
    padding: 0 52px 40px;
  }

  .settings-column {
    border-top: 1px solid var(--af-line);
    border-left: 0;
  }
}

@media (max-width: 900px) {
  .schemes-slot {
    padding: 0 4px 8px;
  }

  .word-slot {
    padding: 0 4px 40px;
  }
}
</style>
