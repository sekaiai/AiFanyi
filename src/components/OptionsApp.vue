<script setup lang="ts">
import { browser } from 'wxt/browser'
import { useSettingsModel } from '../composables/useSettingsModel'
import type { ExtensionMessageResponse } from '../core/messages'
import { createBrowserSettingsStorage } from '../extension/storage'
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
</script>

<template>
  <main class="options-page">
    <SettingsForm v-model="settings" :status="stateLabel" :test-ai="testAi" @reset="reset" />
  </main>
</template>

<style scoped>
.options-page {
  width: min(1120px, 100%);
  min-height: 100vh;
  margin: 0 auto;
  background: var(--af-panel);
  box-shadow: 0 0 0 1px var(--af-line);
}
</style>
