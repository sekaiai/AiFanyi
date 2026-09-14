<script setup lang="ts">
import { computed } from 'vue'
import { useUiLocale } from '../composables/useUiLocale'
import { TARGET_LANGUAGES } from '../core/settings'
import type { SchemeOrder, UiLocale } from '../core/types'

const uiLocale = defineModel<UiLocale>('uiLocale', { required: true })
const targetLanguage = defineModel<string>('targetLanguage', { required: true })
const schemeOrder = defineModel<SchemeOrder>('schemeOrder', { required: true })

defineProps<{
  /** 是否渲染本机同步开关（演示模式不传则不渲染）。 */
  showSync?: boolean
  /** 本机是否参与设置同步；仅 showSync 为 true 时有意义。 */
  syncEnabled?: boolean
}>()

const emit = defineEmits<{
  toggleSync: [enabled: boolean]
}>()

const { t } = useUiLocale()

const orderHint = computed(() => schemeOrder.value === 'random'
  ? t('schemes.hint.random')
  : t('schemes.hint.sequential'))
</script>

<template>
  <section class="general-section af-card" data-testid="general-section" :aria-label="t('section.general')">
    <h2 class="section-title">{{ t('section.general') }}</h2>
    <div class="head-controls">
      <label class="target-field">
        <span class="field-label">{{ t('app.uiLanguage') }}</span>
        <select v-model="uiLocale" data-testid="ui-locale">
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </label>
      <label class="target-field">
        <span class="field-label">{{ t('schemes.translateInto') }}</span>
        <select v-model="targetLanguage" data-testid="target-language">
          <option v-for="lang in TARGET_LANGUAGES" :key="lang" :value="lang">{{ lang }}</option>
        </select>
      </label>
      <label class="target-field">
        <span class="field-label">{{ t('schemes.order') }}</span>
        <select v-model="schemeOrder" data-testid="scheme-order">
          <option value="random">{{ t('schemes.orderRandom') }}</option>
          <option value="sequential">{{ t('schemes.orderSequential') }}</option>
        </select>
      </label>
      <label v-if="showSync" class="target-field sync-field af-chip" :title="t('schemes.syncTitle')">
        <input
          type="checkbox"
          class="checkbox"
          :checked="syncEnabled"
          data-testid="sync-toggle"
          @change="emit('toggleSync', ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t('schemes.syncLabel') }}</span>
      </label>
    </div>
    <p class="section-hint">{{ orderHint }}</p>
  </section>
</template>

<style scoped>
.section-hint {
  margin: 6px 0 0;
  color: var(--af-muted);
  font-size: 14px;
}

.head-controls {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.target-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.target-field .field-label {
  white-space: nowrap;
}

.target-field select {
  min-height: 30px;
  padding: 0 8px;
  font-size: 14px;
}

.sync-field {
  white-space: nowrap;
}
</style>
