<script setup lang="ts">
import { browser } from 'wxt/browser'
import { useSettingsModel } from '../composables/useSettingsModel'
import type { ExtensionMessageResponse } from '../core/messages'
import { createBrowserSettingsStorage } from '../extension/storage'
import DemoApp from '../demo/DemoApp.vue'
import SettingsForm from './SettingsForm.vue'

const { settings, stateLabel, reset } = useSettingsModel(createBrowserSettingsStorage())

async function testAi(): Promise<string> {
  const response = await browser.runtime.sendMessage({
    type: 'settings.testAi',
    requestId: `settings-${Date.now()}`,
  }) as ExtensionMessageResponse
  if (!response.ok) throw new Error(response.error.message)
  return 'AI 配置可用'
}

async function requestDemo(
  kind: 'dictionary' | 'ai',
  text: string,
  requestId: number,
): Promise<ExtensionMessageResponse> {
  return await browser.runtime.sendMessage({
    type: kind === 'dictionary' ? 'dictionary.lookup' : 'translation.request',
    requestId: `options-demo-${requestId}`,
    text,
  }) as ExtensionMessageResponse
}
</script>

<template>
  <main class="options-page">
    <section class="demo-column" aria-label="翻译交互演示">
      <DemoApp :settings="settings" :request="requestDemo" :show-settings="false" />
    </section>
    <aside class="settings-column" aria-label="扩展设置">
      <SettingsForm v-model="settings" :status="stateLabel" :test-ai="testAi" @reset="reset" />
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
  min-width: 0;
  background: var(--af-page);
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

  .settings-column {
    border-top: 1px solid var(--af-line);
    border-left: 0;
  }
}
</style>
