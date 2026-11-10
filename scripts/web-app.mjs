import { readFileSync } from 'node:fs';
import { build, createServer } from 'vite';
import { appIconWebPlugin } from './app-icons.mjs';

const [command, configFile, app, configPath] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const options = { configFile, plugins: [appIconWebPlugin(app, config)] };
if (command === 'build') await build(options);
else if (command === 'dev') {
  const server = await createServer(options);
  await server.listen(); server.printUrls();
} else throw new Error('Expected build or dev');
