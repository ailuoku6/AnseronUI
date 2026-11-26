import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const virtualId = 'virtual:anseronui-pages';
const resolvedId = '\0' + virtualId;
const framework = fileURLToPath(new URL('../', import.meta.url));
const coreArtifacts = new Set(['core.wasm', 'framework.wasm', 'core.manifest.json']);

/** Compile configured TSX pages to JavaScript and exclude AOT deployment files. */
export function javascriptWebPlugin(configPath) {
  let publicDir;
  const readConfig = () => JSON.parse(readFileSync(configPath, 'utf8'));
  return {
    name: 'anseronui-javascript',
    config() {
      return {
        oxc: { jsx: { runtime: 'automatic', importSource: readConfig().schemaVersion === 2 ? 'anseronui/ui' : '@anseronui/ui' } },
        build: { copyPublicDir: false },
      };
    },
    configResolved(config) { publicDir = config.publicDir; },
    resolveId(source) { if (source === virtualId) return resolvedId; },
    load(id) {
      if (id !== resolvedId) return;
      this.addWatchFile(configPath);
      const config = readConfig();
      const sourceRoot = config.schemaVersion === 2 ? dirname(configPath) : framework;
      const imports = config.pages.map((page, index) => `import { ${page.export} as page${index} } from ${JSON.stringify(resolve(sourceRoot, page.source))};`).join('\n');
      const entries = config.pages.map((page, index) => `{ ...page${index}, name: ${JSON.stringify(page.name ?? page.source.split('/').slice(-2, -1)[0])} }`).join(',');
      return `${imports}\nexport const pages = [${entries}];\n`;
    },
    configureServer(server) {
      server.watcher.add(configPath);
      server.watcher.on('change', file => {
        if (resolve(file) !== resolve(configPath)) return;
        const module = server.moduleGraph.getModuleById(resolvedId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      });
    },
    generateBundle() {
      if (!publicDir || !existsSync(publicDir)) return;
      const copy = (directory, prefix = '') => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const name = prefix + entry.name;
          if (!prefix && coreArtifacts.has(name)) continue;
          const path = join(directory, entry.name);
          if (entry.isDirectory()) copy(path, name + '/');
          else this.emitFile({ type: 'asset', fileName: name, source: readFileSync(path) });
        }
      };
      copy(publicDir);
    },
  };
}
