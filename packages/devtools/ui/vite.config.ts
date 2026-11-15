import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/__anseronui_devtools/',
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  build: { outDir: fileURLToPath(new URL('../src/panel', import.meta.url)), emptyOutDir: true },
});
