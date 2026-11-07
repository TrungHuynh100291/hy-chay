import { defineConfig } from 'vite';
import { resolve } from 'path';

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
      overlay: false
    }
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html')
      }
    }
  }
});
