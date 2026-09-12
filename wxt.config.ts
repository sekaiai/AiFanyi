import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'AiFanyi',
    description: '轻量、可定制的网页划词翻译工具。',
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
