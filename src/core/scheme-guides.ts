import type { SchemeType } from './types'

/** 各方案新手指南的链接地址；文案键由 i18n.ts 的 GUIDE_KEYS 提供。 */
export const SCHEME_GUIDES: Record<SchemeType, string[]> = {
  deepl: [
    'https://www.deepl.com/pro-api',
    'https://www.deepl.com/en/your-account/keys',
  ],
  google: [
    'https://translate.google.com/',
    'https://cloud.google.com/translate/docs/overview',
  ],
  googleCloud: [
    'https://console.cloud.google.com/apis/credentials',
    'https://cloud.google.com/translate/docs/overview',
    'https://console.cloud.google.com/marketplace/product/google/translate.googleapis.com',
  ],
  baidu: [
    'https://api.fanyi.baidu.com/product/11',
    'https://fanyi-api.baidu.com/manage/developer',
  ],
  baiduAi: [
    'https://api.fanyi.baidu.com/product/133',
    'https://fanyi-api.baidu.com/manage/developer',
  ],
  bing: [
    'https://cn.bing.com/translator',
  ],
  mymemory: [
    'https://mymemory.translated.net/',
  ],
  yandex: [
    'https://translate.yandex.com/',
  ],
  reverso: [
    'https://www.reverso.net/text-translation',
  ],
  volcengine: [
    'https://console.volcengine.com/translate',
    'https://www.volcengine.com/product/machine-translation',
    'https://console.volcengine.com/iam/keymanage',
  ],
  ai: [
    'https://platform.openai.com/api-keys',
    'https://cloud.siliconflow.cn/i/0gApJ55Y',
  ],
}
