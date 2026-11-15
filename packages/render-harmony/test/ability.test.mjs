import test from 'node:test';
import assert from 'node:assert/strict';
import { loadETS } from './load-ets.mjs';
test('UIAbility construction without Want does not abort before stage creation', () => {
  const storage = new Map(), links = [], notifications = [];
  const { HarmonyAbility } = loadETS('HarmonyAbility', {
    '@kit.AbilityKit': { UIAbility: class { context = { config: { colorMode: 0 } }; constructor() { this.onCreate(); } } },
    './HarmonyLinking': { HarmonyLinking: { receive: (...args) => links.push(args) } },
    './HarmonyApplicationServices': { HarmonyNotifications: { receiveWant: (...args) => notifications.push(args) } },
  }, { AppStorage: { setOrCreate: (k,v) => storage.set(k,v), get: k => storage.get(k) } });
  const ability = new HarmonyAbility(); assert.equal(links.length, 0);
  ability.onCreate({ uri: 'test://cold' }, {});
  assert.equal(links.length, 1); assert.equal(notifications.length, 1);
  ability.onBackground(); assert.equal(storage.get('anseronuiActive'), false);
  ability.onForeground(); assert.equal(storage.get('anseronuiActive'), true);
  ability.onMemoryLevel(0); assert.equal(storage.get('anseronuiMemoryPressure'), 1);
  let loaded; ability.onWindowStageCreate({ loadContent(page, cb) { loaded = page; cb({ code: 0 }); } }); assert.equal(loaded, 'pages/Index');
});
