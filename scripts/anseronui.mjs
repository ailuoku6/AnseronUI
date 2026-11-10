#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, join, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createStandalone, buildStandalone, runStandalone, setupStandalone, typecheckStandalone, devStandalone } from "./standalone-app.mjs";

import { discoverNativePlugins } from "./native-plugins.mjs";

const frameworkRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const requestedCommand = process.argv[2] ?? "help";
const command = ["--help", "-h"].includes(requestedCommand) ? "help" : ["--version", "-v"].includes(requestedCommand) ? "version" : requestedCommand;
const args = process.argv.slice(3);
let parsed;

function fail(message) { console.error(`AnseronUI: ${message}`); process.exitCode = 1; }
function valueAfter(name, fallback = undefined) { return parsed.values[name.replace(/^--/, '')] ?? fallback; }
function has(name) { return !!parsed.values[name.replace(/^--/, '')]; }
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
function run(commandName, commandArgs, env = process.env) {
  const result = spawnSync(commandName, commandArgs, { cwd: frameworkRoot, stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function createApp() {
  const target = parsed.positionals[0];
  if (!target) throw new Error("Usage: anseronui create <directory> [--name AppName] [--application-id com.example.app]");
  createStandalone(target, { name: parsed.values.name, applicationId: parsed.values['application-id'], force: parsed.values.force, localFramework: parsed.values['local-framework'], packageSpec: parsed.values.package });
}

function integrateApp() {
  const requested = parsed.positionals[0];
  if (!requested) throw new Error("Usage: anseronui integrate <existing-project> [--force]");
  const target = resolve(process.cwd(), requested);
  if (!existsSync(target)) throw new Error(`Existing project does not exist: ${target}`);
  const force = has("--force");
  const name = sanitizeName(valueAfter("--name", target.split(/[\\/]/).filter(Boolean).pop() ?? "anseronui-app"));
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
  write(join(target, "ANSERONUI_INTEGRATION.md"), `# AnseronUI 接入清单\n\n此文件由 \`anseronui integrate\` 生成，保留现有应用入口，由业务宿主决定挂载位置。\n\n## 1. 构建配置\n\n- 页面配置：\`anseronui.config.json\`\n- TSX 页面目录：\`src/anseronui/pages\`\n- 在框架仓库根目录运行：\`npm run prepare:compiler\`，然后使用 \`npm run anseronui -- build web --config ${relative(frameworkRoot, configPath).split(sep).join("/")}\` 或对应原生 target。\n\n## 2. iOS\n\n将 \`packages/render-ios\` 作为 Swift Package 或源码 target 引入，创建 \`AnseronUIRenderView\`，约束尺寸后调用：\n\n\`pageView.load(page: "home")\`\n\n页面销毁时调用 \`pageView.destroy()\`。\n\n## 3. Android\n\n将 \`packages/render-android\` 作为 Gradle module/AAR 引入，在 Activity 或 Fragment 中添加 \`AnseronUIRenderView\`，布局完成后调用：\n\n\`pageView.load("home")\`\n\n宿主销毁时调用 \`pageView.destroy()\`。\n\n## 4. Web\n\n使用 \`@anseronui/render-web\` 的 \`BrowserHost\`，加载生成的 Wasm Core，并调用 \`host.mount("home", width, height)\`。\n\n## 5. macOS\n\n将 \`packages/render-macos\` 作为 Swift Package 或源码 target 引入，编译 C transport 并链接 \`macos-arm64\` Core archive。创建 AppKit \`AnseronUIRenderView\`，约束到 NSWindow 内容区域后调用 \`pageView.load(page: "home")\`，结束使用时调用 \`pageView.destroy()\`。具体链接步骤与最低系统验证边界见框架的 \`packages/render-macos/README.md\`。\n\n## 6. 业务迁移建议\n\n先把一个页面接入并验证布局、事件和模块，再逐页把原有页面迁移到 \`src/anseronui/pages\`。原有导航、网络和状态管理可以继续保留，由宿主或 AnseronUI module 适配。\n`, force);
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
    const sourceCandidates = config.schemaVersion === 2 ? [resolve(dirname(configPath), page.source)] : [resolve(frameworkRoot, page.source), resolve(dirname(configPath), page.source)];
    if (!sourceCandidates.some(existsSync)) throw new Error(`Page source not found: ${page.source}`);
  }
  if (config.app && existsSync(join(dirname(configPath), "node_modules"))) {
    const plugins = discoverNativePlugins(dirname(configPath));
    console.log(`Native plugins: ${plugins.map(plugin => plugin.name).join(", ") || "(none)"}`);
  }
  console.log(`AnseronUI config OK: ${configPath}`);
  console.log(`Pages: ${config.pages.map(page => page.source).join(", ")}`);
}

function buildApp() {
  const target = parsed.positionals[0];
  if (!target || !["ios", "ios-device", "android", "web", "macos"].includes(target)) throw new Error("Usage: anseronui build <ios|ios-device|android|web|macos> --config path");
  const config = resolve(process.cwd(), valueAfter("--config", "anseronui.config.json"));
  if (!existsSync(config)) throw new Error(`Config not found: ${config}`);
  if (json(config).app) buildStandalone(config, target);
  else run(process.execPath, ["scripts/build-app.mjs", target], { ...process.env, ANSERONUI_CONFIG: config });
}

try {
  parsed = parseArgs({ args, allowPositionals: true, options: {
    name: { type: 'string' }, 'application-id': { type: 'string' }, config: { type: 'string' },
    device: { type: 'string' }, avd: { type: 'string' },
    package: { type: 'string' }, 'local-framework': { type: 'boolean' }, force: { type: 'boolean' }, 'no-build': { type: 'boolean' }, 'dry-run': { type: 'boolean' },
  } });
  if (command === "version") console.log(json(join(frameworkRoot, "package.json")).version);
  else if (command === "create") createApp();
  else if (command === "integrate") integrateApp();
  else if (command === "check") checkApp();
  else if (command === "build") buildApp();
  else if (command === "run") await runStandalone(resolve(process.cwd(), parsed.values.config ?? 'anseronui.config.json'), parsed.positionals[0], parsed.values);
  else if (command === "setup") setupStandalone(resolve(process.cwd(), parsed.values.config ?? 'anseronui.config.json'), { prepareCompiler: true });
  else if (command === "typecheck") typecheckStandalone(resolve(process.cwd(), parsed.values.config ?? 'anseronui.config.json'));
  else if (command === "dev" && parsed.positionals[0] === 'web') devStandalone(resolve(process.cwd(), parsed.values.config ?? 'anseronui.config.json'));
  else {
    if (command !== 'help') throw new Error(`Unknown command: ${command}`);
    console.log(`AnseronUI CLI

  create <directory> [--name AppName] [--application-id com.example.app] [--package specifier] [--local-framework] [--force]
  setup | check | typecheck [--config path]
  build <ios|ios-device|android|web|macos> [--config path]
  run ios [--device UUID-or-name] [--no-build] [--dry-run] [--config path]
  run android [--device serial | --avd name] [--no-build] [--dry-run] [--config path]
  run macos [--no-build] [--dry-run] [--config path]
  dev web [--config path]
  integrate <existing-project> [--name app-name] [--force]

From a generated app: npm run ios / npm run android / npm run macos.
iOS run targets simulators; iOS devices require your own signing configuration.`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
