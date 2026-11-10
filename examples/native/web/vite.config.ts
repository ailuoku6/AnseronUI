import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { appIconWebPlugin } from '../../../scripts/app-icons.mjs';
const app = fileURLToPath(new URL('../../../',import.meta.url));
const config = JSON.parse(readFileSync(new URL('../../../anseronui.config.json',import.meta.url),'utf8'));
export default defineConfig({plugins:[appIconWebPlugin(app,config)],worker:{format:'es',rollupOptions:{output:{entryFileNames:'native-worker.js'}}},root:fileURLToPath(new URL('.',import.meta.url)),server:{port:5175},build:{outDir:fileURLToPath(new URL('../../../dist/wasm-web',import.meta.url)),emptyOutDir:true}});
