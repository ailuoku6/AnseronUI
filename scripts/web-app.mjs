import { readFileSync } from 'node:fs';
import { build, createServer } from 'vite';
import { appIconWebPlugin } from './app-icons.mjs';
import { javascriptWebPlugin } from './web-runtime.mjs';
const { register } = await import('tsx/esm/api');
register();

const [command, configFile, app, configPath] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const anseronuiDevtools = command === 'dev' ? (await import('../packages/devtools/src/vite.ts')).anseronuiDevtools : undefined;
const options = { configFile, plugins: [javascriptWebPlugin(configPath), appIconWebPlugin(app, config), ...(command === 'dev' ? [anseronuiDevtools()] : [])] };
if (command === 'build') await build(options);
else if (command === 'dev') {
  const server = await createServer(options);
  await server.listen(); server.printUrls();
} else throw new Error('Expected build or dev');
