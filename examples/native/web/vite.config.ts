import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({worker:{format:'es',rollupOptions:{output:{entryFileNames:'native-worker.js'}}},root:fileURLToPath(new URL('.',import.meta.url)),server:{port:5175},build:{outDir:fileURLToPath(new URL('../../../dist/wasm-web',import.meta.url)),emptyOutDir:true}});
