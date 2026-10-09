import { computed, nextTick, onUnmounted, reactive, shallowRef, watch } from 'vue'
import { cloneDefaultSettings, migrateSettings } from '../core/settings'
import type { TranslationSettings } from '../core/settings'
import type { DownloadedSyncSettings, SyncState } from '../extension/storage'
import { provideUiLocale } from './useUiLocale'

export function useSettingsModel(storage: {
  load(): Promise<TranslationSettings>
  save(settings: TranslationSettings): Promise<void>
  reset(): Promise<TranslationSettings>
  subscribe(callback: (settings: TranslationSettings) => void): () => void
  upload(settings: TranslationSettings): Promise<void>
  download(): Promise<DownloadedSyncSettings>
  inspectSyncState(settings: TranslationSettings): Promise<SyncState>
  subscribeSyncState(callback: () => void): () => void
}) {
  const settings = reactive<TranslationSettings>(cloneDefaultSettings())
  const { t } = provideUiLocale(computed(() => settings.uiLocale))
  const loading = shallowRef(true)
  const saving = shallowRef(false)
  const status = shallowRef(t('status.loading'))
  const syncing = shallowRef(false)
  const syncBusy = shallowRef(false)
  const syncStatus = shallowRef('')
  const syncState = shallowRef<SyncState | null>(null)
  let latestSave = 0
  let latestSyncState = 0
  let saveQueue = Promise.resolve()
  let active = true
  const SAVE_DEBOUNCE_MS = 800
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  void storage.load()
    .then((loaded) => {
      syncing.value = true
      Object.assign(settings, loaded)
      loading.value = false
      status.value = t('status.loaded')
      void nextTick(() => {
        syncing.value = false
        void refreshSyncState()
      })
    })
    .catch(() => {
      loading.value = false
      status.value = t('status.loadFailed')
      void refreshSyncState()
    })

  const unsubscribe = storage.subscribe((next) => {
    if (saving.value) return
    syncing.value = true
    Object.assign(settings, next)
    void nextTick(() => {
      syncing.value = false
    })
  })
  const unsubscribeSyncState = storage.subscribeSyncState(() => {
    syncStatus.value = ''
    void refreshSyncState()
  })
  onUnmounted(() => {
    active = false
    unsubscribe()
    unsubscribeSyncState()
    // 卸载兜底：还有未落盘的防抖写入时立即保存一次，避免最后一笔编辑丢失
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer)
      saveTimer = undefined
      void storage.save(migrateSettings(settings)).catch(() => undefined)
    }
  })

  watch(settings, (value) => {
    if (loading.value || syncing.value) return
    syncStatus.value = ''
    const snapshot = migrateSettings(value)
    if (saveTimer !== undefined) clearTimeout(saveTimer)
    const saveId = ++latestSave
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      saving.value = true
      saveQueue = saveQueue
        .catch(() => undefined)
        .then(() => storage.save(snapshot))
        .then(() => {
          if (!active || saveId !== latestSave) return
          saving.value = false
          status.value = t('status.autoSaved')
          void refreshSyncState()
        })
        .catch(() => {
          if (!active || saveId !== latestSave) return
          saving.value = false
          status.value = t('status.saveFailed')
        })
    }, SAVE_DEBOUNCE_MS)
  }, { deep: true })

  async function reset() {
    loading.value = true
    syncing.value = true
    syncStatus.value = ''
    try {
      Object.assign(settings, await storage.reset())
      status.value = t('status.resetDone')
    } catch {
      status.value = t('status.resetFailed')
    } finally {
      loading.value = false
      await nextTick()
      syncing.value = false
      void refreshSyncState()
    }
  }

  const stateLabel = computed(() => saving.value ? t('status.saving') : status.value)

  async function saveNow(next: TranslationSettings): Promise<void> {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer)
      saveTimer = undefined
    }
    latestSave++
    saving.value = true
    try {
      saveQueue = saveQueue.catch(() => undefined).then(() => storage.save(next))
      await saveQueue
    } finally {
      saving.value = false
    }
  }

  async function upload(): Promise<void> {
    syncBusy.value = true
    const snapshot = migrateSettings(settings)
    try {
      await saveNow(snapshot)
      await storage.upload(snapshot)
      syncStatus.value = t('status.syncUploaded')
      await refreshSyncState()
    } catch (error) {
      syncStatus.value = syncError(t('status.syncFailed'), error)
    } finally {
      syncBusy.value = false
    }
  }

  async function download(): Promise<void> {
    syncBusy.value = true
    try {
      const remote = await storage.download()
      await saveNow(remote.settings)
      syncing.value = true
      Object.assign(settings, remote.settings)
      syncStatus.value = t('status.syncDownloaded')
      await nextTick()
      syncing.value = false
      await refreshSyncState()
    } catch (error) {
      syncStatus.value = syncError(t('status.syncDownloadFailed'), error)
    } finally {
      syncBusy.value = false
    }
  }

  async function refreshSyncState(): Promise<void> {
    const request = ++latestSyncState
    try {
      const next = await storage.inspectSyncState(migrateSettings(settings))
      if (active && request === latestSyncState) syncState.value = next
    } catch {
      // 无法读取云端状态时回到未知，由状态栏文案提示，避免展示过期结论。
      if (active && request === latestSyncState) syncState.value = null
    }
  }

  return {
    settings,
    stateLabel,
    reset,
    upload,
    download,
    syncBusy,
    syncStatus,
    syncState,
    t,
  }
}

function syncError(fallback: string, error: unknown): string {
  return error instanceof Error && error.message ? `${fallback}：${error.message}` : fallback
}
