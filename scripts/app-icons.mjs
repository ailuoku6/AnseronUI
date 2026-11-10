import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, realpathSync, copyFileSync, cpSync, rmSync, renameSync } from 'node:fs';
import { resolve, join, dirname, extname, basename, relative, isAbsolute, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

// create/help/check without icons also work from an unpacked SDK before npm install.
const require = createRequire(import.meta.url);
const pngLibrary = () => require('pngjs').PNG;

const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const posix = path => path.split(sep).join('/');
const check = (condition, message) => { if (!condition) throw new Error(`App icon: ${message}`); };
const write = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, value); };
const json = file => JSON.parse(readFileSync(file, 'utf8'));
function fields(value, allowed, label) {
  check(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  for (const key of Object.keys(value)) check(allowed.includes(key), `${label}: unknown field ${key}`);
}
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    check(!entry.isSymbolicLink(), `resource directory contains a symlink: ${join(directory, entry.name)}`);
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

/** Validate on every host without requiring Xcode or the Android SDK. Paths are app-relative. */
export function validateIconConfig(app, config) {
  const declaration = config.app?.icon;
  if (declaration === undefined) return { inputs: [] };
  const spec = typeof declaration === 'string' ? { default: declaration } : declaration;
  fields(spec, ['default', 'ios', 'android', 'macos', 'web'], 'app.icon');
  const inputs = new Set(); const images = new Map();
  function input(value, label, directory = false) {
    check(typeof value === 'string' && value.length && !isAbsolute(value), `${label} must be a nonempty app-relative path`);
    const path = resolve(app, value);
    check(existsSync(path) && statSync(path).isDirectory() === directory, `${label} ${directory ? 'directory' : 'file'} not found: ${value}`);
    const generated = relative(resolve(app, '.anseronui'), realpathSync(path));
    check(generated === '..' || generated.startsWith('..' + sep) || isAbsolute(generated), `${label} must be outside .anseronui/`);
    for (const file of directory ? filesIn(path) : [path]) inputs.add(file);
    return path;
  }
  function png(value, label, { ios = false, opaque = false, grayscale = false } = {}) {
    const path = input(value, label);
    check(extname(path).toLowerCase() === '.png', `${label} must be a PNG image`);
    if (!images.has(path)) {
      const bytes = readFileSync(path);
      check(bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), `${label} is not a PNG image`);
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      check(width > 0 && width === height && width <= 4096, `${label} must be square, at most 4096 × 4096`);
      const PNG = pngLibrary();
      try { images.set(path, PNG.sync.read(bytes)); } catch { throw new Error(`App icon: invalid PNG: ${value}`); }
    }
    const image = images.get(path);
    check(!ios || image.width === 1024, `${label} must be 1024 × 1024`);
    for (let i = 0; i < image.data.length; i += 4) {
      check(!opaque || image.data[i + 3] === 255, `${label} must not contain transparent pixels`);
      check(!grayscale || image.data[i + 3] === 0 || (image.data[i] === image.data[i + 1] && image.data[i] === image.data[i + 2]), `${label} must be grayscale`);
    }
    return path;
  }
  function drawable(value, label) {
    if (typeof value === 'string' && value.toLowerCase().endsWith('.png')) return png(value, label);
    const path = input(value, label);
    check(extname(path) === '.xml' && /<vector\b/.test(readFileSync(path, 'utf8')), `${label} must be PNG or Android Vector Drawable XML (SVG is unsupported)`);
    return path;
  }
  function background(value, label) {
    fields(value, ['color', 'image'], label);
    check((value.color !== undefined) !== (value.image !== undefined), `${label} requires exactly one of color or image`);
    if (value.color !== undefined) {
      check(/^#(?:[\da-f]{6}|[\da-f]{8})$/i.test(value.color), `${label}.color must be #RRGGBB or #AARRGGBB`);
      return { color: value.color };
    }
    return { image: drawable(value.image, `${label}.image`) };
  }
  const fallback = spec.default === undefined ? undefined : png(spec.default, 'app.icon.default');
  let ios;
  if (spec.ios !== undefined) {
    fields(spec.ios, ['type', 'light', 'dark', 'tinted', 'source'], 'app.icon.ios');
    const type = spec.ios.type ?? 'images';
    check(['images', 'composer', 'appiconset'].includes(type), 'ios.type must be images, composer or appiconset');
    if (type === 'images') {
      check(spec.ios.source === undefined, 'ios.source cannot be combined with images');
      const light = spec.ios.light ?? spec.default;
      check(light !== undefined, 'ios.light or app.icon.default is required');
      ios = { type, light: png(light, 'ios.light', { ios: true, opaque: true }) };
      for (const variant of ['dark', 'tinted']) if (spec.ios[variant] !== undefined) ios[variant] = png(spec.ios[variant], `ios.${variant}`, { ios: true, grayscale: variant === 'tinted' });
    } else {
      check(['light', 'dark', 'tinted'].every(key => spec.ios[key] === undefined), `ios.${type} cannot be combined with light/dark/tinted`);
      const source = input(spec.ios.source, 'ios.source', true);
      check(source.endsWith(type === 'composer' ? '.icon' : '.appiconset'), `ios.source must be a ${type === 'composer' ? '.icon' : '.appiconset'} directory`);
      const contents = join(source, type === 'composer' ? 'icon.json' : 'Contents.json');
      check(existsSync(contents), `missing ${contents}`);
      const content = json(contents);
      if (type === 'appiconset') {
        check(Array.isArray(content.images) && content.images.some(image => image.filename), 'appiconset requires image entries');
        for (const image of content.images) if (image.filename) {
          check(basename(image.filename) === image.filename && existsSync(join(source, image.filename)), `appiconset image missing or invalid: ${image.filename}`);
        }
      }
      ios = { type, source };
    }
  } else if (fallback) ios = { type: 'images', light: png(spec.default, 'app.icon.default (iOS)', { ios: true, opaque: true }) };
  let android;
  if (spec.android !== undefined) {
    const a = spec.android;
    fields(a, ['legacy', 'round', 'adaptive', 'night', 'resources'], 'app.icon.android');
    if (a.resources !== undefined) {
      check(Object.keys(a).length === 1, 'android.resources cannot be combined with generated Android icon fields');
      const resources = input(a.resources, 'android.resources', true);
      check(['mipmap-anydpi-v26/ic_launcher.xml', 'mipmap-anydpi/ic_launcher.xml', 'mipmap-mdpi/ic_launcher.png'].some(file => existsSync(join(resources, file))), 'android.resources must define @mipmap/ic_launcher');
      android = { resources };
    } else {
      android = {};
      if (a.legacy ?? spec.default) android.legacy = png(a.legacy ?? spec.default, 'android.legacy');
      if (a.round !== undefined) android.round = png(a.round, 'android.round');
      if (a.adaptive !== undefined) {
        fields(a.adaptive, ['foreground', 'background', 'monochrome'], 'android.adaptive');
        android.adaptive = { foreground: drawable(a.adaptive.foreground, 'android.adaptive.foreground'), background: background(a.adaptive.background, 'android.adaptive.background') };
        if (a.adaptive.monochrome !== undefined) android.adaptive.monochrome = drawable(a.adaptive.monochrome, 'android.adaptive.monochrome');
      }
      check(android.legacy || android.adaptive, 'Android requires legacy, adaptive or app.icon.default');
      if (a.night !== undefined) {
        fields(a.night, ['legacy', 'round', 'foreground', 'background', 'monochrome'], 'android.night');
        check(Object.keys(a.night).length, 'android.night must not be empty');
        android.night = {};
        for (const key of ['legacy', 'round']) if (a.night[key] !== undefined) android.night[key] = png(a.night[key], `android.night.${key}`);
        for (const key of ['foreground', 'monochrome']) if (a.night[key] !== undefined) {
          check(android.adaptive && (key !== 'monochrome' || android.adaptive.monochrome), `android.night.${key} requires a matching adaptive layer`);
          android.night[key] = drawable(a.night[key], `android.night.${key}`);
        }
        if (a.night.background !== undefined) {
          check(android.adaptive, 'android.night.background requires adaptive');
          android.night.background = background(a.night.background, 'android.night.background');
        }
        check(!android.night.legacy || android.legacy, 'android.night.legacy requires legacy');
        check(!android.night.round || android.round, 'android.night.round requires round');
      }
    }
  } else if (fallback) android = { legacy: fallback };
  let macos = fallback, web = fallback;
  if (spec.macos !== undefined) {
    check(typeof spec.macos === 'string', 'macos must be a PNG or ICNS path');
    macos = spec.macos.endsWith('.icns') ? input(spec.macos, 'macos') : png(spec.macos, 'macos');
    if (spec.macos.endsWith('.icns')) {
      const bytes = readFileSync(macos);
      check(bytes.length >= 8 && bytes.toString('ascii', 0, 4) === 'icns' && bytes.readUInt32BE(4) === bytes.length, 'macos must be a valid ICNS file');
    }
  }
  if (spec.web !== undefined) web = png(spec.web, 'web');
  check(ios || android || macos || web, 'app.icon must configure at least one platform');
  return { ios, android, macos, web, inputs: [...inputs].sort() };
}

// Area resampling with premultiplied alpha preserves thin glyphs and avoids dark fringes.
export function resizeIcon(path, size, opaque = false) {
  const PNG = pngLibrary();
  const source = PNG.sync.read(readFileSync(path));
  const output = new PNG({ width: size, height: size });
  const ratio = source.width / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const left = x * ratio, top = y * ratio, right = (x + 1) * ratio, bottom = (y + 1) * ratio;
    let alpha = 0, weight = 0; const rgb = [0, 0, 0];
    for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++) for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
      const w = (Math.min(right, sx + 1) - Math.max(left, sx)) * (Math.min(bottom, sy + 1) - Math.max(top, sy));
      const index = (Math.min(sy, source.height - 1) * source.width + Math.min(sx, source.width - 1)) * 4;
      const a = source.data[index + 3] / 255;
      alpha += a * w; weight += w;
      for (let c = 0; c < 3; c++) rgb[c] += source.data[index + c] * a * w;
    }
    const index = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) output.data[index + c] = alpha ? Math.round(rgb[c] / alpha) : 0;
    output.data[index + 3] = Math.round(255 * alpha / weight);
  }
  return PNG.sync.write(output, { colorType: opaque ? 2 : 6 });
}

function generateIOS(directory, icon) {
  if (icon.type === 'composer') {
    cpSync(icon.source, join(directory, 'AppIcon.icon'), { recursive: true });
    return { name: 'AppIcon', path: join(directory, 'AppIcon.icon'), fileType: 'folder.iconcomposer.icon' };
  }
  const catalog = join(directory, 'Assets.xcassets'), set = join(catalog, 'AppIcon.appiconset');
  if (icon.type === 'appiconset') cpSync(icon.source, set, { recursive: true });
  else {
    const images = [];
    for (const key of ['light', 'dark', 'tinted']) if (icon[key]) {
      write(join(set, key + '.png'), resizeIcon(icon[key], 1024, key === 'light'));
      images.push({ filename: key + '.png', idiom: 'universal', platform: 'ios', size: '1024x1024', ...(key !== 'light' ? { appearances: [{ appearance: 'luminosity', value: key }] } : {}) });
    }
    write(join(set, 'Contents.json'), JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2));
  }
  write(join(catalog, 'Contents.json'), JSON.stringify({ info: { author: 'xcode', version: 1 } }));
  return { name: 'AppIcon', path: catalog, fileType: 'folder.assetcatalog' };
}

function generateAndroid(directory, icon, projectDirectory) {
  const res = join(directory, 'res');
  if (icon.resources) cpSync(icon.resources, res, { recursive: true });
  else {
    function legacy(path, name, night = false) {
      if (!path) return;
      for (const [density, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) write(join(res, `mipmap-${night ? 'night-' : ''}${density}`, name + '.png'), resizeIcon(path, size));
    }
    legacy(icon.legacy, 'ic_launcher'); legacy(icon.round, 'ic_launcher_round');
    legacy(icon.night?.legacy, 'ic_launcher', true); legacy(icon.night?.round, 'ic_launcher_round', true);
    function layer(path, name, night = false) {
      if (extname(path) === '.xml') write(join(res, `drawable${night ? '-night' : ''}`, name + '.xml'), readFileSync(path));
      else for (const [density, size] of [['mdpi',108], ['hdpi',162], ['xhdpi',216], ['xxhdpi',324], ['xxxhdpi',432]]) write(join(res, `drawable-${night ? 'night-' : ''}${density}`, name + '.png'), resizeIcon(path, size));
    }
    function layers(value, night = false) {
      for (const key of ['foreground', 'monochrome']) if (value[key]) layer(value[key], 'anseronui_icon_' + key, night);
      if (value.background) {
        if (value.background.image) layer(value.background.image, 'anseronui_icon_background_image', night);
        const drawable = value.background.image ? '@drawable/anseronui_icon_background_image' : value.background.color;
        write(join(res, `values${night ? '-night' : ''}`, 'anseronui_icon.xml'), `<resources><item type="drawable" name="anseronui_icon_background">${xml(drawable)}</item></resources>\n`);
      }
    }
    if (icon.adaptive) {
      layers(icon.adaptive); if (icon.night) layers(icon.night, true);
      for (const version of [26, ...(icon.adaptive.monochrome ? [33] : [])]) {
        const content = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@drawable/anseronui_icon_background"/><foreground android:drawable="@drawable/anseronui_icon_foreground"/>${version === 33 ? '<monochrome android:drawable="@drawable/anseronui_icon_monochrome"/>' : ''}</adaptive-icon>\n`;
        write(join(res, `mipmap-anydpi-v${version}`, 'ic_launcher.xml'), content);
        // Night PNGs otherwise outrank the unqualified adaptive resource during
        // Android's configuration selection, losing the launcher mask entirely.
        if (icon.night) write(join(res, `mipmap-night-anydpi-v${version}`, 'ic_launcher.xml'), content);
      }
    }
  }
  const round = filesIn(res).some(path => /^mipmap[^/]*\/ic_launcher_round\.(png|xml|webp)$/.test(posix(relative(res, path)))) ? 'ic_launcher_round' : 'ic_launcher';
  const appRoot = dirname(dirname(dirname(directory)));
  const generated = posix(relative(projectDirectory, join(appRoot, '.anseronui')));
  // Applied after the host's plugin setup, preserving its permission overlay and manifest.
  write(join(directory, '../android.gradle'), `// Generated by AnseronUI. Do not edit.\nandroid.sourceSets.main.res.srcDir rootProject.file('${generated}/icons/android/res')\ndef iconOverlay = rootProject.file('${generated}/icons/android/AndroidManifest.xml')\ndef pluginOverlay = rootProject.file('${generated}/plugins/AndroidManifest.xml')\ndef manifest = pluginOverlay.exists() ? pluginOverlay.text : '<manifest xmlns:android="http://schemas.android.com/apk/res/android"></manifest>'\nmanifest = manifest.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ')\niconOverlay.text = manifest.replace('</manifest>', '<application android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/${round}" tools:replace="android:icon,android:roundIcon" /></manifest>')\nandroid.sourceSets.debug.manifest.srcFile iconOverlay\nandroid.sourceSets.release.manifest.srcFile iconOverlay\n`);
  return { res };
}

function generateMacOS(directory, path) {
  const output = join(directory, 'AppIcon.icns');
  if (extname(path) === '.icns') { mkdirSync(directory, { recursive: true }); copyFileSync(path, output); }
  else {
    const chunks = [['icp4',16], ['icp5',32], ['icp6',64], ['ic07',128], ['ic08',256], ['ic09',512], ['ic10',1024], ['ic11',32], ['ic12',64], ['ic13',256], ['ic14',512]].map(([type,size]) => {
      const data = resizeIcon(path, size); const header = Buffer.alloc(8);
      header.write(type); header.writeUInt32BE(data.length + 8, 4);
      return Buffer.concat([header, data]);
    });
    const header = Buffer.alloc(8); header.write('icns'); header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
    write(output, Buffer.concat([header, ...chunks]));
  }
  return { path: output };
}

/** Only replace this target's generated files; original host resources remain untouched. */
export function generateAppIcons(app, config, target, { androidProjectDir = 'platforms/android' } = {}) {
  const normalized = validateIconConfig(app, config);
  const platform = target.startsWith('ios') ? 'ios' : target;
  check(['ios', 'android', 'macos', 'web'].includes(platform), `unknown platform ${platform}`);
  const directory = join(app, '.anseronui/icons', platform), staging = directory + '.tmp';
  rmSync(staging, { recursive: true, force: true }); mkdirSync(staging, { recursive: true });
  const icon = normalized[platform]; let result;
  try {
    if (icon) {
      if (platform === 'ios') result = generateIOS(staging, icon);
      else if (platform === 'android') result = generateAndroid(staging, icon, resolve(app, androidProjectDir));
      else if (platform === 'macos') result = generateMacOS(staging, icon);
      else { write(join(staging, 'anseronui-icon.png'), resizeIcon(icon, 256)); result = { path: join(staging, 'anseronui-icon.png') }; }
    } else if (platform === 'android') write(join(directory, '../android.gradle'), '// No configured Android icon.\n');
    rmSync(directory, { recursive: true, force: true }); renameSync(staging, directory);
    if (result?.path) result.path = result.path.replace(staging + sep, directory + sep);
    if (result?.res) result.res = result.res.replace(staging + sep, directory + sep);
    return { ...result, enabled: !!icon, inputs: normalized.inputs };
  } catch (error) { rmSync(staging, { recursive: true, force: true }); throw error; }
}

export function integrateAndroidIcons(app, { projectDir = 'platforms/android' } = {}) {
  const project = resolve(app, projectDir);
  const file = join(project, 'app/build.gradle');
  const generated = posix(relative(project, join(app, '.anseronui/icons/android.gradle')));
  const marker = '// AnseronUI app icon integration';
  const content = readFileSync(file, 'utf8');
  if (!content.includes(marker)) write(file, content + `\n${marker}\ndef appIconConfig = rootProject.file('${generated}')\nif (appIconConfig.exists()) apply from: appIconConfig\n`);
}

/** Patch the freshly generated project, so existing app-local generators keep working. */
export function integrateIOSIcons(app, icon, { projectFile = 'platforms/ios/App.xcodeproj/project.pbxproj', targetName = 'App' } = {}) {
  if (!icon.enabled) return;
  const version = spawnSync('xcodebuild', ['-version'], { encoding: 'utf8' });
  const major = Number(version.stdout?.match(/Xcode (\d+)/)?.[1]);
  check(major >= (icon.fileType === 'folder.iconcomposer.icon' ? 26 : 16), `iOS icons require Xcode ${icon.fileType === 'folder.iconcomposer.icon' ? 26 : 16}+`);
  const file = resolve(app, projectFile);
  const sourceRoot = dirname(dirname(file));
  const parsed = spawnSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' });
  check(parsed.status === 0, `cannot read generated Xcode project: ${parsed.stderr || parsed.stdout}`);
  const project = JSON.parse(parsed.stdout), objects = project.objects;
  const target = Object.values(objects).find(value => value.isa === 'PBXNativeTarget' && value.name === targetName);
  check(target, `generated iOS project must contain ${targetName} target`);
  const add = value => { const id = createHash('sha256').update('anseronui-app-icon:' + JSON.stringify(value)).digest('hex').slice(0,24).toUpperCase(); objects[id] = value; return id; };
  const ref = add({ isa: 'PBXFileReference', lastKnownFileType: icon.fileType, path: posix(relative(sourceRoot, icon.path)), sourceTree: 'SOURCE_ROOT' });
  const build = add({ isa: 'PBXBuildFile', fileRef: ref });
  const phase = target.buildPhases.map(id => objects[id]).find(value => value.isa === 'PBXResourcesBuildPhase');
  check(phase, 'generated iOS project has no resource build phase');
  if (!phase.files.includes(build)) phase.files.push(build);
  const group = objects[objects[project.rootObject].mainGroup];
  if (!group.children.includes(ref)) group.children.push(ref);
  for (const id of objects[target.buildConfigurationList].buildConfigurations) objects[id].buildSettings.ASSETCATALOG_COMPILER_APPICON_NAME = icon.name;
  function encode(value) {
    if (Array.isArray(value)) return '(' + value.map(encode).join(', ') + ')';
    if (value && typeof value === 'object') return '{\n' + Object.entries(value).map(([key, item]) => JSON.stringify(key) + ' = ' + encode(item) + ';\n').join('') + '}';
    return JSON.stringify(value);
  }
  write(file, '// !$*UTF8*$!\n' + encode(project) + '\n');
}

/** Vite integration is supplied by the CLI, including for apps created with older templates. */
export function appIconWebPlugin(app, config) {
  let base = '/', command;
  return {
    name: 'anseronui-app-icon',
    configResolved(resolved) { base = resolved.base; command = resolved.command; },
    buildStart() {
      if (command !== 'build') return;
      const icon = generateAppIcons(app, config, 'web');
      if (icon.enabled) this.emitFile({ type: 'asset', fileName: 'anseronui-icon.png', source: readFileSync(icon.path) });
    },
    transformIndexHtml() {
      if (!config.app?.icon || !validateIconConfig(app, config).web) return;
      return [{ tag: 'link', attrs: { rel: 'icon', type: 'image/png', href: base + 'anseronui-icon.png' }, injectTo: 'head' }];
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== base + 'anseronui-icon.png') return next();
        const source = validateIconConfig(app, config).web;
        if (!source) return next();
        response.setHeader('Content-Type', 'image/png'); response.setHeader('Cache-Control', 'no-cache'); response.end(resizeIcon(source, 256));
      });
    },
  };
}
