import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'demo',
  base: '/AiFanyi/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
})
