import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { command } from './testing/process.mjs';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const device = process.env.HARMONY_DEVICE;
const deviceArgs = device ? ['--device', device] : [];
const blocked = [];
for (const [config, test] of [['anseronui.config.json', 'scripts/test-harmony-demo.mjs'], ['examples/harmony-smoke/anseronui.config.json', 'scripts/test-harmony.mjs']]) {
  const main = config === 'anseronui.config.json';
  await command(process.execPath, ['scripts/anseronui.mjs', 'build', 'harmony', '--config', config], { env: { ...process.env, ANSERONUI_SCROLL_TRACE: main ? '1' : '0' } });
  await command(process.execPath, ['scripts/anseronui.mjs', 'run', 'harmony', '--no-build', '--config', config, ...deviceArgs]);
  if (main) await command(process.execPath, ['scripts/test-harmony-virtual-list.mjs', ...(device ? [device] : [])]);
  await command(process.execPath, [test, ...(device ? [device] : [])]);
  // The acceptance runner records OS entitlement/quota blocks separately. A
  // full CI gate cannot silently count those as a complete device pass.
  const report = JSON.parse(await readFile(`.verification/harmony/acceptance/${test.includes('-demo') ? 'main-results' : 'results'}.json`, 'utf8'));
  blocked.push(...(report.blocked ?? []));
}
if (blocked.length) throw new Error(`HarmonyOS acceptance blocked: ${blocked.join('; ')}`);
