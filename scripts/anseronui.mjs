#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, join, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const frameworkRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const command = process.argv[2] ?? "help";
const args = process.argv.slice(3);

function fail(message) { console.error(`AnseronUI: ${message}`); process.exitCode = 1; }
function valueAfter(name, fallback = undefined) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}
function has(name) { return args.includes(name); }
function sanitizeName(value) {
  const name = String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) throw new Error(`Invalid app name: ${value}`);
  return name;
}
function write(path, contents, force = false) {
  if (existsSync(path) && !force) throw new Error(`File already exists: ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}
function json(path) { return JSON.parse(readFileSync(path, "utf8")); }
function appConfigPath(path) { return resolve(path, "anseronui.config.json"); }
function relativeModulePath(from, to) {
  const value = relative(from, to).split(sep).join("/");
  return value.startsWith(".") ? value : `./${value}`;
}
function run(commandName, commandArgs, env = process.env) {
  const result = spawnSync(commandName, commandArgs, { cwd: frameworkRoot, stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function createApp() {
  const requested = args.find(item => !item.startsWith("-"));
  if (!requested) throw new Error("Usage: anseronui create <directory> [--name app-name] [--force]");
  const target = resolve(process.cwd(), requested);
  const name = sanitizeName(valueAfter("--name", requested.split(/[\\/]/).filter(Boolean).pop() ?? "anseronui-app"));
  const force = has("--force");
  const existing = existsSync(target) ? readdirSync(target) : [];
  if (existing.length > 0 && !force) throw new Error(`Target is not empty: ${target}; use --force to overwrite generated files`);
  const targetRelative = relative(frameworkRoot, target).split(sep).join("/");
  if (targetRelative.startsWith("..")) throw new Error("create target must be inside the AnseronUI workspace so the shared Core build can stage its sources");
  const config = {
    buildId: `${name}-app`,
    sourceDirs: [`${targetRelative}/src/pages`],
    pages: [
      { name: "home", source: `${targetRelative}/src/pages/home.tsx`, export: "homePage" },
      { name: "details", source: `${targetRelative}/src/pages/details.tsx`, export: "detailsPage" },
    ],
    web: {
      viteConfig: `${targetRelative}/web/vite.config.ts`,
      publicDir: `${targetRelative}/web/public`,
    },
  };
  const cliPath = relativeModulePath(target, join(frameworkRoot, "scripts/anseronui.mjs"));
  write(join(target, "anseronui.config.json"), JSON.stringify(config, null, 2) + "\n", force);
  write(join(target, "src/pages/home.tsx"), `import { Button, Text, View, definePage, useRouter } from "@anseronui/ui";\nimport type { UIElement } from "@anseronui/ui";\n\nexport function Home(): UIElement {\n  const router = useRouter();\n  return <View style={{ flexDirection: "column", padding: 24, gap: 16, flexGrow: 1, backgroundColor: "#f5f7fb" }}>\n    <Text style={{ fontSize: 24, fontWeight: "bold" }}>Welcome to AnseronUI</Text>\n    <Text>这是一个可运行的跨端页面。</Text>\n    <Button title="打开详情页" onClick={() => { void router.push("details"); }} />\n  </View>;\n}\n\nexport const homePage = definePage("home", Home);\n`, force);
  write(join(target, "src/pages/details.tsx"), `import { Button, Text, View, definePage, useRouter } from "@anseronui/ui";\nimport type { UIElement } from "@anseronui/ui";\n\nexport function Details(): UIElement {\n  const router = useRouter();\n  return <View style={{ flexDirection: "column", padding: 24, gap: 16, flexGrow: 1, backgroundColor: "#ffffff" }}>\n    <Text style={{ fontSize: 22, fontWeight: "bold" }}>详情页</Text>\n    <Text>通过 AnseronUI Router 从 Home 页面进入。</Text>\n    <Button title="返回" onClick={() => { void router.back(); }} />\n  </View>;\n}\n\nexport const detailsPage = definePage("details", Details);\n`, force);
  write(join(target, "web/index.html"), `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title></head><body><header><h1>${name}</h1><p id="status">Loading…</p></header><main id="app"></main><script type="module" src="/main.ts"></script></body></html>\n`, force);
  write(join(target, "web/style.css"), `* { box-sizing: border-box; }\nbody { margin: 0; font: 16px system-ui, sans-serif; color: #17263c; background: #edf2f8; }\nheader, main { width: min(100%, 640px); margin: auto; }\nheader { padding: 20px 16px 12px; }\n.surface { height: 640px; min-height: 480px; background: white; }\n`, force);
  write(join(target, "web/main.ts"), `import { BrowserHost, WasmRuntime } from "@anseronui/render-web";\nimport "./style.css";\n\nconst container = document.querySelector<HTMLElement>("#app")!;\nconst status = document.querySelector<HTMLElement>("#status")!;\nconst routeStack = ["home"];\nlet host: BrowserHost | undefined;\nlet transition = Promise.resolve();\nfunction select(page: string) {\n  transition = transition.then(async () => {\n    await host?.destroy();\n    const root = document.createElement("div"); root.className = "surface"; container.replaceChildren(root);\n    const runtime = await WasmRuntime.load("/core.wasm");\n    host = new BrowserHost(root, runtime, undefined, { router: async (method, args) => {\n      const target = typeof args === "object" && args !== null && "page" in args ? String((args as { page: unknown }).page) : "";\n      if (method === "push") { if (!target) throw new Error("INVALID_ROUTE"); routeStack.push(target); setTimeout(() => { void select(target); }, 0); return null; }\n      if (method === "replace") { if (!target || routeStack.length === 0) throw new Error("INVALID_ROUTE"); routeStack[routeStack.length - 1] = target; setTimeout(() => { void select(target); }, 0); return null; }\n      if (method === "pop" || method === "back") { if (routeStack.length <= 1) throw new Error("ROUTER_EMPTY"); routeStack.pop(); setTimeout(() => { void select(routeStack[routeStack.length - 1]); }, 0); return null; }\n      if (method === "current") return routeStack[routeStack.length - 1] ?? null;\n      throw new Error("UNSUPPORTED_METHOD: " + method);\n    }});\n    await host.mount(page, root.clientWidth, root.clientHeight); status.textContent = "Ready · " + page;\n  }).catch(error => { status.textContent = String(error); console.error(error); });\n}\nwindow.addEventListener("resize", () => { const root = container.firstElementChild as HTMLElement | null; if (root) void host?.resize(root.clientWidth, root.clientHeight); });\nwindow.addEventListener("keydown", async event => { if (event.key !== "Escape" && event.key !== "BrowserBack") return; if (await host?.handleBackPress()) { event.preventDefault(); return; } if (routeStack.length > 1) { event.preventDefault(); routeStack.pop(); select(routeStack[routeStack.length - 1]); } });\nselect("home");\n`, force);
  write(join(target, "web/vite.config.ts"), `import { defineConfig } from "vite";\nimport { fileURLToPath } from "node:url";\nexport default defineConfig({ root: fileURLToPath(new URL(".", import.meta.url)), server: { port: 5175 }, build: { outDir: fileURLToPath(new URL("../dist/web", import.meta.url)), emptyOutDir: true } });\n`, force);
  write(join(target, "package.json"), JSON.stringify({
    name, private: true, type: "module",
    scripts: {
      "build:web": `node ${cliPath} build web --config anseronui.config.json`,
      "build:ios": `node ${cliPath} build ios --config anseronui.config.json`,
      "build:android": `node ${cliPath} build android --config anseronui.config.json`,
      "check": `node ${cliPath} check --config anseronui.config.json`,
    },
  }, null, 2) + "\n", force);
  write(join(target, ".gitignore"), ".verification/\ndist/\nnode_modules/\n", force);
  write(join(target, "README.md"), `# ${name}\n\n这是由 AnseronUI 生成器创建的跨端应用。\n\n## 开发\n\n在 AnseronUI 框架仓库根目录执行：\n\n\`npm run prepare:compiler\`\n\`npm run anseronui -- build web --config ${targetRelative}/anseronui.config.json\`\n\n也可以在本目录执行 \`npm run build:web\`、\`npm run build:ios\` 或 \`npm run build:android\`。\n\n页面入口位于 \`src/pages\`，页面名称和构建入口在 \`anseronui.config.json\` 中维护。\n`, force);
  console.log(`Created AnseronUI app: ${target}`);
  console.log("Next: npm install && npm run check");
}

function integrateApp() {
  const requested = args.find(item => !item.startsWith("-"));
  if (!requested) throw new Error("Usage: anseronui integrate <existing-project> [--force]");
  const target = resolve(process.cwd(), requested);
  if (!existsSync(target)) throw new Error(`Existing project does not exist: ${target}`);
  const force = has("--force");
  const name = sanitizeName(valueAfter("--name", target.split(sep).filter(Boolean).pop() ?? "anseronui-app"));
  const configPath = appConfigPath(target);
  if (existsSync(configPath) && !force) throw new Error(`${configPath} already exists; use --force only after reviewing the existing config`);
  const pageDir = join(target, "src/anseronui/pages");
  const pageRelative = relative(frameworkRoot, pageDir).split(sep).join("/");
  const config = {
    buildId: `${name}-anseronui`,
    sourceDirs: [pageRelative],
    pages: [{ name: "home", source: `${pageRelative}/home.tsx`, export: "homePage" }],
  };
  write(configPath, JSON.stringify(config, null, 2) + "\n", force);
  write(join(pageDir, "home.tsx"), `import { Text, View, definePage } from "@anseronui/ui";\nimport type { UIElement } from "@anseronui/ui";\n\nexport function Home(): UIElement {\n  return <View style={{ flexGrow: 1, padding: 24 }}>\n    <Text style={{ fontSize: 22, fontWeight: "bold" }}>AnseronUI 已接入</Text>\n  </View>;\n}\n\nexport const homePage = definePage("home", Home);\n`, force);
  write(join(target, "ANSERONUI_INTEGRATION.md"), `# AnseronUI 接入清单\n\n此文件由 \`anseronui integrate\` 生成，保留现有应用入口，由业务宿主决定挂载位置。\n\n## 1. 构建配置\n\n- 页面配置：\`anseronui.config.json\`\n- TSX 页面目录：\`src/anseronui/pages\`\n- 在框架仓库根目录运行：\`npm run prepare:compiler\`，然后使用 \`npm run anseronui -- build web --config ${relative(frameworkRoot, configPath).split(sep).join("/")}\` 或对应原生 target。\n\n## 2. iOS\n\n将 \`packages/render-ios\` 作为 Swift Package 或源码 target 引入，创建 \`AnseronUIRenderView\`，约束尺寸后调用：\n\n\`pageView.load(page: "home")\`\n\n页面销毁时调用 \`pageView.destroy()\`。\n\n## 3. Android\n\n将 \`packages/render-android\` 作为 Gradle module/AAR 引入，在 Activity 或 Fragment 中添加 \`AnseronUIRenderView\`，布局完成后调用：\n\n\`pageView.load("home")\`\n\n宿主销毁时调用 \`pageView.destroy()\`。\n\n## 4. Web\n\n使用 \`@anseronui/render-web\` 的 \`BrowserHost\`，加载生成的 Wasm Core，并调用 \`host.mount("home", width, height)\`。\n\n## 5. 业务迁移建议\n\n先把一个页面接入并验证布局、事件和模块，再逐页把原有页面迁移到 \`src/anseronui/pages\`。原有导航、网络和状态管理可以继续保留，由宿主或 AnseronUI module 适配。\n`, force);
  console.log(`AnseronUI integration files created in: ${target}`);
  console.log(`Review ${join(target, "ANSERONUI_INTEGRATION.md")} before linking native targets.`);
}

function checkApp() {
  const configPath = resolve(process.cwd(), valueAfter("--config", "anseronui.config.json"));
  if (!existsSync(configPath)) throw new Error(`Config not found: ${configPath}`);
  const config = json(configPath);
  if (!/^[a-z][a-z0-9_-]*$/.test(config.buildId ?? "")) throw new Error("buildId must start with a lowercase letter");
  if (!Array.isArray(config.pages) || config.pages.length === 0) throw new Error("pages must contain at least one page");
  const names = new Set();
  for (const page of config.pages) {
    if (!/^[A-Za-z_$][\w$]*$/.test(page.export ?? "")) throw new Error(`Invalid page export: ${page.export}`);
    if (names.has(page.export)) throw new Error(`Duplicate page export: ${page.export}`);
    names.add(page.export);
    const sourceCandidates = [resolve(frameworkRoot, page.source), resolve(dirname(configPath), page.source)];
    if (!sourceCandidates.some(existsSync)) throw new Error(`Page source not found: ${page.source}`);
  }
  console.log(`AnseronUI config OK: ${configPath}`);
  console.log(`Pages: ${config.pages.map(page => page.source).join(", ")}`);
}

function buildApp() {
  const target = args.find(item => !item.startsWith("-"));
  if (!target || !["ios", "ios-device", "android", "web"].includes(target)) throw new Error("Usage: anseronui build <ios|ios-device|android|web> --config path");
  const config = resolve(process.cwd(), valueAfter("--config", "anseronui.config.json"));
  if (!existsSync(config)) throw new Error(`Config not found: ${config}`);
  run(process.execPath, ["scripts/build-app.mjs", target], { ...process.env, ANSERONUI_CONFIG: config });
}

try {
  if (command === "create") createApp();
  else if (command === "integrate") integrateApp();
  else if (command === "check") checkApp();
  else if (command === "build") buildApp();
  else {
    console.log("AnseronUI CLI\n\nUsage:\n  npm run anseronui -- create <directory> [--name app-name] [--force]\n  npm run anseronui -- integrate <existing-project> [--name app-name] [--force]\n  npm run anseronui -- check [--config path]\n  npm run anseronui -- build <ios|ios-device|android|web> --config path");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
