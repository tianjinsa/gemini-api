import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: '../frontend',
    emptyOutDir: true,
    sourcemap: false,
    manifest: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('vue') || id.includes('pinia') || id.includes('@vueuse')) {
            return 'vendor-vue';
          }

          if (id.includes('dayjs')) {
            return 'vendor-dayjs';
          }

          if (
            id.includes('remark-') ||
            id.includes('rehype-') ||
            id.includes('unified') ||
            id.includes('katex') ||
            id.includes('highlight.js') ||
            id.includes('lowlight')
          ) {
            return 'vendor-markdown';
          }

          return undefined;
        }
      }
    }
  }
});
