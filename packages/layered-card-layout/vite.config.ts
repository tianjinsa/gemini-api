import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    dts({
      entryRoot: 'src',
      outDir: 'dist',
      tsconfigPath: path.resolve(dirname, 'tsconfig.json'),
      include: ['src/**/*.ts', 'src/**/*.vue'],
      insertTypesEntry: true
    })
  ],
  build: {
    lib: {
      entry: path.resolve(dirname, 'src/index.ts'),
      name: 'VueLayeredLayout',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'vue-layered-layout.es.js' : 'vue-layered-layout.cjs')
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'Vue'
        }
      }
    }
  }
});
