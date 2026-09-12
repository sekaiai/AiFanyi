import type { SchemeType } from './types'

export interface SchemeGuideLink {
  label: string
  href: string
}

export interface SchemeGuide {
  title: string
  tagline: string
  steps: string[]
  links: SchemeGuideLink[]
}

export const SCHEME_GUIDES: Record<SchemeType, SchemeGuide> = {
  deepl: {
    title: 'DeepL',
    tagline: '句子和段落读起来更自然 · 每月 50 万字符免费',
    steps: [
      '注册 DeepL API Free，进入账户设置创建 Auth Key。',
      '回到这里粘贴 Auth Key，按账户类型选「免费」或「Pro」（两者不能混用）。',
      '保存后点方案卡片「测试」，通过即可使用。',
    ],
    links: [
      { label: '申请 API 账户', href: 'https://www.deepl.com/pro-api' },
      { label: '官方开发文档', href: 'https://developers.deepl.com/docs/getting-started/intro' },
    ],
  },
  google: {
    title: 'Google 翻译（免密钥）',
    tagline: '不怎么稳定 · 不用注册、不用填密钥，打开就能试 · 无固定开发者配额',
    steps: [
      '方案类型选「Google 翻译（免密钥）」。',
      '直接保存，无需填写任何账号信息。',
      '点「测试」确认当前网络可访问该接口（公共接口，可能受频率与地区限制）。',
    ],
    links: [
      { label: 'Google 翻译产品页', href: 'https://translate.google.com/' },
      { label: 'Google Cloud 翻译文档', href: 'https://cloud.google.com/translate/docs/overview' },
    ],
  },
  googleCloud: {
    title: 'Google Cloud 翻译',
    tagline: '正式 API，配额与权限更清晰 · 每月前 50 万字符免费',
    steps: [
      '在 Cloud Console 创建项目并启用 Cloud Translation API。',
      '在「API 和服务 → 凭据」创建 API Key。',
      '回到这里粘贴 API Key（需绑定结算账号，视地区而定）。',
      '点「测试」，确认配额与计费状态正常。',
    ],
    links: [
      { label: '创建 API Key', href: 'https://console.cloud.google.com/apis/credentials' },
      { label: '官方翻译文档', href: 'https://cloud.google.com/translate/docs/overview' },
      { label: '启用翻译 API', href: 'https://console.cloud.google.com/marketplace/product/google/translate.googleapis.com' },
    ],
  },
  baidu: {
    title: '百度翻译',
    tagline: '中文场景稳，国内网络访问顺畅 · 标准版不限字符量',
    steps: [
      '登录百度翻译开放平台，创建应用并开通「通用文本翻译」。',
      '复制页面生成的 AppID 和密钥。',
      '回到这里分别填入 AppID 与密钥（不同产品线的密钥不能混用）。',
      '点「测试」，通过后可翻译句子与段落。',
    ],
    links: [
      { label: '申请百度翻译服务', href: 'https://api.fanyi.baidu.com/product/11' },
      { label: '管理控制台（拿 APPID / 密钥）', href: 'https://fanyi-api.baidu.com/manage/developer' },
    ],
  },
  volcengine: {
    title: '火山引擎',
    tagline: '国内接入顺畅，适合已在用火山引擎的人 · 每月前2百万字符免费',
    steps: [
      '登录控制台，进入「访问控制 → 密钥管理」创建访问密钥。',
      '在机器翻译产品页开通服务，并确认账号有文本翻译权限。',
      '回到这里填 Access Key ID 与 Secret Access Key，地域保持 cn-north-1。',
      '点「测试」，确认密钥权限与服务状态正常。',
    ],
    links: [
      { label: '机器翻译控制台（开通服务）', href: 'https://console.volcengine.com/translate' },
      { label: '产品介绍页', href: 'https://www.volcengine.com/product/machine-translation' },
      { label: '密钥管理页面（拿 AK/SK）', href: 'https://console.volcengine.com/iam/keymanage' },
    ],
  },
  ai: {
    title: '兼容 OpenAI 的 AI 接口',
    tagline: '能按提示词调语气，整句和段落更灵活 · 费用取决于服务商',
    steps: [
      '选一个兼容 OpenAI Chat Completions 的服务商，创建 API Key。',
      '回到这里填完整接口地址、模型名和 API 密钥。',
      '点「测试」；失败先核对地址末尾路径、模型名和余额。',
    ],
    links: [
      { label: 'OpenAI API 密钥', href: 'https://platform.openai.com/api-keys' },
      { label: 'OpenAI 官方文档', href: 'https://platform.openai.com/docs/api-reference/chat/create' },
    ],
  },
}
