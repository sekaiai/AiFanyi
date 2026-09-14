import type { SchemeType } from './types'

export interface SchemeGuideLink {
  href: string
}

export const SCHEME_GUIDES: Record<SchemeType, { links: SchemeGuideLink[] }> = {
  deepl: {
    links: [
      { href: 'https://www.deepl.com/pro-api' },
      { href: 'https://www.deepl.com/en/your-account/keys' },
    ],
  },
  google: {
    links: [
      { href: 'https://translate.google.com/' },
      { href: 'https://cloud.google.com/translate/docs/overview' },
    ],
  },
  googleCloud: {
    links: [
      { href: 'https://console.cloud.google.com/apis/credentials' },
      { href: 'https://cloud.google.com/translate/docs/overview' },
      { href: 'https://console.cloud.google.com/marketplace/product/google/translate.googleapis.com' },
    ],
  },
  baidu: {
    links: [
      { href: 'https://api.fanyi.baidu.com/product/11' },
      { href: 'https://fanyi-api.baidu.com/manage/developer' },
    ],
  },
  baiduAi: {
    links: [
      { href: 'https://api.fanyi.baidu.com/product/133' },
      { href: 'https://fanyi-api.baidu.com/manage/developer' },
    ],
  },
  volcengine: {
    links: [
      { href: 'https://console.volcengine.com/translate' },
      { href: 'https://www.volcengine.com/product/machine-translation' },
      { href: 'https://console.volcengine.com/iam/keymanage' },
    ],
  },
  ai: {
    links: [
      { href: 'https://platform.openai.com/api-keys' },
      { href: 'https://cloud.siliconflow.cn/i/0gApJ55Y' },
    ],
  },
}
