import { computed, onUnmounted, reactive, readonly, shallowRef, watch } from 'vue'
import { cloneDefaultSettings, migrateSettings } from '../core/settings'
import type { SettingsStorageAdapter } from '../core/storage'
import type { TranslationSettings } from '../core/settings'

export function useSettingsModel(storage: SettingsStorageAdapter) {
  const settings = reactive<TranslationSettings>(cloneDefaultSettings())
  const loading = shallowRef(true)
  const saving = shallowRef(false)
  const status = shallowRef('正在加载设置')
  const syncing = shallowRef(false)

  void storage.load().then((loaded) => {
    syncing.value = true
    Object.assign(settings, loaded)
    syncing.value = false
    loading.value = false
    status.value = '设置已加载'
  })

  const unsubscribe = storage.subscribe((next) => {
    syncing.value = true
    Object.assign(settings, next)
    syncing.value = false
  })
  onUnmounted(unsubscribe)

  watch(settings, async (value) => {
    if (loading.value || syncing.value) return
    saving.value = true
    await storage.save(migrateSettings(value))
    saving.value = false
    status.value = '已自动保存'
  }, { deep: true })

  async function reset() {
    loading.value = true
    syncing.value = true
    Object.assign(settings, await storage.reset())
    syncing.value = false
    loading.value = false
    status.value = '已恢复默认'
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
