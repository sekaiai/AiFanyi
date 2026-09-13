import { computed, nextTick, onUnmounted, reactive, shallowRef, watch } from 'vue'
import { cloneDefaultSettings, migrateSettings } from '../core/settings'
import type { TranslationSettings } from '../core/settings'

export function useSettingsModel(storage: {
  load(): Promise<TranslationSettings>
  save(settings: TranslationSettings): Promise<void>
  reset(): Promise<TranslationSettings>
  subscribe(callback: (settings: TranslationSettings) => void): () => void
  loadSyncEnabled(): Promise<boolean>
  saveSyncEnabled(enabled: boolean): Promise<void>
}) {
  const settings = reactive<TranslationSettings>(cloneDefaultSettings())
  const loading = shallowRef(true)
  const saving = shallowRef(false)
  const status = shallowRef('正在加载设置')
  const syncing = shallowRef(false)
  const syncEnabled = shallowRef(true)
  let latestSave = 0
  let saveQueue = Promise.resolve()
  let active = true
  // chrome.storage.sync 有每分钟 120 次写入的配额，连续编辑需合并为一次尾部防抖写入
  const SAVE_DEBOUNCE_MS = 800
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  void storage.load()
    .then((loaded) => {
      syncing.value = true
      Object.assign(settings, loaded)
      loading.value = false
      status.value = '设置已加载'
      void nextTick(() => {
        syncing.value = false
      })
    })
    .catch(() => {
      loading.value = false
      status.value = '设置加载失败，已使用默认设置'
    })

  void storage.loadSyncEnabled()
    .then((enabled) => {
      syncEnabled.value = enabled
    })
    .catch(() => undefined)

  const unsubscribe = storage.subscribe((next) => {
    if (saving.value) return
    syncing.value = true
    Object.assign(settings, next)
    void nextTick(() => {
      syncing.value = false
    })
  })
  onUnmounted(() => {
    active = false
    unsubscribe()
    // 卸载兜底：还有未落盘的防抖写入时立即保存一次，避免最后一笔编辑丢失
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer)
      saveTimer = undefined
      void storage.save(migrateSettings(settings)).catch(() => undefined)
    }
  })

  watch(settings, (value) => {
    if (loading.value || syncing.value) return
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
          status.value = '已自动保存'
        })
        .catch(() => {
          if (!active || saveId !== latestSave) return
          saving.value = false
          status.value = '保存失败，请稍后重试'
        })
    }, SAVE_DEBOUNCE_MS)
  }, { deep: true })

  async function reset() {
    loading.value = true
    syncing.value = true
    try {
      Object.assign(settings, await storage.reset())
      status.value = '已恢复默认'
    } catch {
      status.value = '恢复默认失败，请稍后重试'
    } finally {
      loading.value = false
      await nextTick()
      syncing.value = false
    }
  }

  const stateLabel = computed(() => saving.value ? '正在保存...' : status.value)

  /** 切换本机是否参与设置同步；重新开启时立即推送当前设置，让同步区拿到本机最新状态。 */
  async function toggleSync(enabled: boolean) {
    if (syncEnabled.value === enabled) return
    const previous = syncEnabled.value
    syncEnabled.value = enabled
    try {
      await storage.saveSyncEnabled(enabled)
    } catch {
      syncEnabled.value = previous
      status.value = '同步设置保存失败，请稍后重试'
      return
    }
    if (!enabled) {
      status.value = '已关闭同步，设置仅保存在本机'
      return
    }
    saving.value = true
    const saveId = ++latestSave
    try {
      await storage.save(migrateSettings(settings))
      if (saveId === latestSave) status.value = '已开启同步'
    } catch {
      if (saveId === latestSave) status.value = '保存失败，请稍后重试'
    } finally {
      if (saveId === latestSave) saving.value = false
    }
  }

  return {
    settings,
    stateLabel,
    reset,
    syncEnabled,
    toggleSync,
  }
}
