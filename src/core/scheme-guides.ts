import type { SchemeType } from './types'

export interface SchemeGuideLink {
  label: string
  href: string
}

export interface SchemeGuide {
  title: string
  recommendation: string
  requirements: string
  steps: string[]
  links: SchemeGuideLink[]
}

export const SCHEME_GUIDES: Record<SchemeType, SchemeGuide> = {
  deepl: {
    title: 'DeepL',
    recommendation: '句子和段落的表达自然，配置也比较简单。',
    requirements: '免费额度：每月 50 万字符。要求：注册 DeepL API Free 账户并创建 Auth Key；是否需要绑定支付方式以注册页面提示为准，免费版与 Pro 接口不能混用。',
    steps: [
      '打开 DeepL API 注册或登录账户，按页面提示完成验证。',
      '进入账户设置中的 API 密钥区域，创建并复制 Auth Key。',
      '在本弹窗选择 DeepL，粘贴 Auth Key，并按账户类型选择免费或 Pro 接口。',
      '保存后点击方案卡片中的“测试”，成功后即可使用。',
    ],
    links: [
      { label: '申请 API 账户', href: 'https://www.deepl.com/pro-api' },
      { label: '官方开发文档', href: 'https://developers.deepl.com/docs/getting-started/intro' },
    ],
  },
  google: {
    title: 'Google 翻译（免密钥）',
    recommendation: '不用注册或填写密钥，打开就能快速试用。',
    requirements: '免费额度：没有公开、固定的开发者配额。要求：无需账号；这是便捷接口，可能受网络、频率和地区限制，不适合长期稳定使用。',
    steps: [
      '在方案类型中选择“Google 翻译（免密钥）”。',
      '直接保存方案，无需填写账号或密钥。',
      '点击方案卡片中的“测试”确认当前网络可以访问 Google 翻译接口。',
    ],
    links: [
      { label: 'Google 翻译产品页', href: 'https://translate.google.com/' },
      { label: 'Google Cloud 翻译文档', href: 'https://cloud.google.com/translate/docs/overview' },
    ],
  },
  googleCloud: {
    title: 'Google Cloud 翻译',
    recommendation: '正式 API 的配额和权限更清晰，适合持续使用。',
    requirements: '免费额度：每月前 50 万字符。要求：创建 Cloud 项目、启用 API 并设置结算账号，是否需要绑定银行卡取决于账号所在地区和结算状态。',
    steps: [
      '登录 Google Cloud Console，创建或选择一个项目并启用 Cloud Translation API。',
      '进入“API 和服务 → 凭据”，创建 API Key，并按需限制可用 API。',
      '在本弹窗选择 Google Cloud，粘贴 API Key。',
      '保存后点击方案卡片中的“测试”，确认项目配额和计费状态正常。',
    ],
    links: [
      { label: '创建 API Key', href: 'https://console.cloud.google.com/apis/credentials' },
      { label: '官方翻译文档', href: 'https://cloud.google.com/translate/docs/overview' },
      { label: '启用翻译 API', href: 'https://console.cloud.google.com/marketplace/product/google/translate.googleapis.com' },
    ],
  },
  baidu: {
    title: '百度翻译',
    recommendation: '中文场景表现稳定，国内网络通常更容易访问。',
    requirements: '免费额度：标准版免费不限字符量，高级版每月 200 万字符（以账户页面为准）。要求：注册并创建应用，部分能力需要实名认证；不同产品线的密钥不能混用。',
    steps: [
      '打开百度翻译开放平台并登录，进入“开发者信息”或“通用翻译”服务。',
      '创建应用并开通通用文本翻译，复制页面生成的 AppID 和密钥。',
      '在本弹窗选择百度翻译，分别填写 AppID 和密钥。',
      '保存后点击方案卡片中的“测试”，成功后即可翻译句子和段落。',
    ],
    links: [
      { label: '申请百度翻译服务', href: 'https://api.fanyi.baidu.com/product/11' },
      { label: '通用文本翻译文档', href: 'https://api.fanyi.baidu.com/doc/21' },
    ],
  },
  volcengine: {
    title: '火山引擎',
    recommendation: '国内网络接入顺畅，适合已经在用火山引擎的用户。',
    requirements: '免费额度：机器翻译没有统一长期固定的公开额度，以控制台当前活动和套餐为准。要求：完成实名认证、开通机器翻译；子用户还需“机器翻译完整访问”权限，并妥善保管两组访问密钥。',
    steps: [
      '登录火山引擎控制台，进入“访问控制（IAM）→ 密钥管理”，创建访问密钥。',
      '在机器翻译产品页开通服务，并确认当前账号有文本翻译权限。',
      '在本弹窗选择火山引擎，填写 Access Key ID、Secret Access Key；地域通常保持 cn-north-1。',
      '保存后点击方案卡片中的“测试”，确认密钥权限和服务状态正常。',
    ],
    links: [
      { label: '密钥管理控制台', href: 'https://console.volcengine.com/iam/keymanage/' },
      { label: '机器翻译 API SDK', href: 'https://www.volcengine.com/docs/4640/2122636' },
      { label: '文本翻译接口文档', href: 'https://www.volcengine.com/docs/4640/78985?lang=zh' },
    ],
  },
  ai: {
    title: '兼容 OpenAI 的 AI 接口',
    recommendation: '能理解上下文并按提示词调整语气，整句和段落更灵活。',
    requirements: '免费额度：没有统一标准，取决于你选择的服务商或自建服务。要求：准备接口地址、模型和 API 密钥；费用、速度和质量以服务商账户的余额与套餐为准。',
    steps: [
      '选择一个兼容 OpenAI Chat Completions 的服务商或自建服务。',
      '在服务商控制台创建 API Key，并确认已开通对应模型权限。',
      '在本弹窗填写完整的 API 地址、模型名称和 API 密钥。',
      '保存后点击方案卡片中的“测试”；如失败，优先核对地址末尾路径、模型名和余额。',
    ],
    links: [
      { label: 'OpenAI API 密钥', href: 'https://platform.openai.com/api-keys' },
      { label: 'OpenAI 官方文档', href: 'https://platform.openai.com/docs/api-reference/chat/create' },
    ],
  },
}
