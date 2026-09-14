import { getCurrentInstance, inject, provide, shallowRef, type InjectionKey, type Ref } from 'vue'
import { translate, type MessageKey } from '../core/i18n'
import type { UiLocale } from '../core/types'

export interface UiLocaleContext {
  locale: Ref<UiLocale>
  t: (key: MessageKey, params?: Record<string, string | number>) => string
}

const UI_LOCALE_KEY: InjectionKey<UiLocaleContext> = Symbol('ui-locale')

/** 顶层组件注入界面语言并返回创建的上下文；同组件 setup 需直接使用返回值（inject 读不到自身 provide）。 */
export function provideUiLocale(locale: Ref<UiLocale>): UiLocaleContext {
  const context: UiLocaleContext = {
    locale,
    t: (key, params) => translate(locale.value, key, params),
  }
  provide(UI_LOCALE_KEY, context)
  return context
}

/** 获取界面语言上下文；未被注入时（如测试直接挂载）回退为中文。 */
export function useUiLocale(): UiLocaleContext {
  const injected = getCurrentInstance() ? inject(UI_LOCALE_KEY, null) : null
  if (injected) return injected
  const locale = shallowRef<UiLocale>('zh')
  return {
    locale,
    t: (key, params) => translate(locale.value, key, params),
  }
}
