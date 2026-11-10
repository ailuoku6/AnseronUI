import { existsSync, readFileSync, realpathSync, readdirSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative, sep, isAbsolute } from 'node:path';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const posix = path => path.split(sep).join('/');
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const qualified = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const packageName = /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/;
function check(condition, message) { if (!condition) throw new Error(`Native plugin: ${message}`); }
function fields(value, allowed, label) {
  check(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  for (const key of Object.keys(value)) check(allowed.includes(key), `${label}: unknown field ${key}`);
}
function strings(value, label, pattern) {
  check(Array.isArray(value) && value.every(item => typeof item === 'string' && (!pattern || pattern.test(item))), `${label} must be an array of valid strings`);
  return value;
}
function inside(root, path) {
  check(typeof path === 'string' && path.length && !isAbsolute(path), `expected package-relative path: ${path}`);
  const result = realpathSync(resolve(root, path));
  const rel = relative(root, result);
  check(rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), `path escapes package: ${path}`);
  return result;
}
function sourceFiles(root, paths, extensions) {
  const files = new Set();
  function walk(path) {
    const entries = readdirSync(path, { withFileTypes: true });
    for (const entry of entries) {
      check(!entry.isSymbolicLink(), `source symlinks are unsupported: ${join(path, entry.name)}`);
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const next = join(path, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (extensions.some(ext => entry.name.endsWith(ext))) files.add(next);
    }
  }
  for (const path of strings(paths, 'sources')) walk(inside(root, path));
  check(files.size, `no ${extensions.join('/')} sources found in ${root}`);
  return [...files].sort();
}
function locate(from, name) {
  check(packageName.test(name), `invalid dependency name ${name}`);
  const resolver = createRequire(join(from, 'package.json'));
  for (const directory of resolver.resolve.paths(name) ?? []) {
    const file = join(directory, name, 'package.json');
    if (existsSync(file)) return realpathSync(file);
  }
  return null;
}

/** Discover installed production dependencies, including transitive and scoped packages. */
export function discoverNativePlugins(app) {
  const seen = new Set(); const plugins = new Map();
  function visit(file) {
    file = realpathSync(file);
    if (seen.has(file)) return;
    seen.add(file);
    const pkg = read(file); const root = dirname(file); const spec = pkg.anseronui;
    if (spec !== undefined) {
      check(packageName.test(pkg.name), `invalid package name ${pkg.name}`);
      check(!plugins.has(pkg.name), `multiple installed versions of ${pkg.name}`);
      check(spec.schemaVersion === 1 || spec.schemaVersion === 2, `${pkg.name}: schemaVersion must be 1 or 2`);
      fields(spec, ['schemaVersion', 'typescript', 'ios', 'android', 'web', ...(spec.schemaVersion === 2 ? ['macos'] : [])], pkg.name);
      const entry = inside(root, spec.typescript);
      check(entry.endsWith('.ts') && !entry.endsWith('.d.ts'), `${pkg.name}: typescript must point to a .ts source entry`);
      const plugin = { name: pkg.name, root, entry };
      for (const platform of ['ios', 'macos']) if (spec[platform] !== undefined) {
        const declaration = spec[platform];
        fields(declaration, ['sources', 'factory', 'frameworks', 'infoPlist'], `${pkg.name}.${platform}`);
        check(typeof declaration.factory === 'string' && identifier.test(declaration.factory), `${pkg.name}: invalid Swift factory type`);
        const frameworks = strings(declaration.frameworks ?? [], `${platform}.frameworks`, identifier);
        const infoPlist = declaration.infoPlist ?? {};
        fields(infoPlist, Object.keys(infoPlist), `${platform}.infoPlist`);
        for (const [key, value] of Object.entries(infoPlist)) check(/^NS[A-Za-z0-9]+UsageDescription$/.test(key) && typeof value === 'string' && value.trim(), `invalid ${platform} usage description ${key}`);
        plugin[platform] = { sources: sourceFiles(root, declaration.sources, ['.swift']), factory: declaration.factory, frameworks, infoPlist };
      }
      if (spec.android !== undefined) {
        fields(spec.android, ['sources', 'factory', 'dependencies', 'permissions'], `${pkg.name}.android`);
        check(typeof spec.android.factory === 'string' && qualified.test(spec.android.factory), `${pkg.name}: invalid Kotlin factory type`);
        plugin.android = {
          sources: strings(spec.android.sources, 'android.sources').map(path => inside(root, path)),
          factory: spec.android.factory,
          dependencies: strings(spec.android.dependencies ?? [], 'android.dependencies', /^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:[A-Za-z0-9_.+-]+$/),
          permissions: strings(spec.android.permissions ?? [], 'android.permissions', qualified),
        };
        sourceFiles(root, spec.android.sources, ['.kt', '.java']);
      }
      if (spec.web !== undefined) {
        fields(spec.web, ['entry'], `${pkg.name}.web`);
        plugin.web = { entry: inside(root, spec.web.entry) };
      }
      check(plugin.ios || plugin.android || plugin.web || plugin.macos, `${pkg.name}: declare at least one platform`);
      plugins.set(pkg.name, plugin);
    }
    const optional = pkg.optionalDependencies ?? {};
    for (const name of Object.keys({ ...pkg.dependencies, ...optional }).sort()) {
      const dependency = locate(root, name);
      if (!dependency) { check(name in optional, `missing dependency ${name}; run npm install`); continue; }
      visit(dependency);
    }
  }
  visit(join(app, 'package.json'));
  return [...plugins.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** Generated outputs belong to the app and are replaced on each setup/build. */
export function generateNativePlugins(app, plugins, target) {
  const platform = target?.startsWith('ios') ? 'ios' : target;
  if (platform) for (const plugin of plugins) check(plugin[platform], `${plugin.name} does not support ${platform}`);
  const directory = join(app, '.anseronui/plugins');
  // Validate before replacing any previous output.
  const infoPlist = {};
  for (const plugin of plugins) for (const [key, value] of Object.entries(plugin.ios?.infoPlist ?? {})) {
    check(!(key in infoPlist) || infoPlist[key] === value, `conflicting iOS usage description ${key}`);
    infoPlist[key] = value;
  }
  mkdirSync(directory, { recursive: true });
  const write = (file, text) => {
    const destination = join(directory, file);
    if (existsSync(destination) && readFileSync(destination, 'utf8') === text) return;
    const temporary = destination + `.${process.pid}.tmp`;
    writeFileSync(temporary, text);
    renameSync(temporary, destination);
  };
  const ios = plugins.filter(plugin => plugin.ios);
  write('ios.json', JSON.stringify({ sources: ios.flatMap(plugin => plugin.ios.sources), frameworks: [...new Set(ios.flatMap(plugin => plugin.ios.frameworks))], infoPlist }, null, 2));
  write('GeneratedPlugins.swift', `// Generated by AnseronUI. Do not edit.\nimport Foundation\n@MainActor enum AnseronUIPlugins {\n    static func makeExtensions() -> IOSPlatformExtensions {\n        let result = IOSPlatformExtensions()\n${ios.map(plugin => `        do {\n            let next = ${plugin.ios.factory}.createExtensions()\n            for (name, handler) in next.modules {\n                precondition(!["http", "timer", "__view", "router", "events"].contains(name) && result.modules[name] == nil, "Duplicate or reserved native module: \\(name)")\n                result.modules[name] = handler\n            }\n            for (name, source) in next.subscriptions {\n                precondition(result.subscriptions[name] == nil, "Duplicate native subscription")\n                result.subscriptions[name] = source\n            }\n            for (name, factory) in next.components {\n                precondition(result.components[name] == nil, "Duplicate native component: \\(name)")\n                result.components[name] = factory\n            }\n        }`).join('\n')}\n        return result\n    }\n}\n`);
  const macos = plugins.filter(plugin => plugin.macos);
  const macosDescriptions = {};
  for (const plugin of macos) for (const [key, value] of Object.entries(plugin.macos.infoPlist)) {
    check(!(key in macosDescriptions) || macosDescriptions[key] === value, `conflicting macOS usage description ${key}`);
    macosDescriptions[key] = value;
  }
  write('macos.json', JSON.stringify({ sources: macos.flatMap(plugin => plugin.macos.sources), frameworks: [...new Set(macos.flatMap(plugin => plugin.macos.frameworks))], infoPlist: macosDescriptions }, null, 2));
  write('GeneratedMacOSPlugins.swift', `// Generated by AnseronUI. Do not edit.
import Foundation
@MainActor enum AnseronUIPlugins {
    static func makeExtensions() -> MacOSPlatformExtensions {
        let result = MacOSPlatformExtensions()
${macos.map(plugin => `        do {
            let next = ${plugin.macos.factory}.createExtensions()
            for (name, handler) in next.modules {
                precondition(!["http", "timer", "__view", "router", "events"].contains(name) && result.modules[name] == nil, "Duplicate or reserved native module")
                result.modules[name] = handler
            }
            for (name, source) in next.subscriptions {
                precondition(result.subscriptions[name] == nil, "Duplicate native subscription")
                result.subscriptions[name] = source
            }
            for (name, factory) in next.components {
                precondition(result.components[name] == nil, "Duplicate native component")
                result.components[name] = factory
            }
        }`).join('\n')}
        return result
    }
}
`);
  const android = plugins.filter(plugin => plugin.android);
  write('GeneratedPlugins.kt', `// Generated by AnseronUI. Do not edit.\npackage org.anseronui.generated\nimport android.content.Context\nimport org.anseronui.render.*\nobject AnseronUIPlugins {\n    fun makeExtensions(context: Context): AndroidPlatformExtensions {\n        val modules = mutableMapOf<String, NativeModuleHandler>()\n        val components = mutableMapOf<String, NativeComponentFactory>()\n        val subscriptions = mutableMapOf<String, NativeEventSource>()\n${android.map(plugin => `        run {\n            val next = ${plugin.android.factory}.createExtensions(context)\n            for ((name, handler) in next.modules) {\n                require(name !in listOf("http", "timer", "__view", "router", "events") && name !in modules) { "Duplicate or reserved native module: $name" }\n                modules[name] = handler\n            }\n            for ((name, source) in next.subscriptions) {\n                require(name !in subscriptions) { "Duplicate native subscription: $name" }\n                subscriptions[name] = source\n            }\n            for ((name, factory) in next.components) {\n                require(name !in components) { "Duplicate native component: $name" }\n                components[name] = factory\n            }\n        }`).join('\n')}\n        return AndroidPlatformExtensions(modules, components, subscriptions)\n    }\n}\n`);
  // Gradle consumes JSON instead of executable snippets from package metadata.
  write('android.json', JSON.stringify({ sources: android.flatMap(plugin => plugin.android.sources), dependencies: [...new Set(android.flatMap(plugin => plugin.android.dependencies))], permissions: [...new Set(android.flatMap(plugin => plugin.android.permissions))] }, null, 2));
  const typeImport = read(join(app, 'anseronui.config.json')).schemaVersion === 2 ? 'anseronui/render-web' : '@anseronui/render-web';
  const web = plugins.filter(plugin => plugin.web);
  write('web.ts', `${web.map((plugin, i) => `import { createExtensions as plugin${i} } from ${JSON.stringify('./' + posix(relative(directory, plugin.web.entry)).replace(/\.ts$/, ''))};`).join('\n')}\nimport type { PlatformExtensions } from '${typeImport}';\nexport function createPluginExtensions(): PlatformExtensions {\n  const result: PlatformExtensions = { modules: Object.create(null), components: Object.create(null), subscriptions: Object.create(null) };\n  const plugins: PlatformExtensions[] = [${web.map((_, i) => `plugin${i}()`).join(', ')}];\n  for (const next of plugins) {\n    for (const [name, handler] of Object.entries(next.modules ?? {})) {\n      if (['http', 'timer', '__view', 'router', 'events'].includes(name) || Object.hasOwn(result.modules!, name)) throw new Error('Duplicate or reserved native module: ' + name);\n      result.modules![name] = handler;\n    }\n    for (const [name, source] of Object.entries(next.subscriptions ?? {})) {\n      if (Object.hasOwn(result.subscriptions!, name)) throw new Error('Duplicate native subscription: ' + name);\n      result.subscriptions![name] = source;\n    }\n    for (const [name, factory] of Object.entries(next.components ?? {})) {\n      if (Object.hasOwn(result.components!, name)) throw new Error('Duplicate native component: ' + name);\n      result.components![name] = factory;\n    }\n  }\n  return result;\n}\n`);
  return directory;
}

export function pluginBuildConfig(config, framework, plugins) {
  const result = structuredClone(config);
  result.npmPlugins = plugins.map(plugin => ({ name: plugin.name, entry: posix(relative(framework, plugin.entry)) }));
  result.sourceDirs = [...new Set([...result.sourceDirs, ...plugins.map(plugin => posix(relative(framework, dirname(plugin.entry))))])];
  return result;
}
