import { defineConfig } from 'vite';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    host: true,
    open: false,
    watch: {
      ignored: ['**/.agents/**', '**/logs/**', '**/*.md', '**/node_modules/**', '**/.git/**']
    },
    hmr: {
      overlay: false // Tắt màn hình đỏ báo lỗi liên tục làm treo trình duyệt
    }
  },
  plugins: [
    ViteImageOptimizer({
      webp: { quality: 80 },
      jpeg: { quality: 80 },
      png: { quality: 80 }
    })
  ],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096
  }
});
