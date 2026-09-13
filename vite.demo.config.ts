import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'demo',
  base: '/AiFanyi/',
  plugins: [vue()],
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
