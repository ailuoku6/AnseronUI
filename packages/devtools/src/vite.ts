import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { startDevtoolsServer, type DevtoolsServer } from "./server.js";

const VIRTUAL_ID = "virtual:anseronui-devtools-client";
const RESOLVED_ID = "\0" + VIRTUAL_ID;
// Vite reloads config modules before the previous server's asynchronous close
// has finished. Serialize ownership of each port across those module instances.
const registryKey = Symbol.for('anseronui.devtools.servers');
const registry = ((globalThis as any)[registryKey] ??= new Map<number, Promise<DevtoolsServer>>()) as Map<number, Promise<DevtoolsServer>>;

/** Adds the devtools panel and browser instrumentation to a Vite development server only. */
export function anseronuiDevtools(options: { port?: number; host?: string; endpoint?: string } = {}): Plugin {
  const port = options.port ?? 8091;
  // Resolve the client beside this plugin so it shares the exact BrowserHost module
  // with the SDK's render-web source. A bare package import can create a second
  // module instance in workspace Vite apps and miss the prototype patch.
  const clientModule = fileURLToPath(new URL("./client.ts", import.meta.url));
  return {
    name: "anseronui-devtools",
    apply: "serve",
    async configureServer(server) {
      const previous = registry.get(port);
      const pending = (async () => {
        if (previous) { try { await (await previous).close(); } catch {} }
        return startDevtoolsServer({ port, host: options.host ?? '127.0.0.1' });
      })();
      registry.set(port, pending);
      await pending.then(devtools => {
        console.info(`[anseronui-devtools] panel: http://127.0.0.1:${devtools.port}/__anseronui_devtools`);
        server.httpServer?.once("close", () => { void devtools.close(); });
      }).catch(error => console.warn(`[anseronui-devtools] unavailable: ${String(error)}`));
    },
    resolveId(id) { return id === VIRTUAL_ID ? RESOLVED_ID : undefined; },
    load(id) { return id === RESOLVED_ID ? `import { installBrowserDevtools } from ${JSON.stringify(clientModule)}; installBrowserDevtools({ endpoint: ${JSON.stringify(options.endpoint ?? `http://127.0.0.1:${port}/__anseronui_devtools/ingest`)} });` : undefined; },
    transformIndexHtml() { return [{ tag: "script", attrs: { type: "module", src: "/@id/__x00__virtual:anseronui-devtools-client" }, injectTo: "head-prepend" }]; },
  };
}
