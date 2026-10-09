import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'AiFanyi - 网页划词翻译',
    description: '自用翻译插件，简洁好用。可自定义AI翻译，内置了各个大厂提供的翻译服务',
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
