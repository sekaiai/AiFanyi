import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'AiFanyi - 网页翻译',
    description: '网页划词、取词翻译：悬停单词或选中文本，气泡显示翻译。',
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: '打开 AiFanyi 设置',
    },
    browser_specific_settings: {
      gecko: {
        id: 'aifanyi@sekaiai.github.io',
        data_collection_permissions: {
          required: ['websiteContent'],
        },
      },
    },
  },
})
