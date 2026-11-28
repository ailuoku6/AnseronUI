import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Development-only rasterizer. Install from the repository root:
// npm install --prefix .verification/ljump-icon-tools --no-save --no-package-lock @resvg/resvg-js
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = fileURLToPath(new URL('../assets/icons/', import.meta.url));
const { Resvg } = require(join(root, '.verification/ljump-icon-tools/node_modules/@resvg/resvg-js'));
const { PNG } = require('pngjs');
const source = readFileSync(join(directory, 'app.svg'), 'utf8');
function render(svg, size, filename) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(directory, filename), png);
  return png;
}
render(source, 1024, 'app-macos.png');
const square = source.replace('id="tile" x="64" y="64" width="896" height="896" rx="202"', 'id="tile" x="0" y="0" width="1024" height="1024" rx="0"');
render(square, 1024, 'app.png');
render(square.replace('#ffffff"/><stop offset="1" stop-color="#e2eaf7', '#252c3c"/><stop offset="1" stop-color="#101725'), 1024, 'app-dark.png');
const tinted = PNG.sync.read(readFileSync(join(directory, 'app-dark.png')));
for (let offset = 0; offset < tinted.data.length; offset += 4) {
  const gray = Math.round(tinted.data[offset] * .2126 + tinted.data[offset + 1] * .7152 + tinted.data[offset + 2] * .0722);
  tinted.data[offset] = gray; tinted.data[offset + 1] = gray; tinted.data[offset + 2] = gray;
}
writeFileSync(join(directory, 'app-tinted.png'), PNG.sync.write(tinted));
render(source, 128, 'app-preview.png');
render(source, 32, 'app-small.png');
render(readFileSync(join(directory, 'menubar.svg'), 'utf8'), 36, 'menubar.png');
console.log('Generated Ljump macOS, light, dark, tinted, preview and menu bar icons');
