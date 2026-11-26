import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { appIconWebPlugin } from '../../../scripts/app-icons.mjs';
import { javascriptWebPlugin } from '../../../scripts/web-runtime.mjs';
const app = fileURLToPath(new URL('../../../',import.meta.url));
const config = JSON.parse(readFileSync(new URL('../../../anseronui.config.json',import.meta.url),'utf8'));
export default defineConfig({
  plugins: [
    javascriptWebPlugin(fileURLToPath(new URL('../../../anseronui.config.json',import.meta.url))),
    appIconWebPlugin(app,config),
    {
      name: 'anseronui-demo-media',
      configResolved(vite) {
        const source = join(app, 'examples/components/assets');
        const destination = join(vite.publicDir, 'assets');
        mkdirSync(destination, { recursive: true });
        for (const name of readdirSync(source)) copyFileSync(join(source, name), join(destination, name));
      },
    },
  ],
  worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'native-worker.js' } } },
  root: fileURLToPath(new URL('.',import.meta.url)),
  server: { port: 5175 },
  build: { outDir: fileURLToPath(new URL('../../../dist/web',import.meta.url)), emptyOutDir: true },
});
