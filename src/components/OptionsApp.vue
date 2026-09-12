<script setup lang="ts">
import { browser } from 'wxt/browser'
import { useSettingsModel } from '../composables/useSettingsModel'
import type { ExtensionResponse } from '../core/messages'
import { createBrowserSettingsStorage } from '../extension/storage'
import DemoApp from '../demo/DemoApp.vue'
import SchemesSection from './SchemesSection.vue'
import SettingsForm from './SettingsForm.vue'

const { settings, stateLabel, reset } = useSettingsModel(createBrowserSettingsStorage())

async function testScheme(schemeId: string): Promise<string> {
  const response = await browser.runtime.sendMessage({
    type: 'settings.testScheme',
    requestId: `settings-${schemeId}-${Date.now()}`,
    schemeId,
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
    </div>
    <aside class="settings-column" aria-label="扩展设置">
      <SettingsForm v-model="settings" :status="stateLabel" @reset="reset" />
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
    padding: 0 52px 40px;
  }

  .settings-column {
    border-top: 1px solid var(--af-line);
    border-left: 0;
  }
}

@media (max-width: 900px) {
  .schemes-slot {
    padding: 0 4px 40px;
  }
}
</style>
