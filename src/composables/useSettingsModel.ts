import { computed, nextTick, onUnmounted, reactive, readonly, shallowRef, watch } from 'vue'
import { cloneDefaultSettings, migrateSettings } from '../core/settings'
import type { SettingsStorageAdapter } from '../core/storage'
import type { TranslationSettings } from '../core/settings'

export function useSettingsModel(storage: SettingsStorageAdapter) {
  const settings = reactive<TranslationSettings>(cloneDefaultSettings())
  const loading = shallowRef(true)
  const saving = shallowRef(false)
  const status = shallowRef('正在加载设置')
  const syncing = shallowRef(false)
  let latestSave = 0
  let saveQueue = Promise.resolve()
  let active = true

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
  })

  watch(settings, (value) => {
    if (loading.value || syncing.value) return
    const saveId = ++latestSave
    const snapshot = migrateSettings(value)
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

  return {
    settings,
    loading: readonly(loading),
    saving: readonly(saving),
    stateLabel,
    reset,
    unsubscribe,
  }
}
