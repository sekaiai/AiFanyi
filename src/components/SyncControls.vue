<script setup lang="ts">
import { computed } from 'vue'
import { useUiLocale } from '../composables/useUiLocale'
import type { MessageKey } from '../core/i18n'
import type { SyncState } from '../extension/storage'

const props = defineProps<{
  busy: boolean
  status: string
  state: SyncState
}>()

const emit = defineEmits<{
  upload: []
  download: []
}>()

const { locale, t } = useUiLocale()

const SYNC_STATE_LABELS: Record<SyncState['kind'], MessageKey> = {
  checking: 'schemes.syncState.checking',
  unavailable: 'schemes.syncState.unavailable',
  notUploaded: 'schemes.syncState.notUploaded',
  legacy: 'schemes.syncState.legacy',
  upToDate: 'schemes.syncState.upToDate',
  localChanges: 'schemes.syncState.localChanges',
  remoteChanges: 'schemes.syncState.remoteChanges',
  conflict: 'schemes.syncState.conflict',
  different: 'schemes.syncState.different',
}

const uploadedAt = computed(() => props.state.uploadedAt === null
  ? null
  : new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(props.state.uploadedAt))
const stateLabel = computed(() => t(SYNC_STATE_LABELS[props.state.kind]))
const stateWarning = computed(() => ['remoteChanges', 'conflict', 'different', 'unavailable'].includes(props.state.kind))
const summary = computed(() => {
  const text = props.status || stateLabel.value
  if (uploadedAt.value === null) return text
  return `${text}，${t('schemes.syncCloudUpdatedAt', { time: uploadedAt.value })}`
})
</script>

<template>
  <section class="af-card" :aria-label="t('section.sync')">
    <h2 class="section-title">{{ t('section.sync') }}</h2>
    <p class="sync-description">
      {{ t('schemes.syncDescription') }}
      <a class="sync-docs" href="https://developer.chrome.com/docs/extensions/reference/api/storage#sync" target="_blank" rel="noreferrer">{{ t('schemes.syncDocs') }}</a>
    </p>
    <div class="sync-footer">
      <div class="sync-actions">
        <button class="button button-secondary" type="button" :disabled="busy" data-testid="sync-upload" @click="emit('upload')">
          {{ t('schemes.syncUpload') }}
        </button>
        <button class="button" type="button" :disabled="busy" data-testid="sync-download" @click="emit('download')">
          {{ t('schemes.syncDownload') }}
        </button>
      </div>
      <p class="sync-summary" :class="{ 'sync-state-warning': stateWarning }" data-testid="sync-summary">{{ summary }}</p>
    </div>
  </section>
</template>

<style scoped>
.sync-description {
  margin: 0 0 10px;
  color: var(--af-muted);
}

.sync-docs {
  color: inherit;
}

.sync-footer {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sync-actions {
  display: flex;
  gap: 8px;
}

.sync-summary {
  min-width: 0;
  margin: 0;
  color: var(--af-muted);
  text-align: right;
}

.sync-summary.sync-state-warning {
  color: var(--af-danger, #b42318);
}
</style>
