import test from 'node:test';
import assert from 'node:assert/strict';
import { lowerTimers } from './lower-timers.mjs';

test('timer lowering handles globals, aliases and globalThis', () => {
  const output = lowerTimers('const start = setTimeout; const id = start(() => {}, 1); clearTimeout(id); globalThis.setTimeout(() => {}, 0);', 'page.ts');
  assert.match(output, /setTimeout as __anseronuiSetTimeout/);
  assert.match(output, /clearTimeout as __anseronuiClearTimeout/);
  assert.match(output, /const start = __anseronuiSetTimeout/);
  assert.doesNotMatch(output, /globalThis\.setTimeout/);
});
test('timer lowering respects parameters, block scope and imported bindings', () => {
  const output = lowerTimers('import { setTimeout } from "custom"; setTimeout(); function f(clearTimeout) { clearTimeout(); } { const setTimeout = () => {}; setTimeout(); } const x = { setTimeout() {} }; x.setTimeout();', 'page.ts');
  assert.doesNotMatch(output, /__anseronui/);
});
test('timer lowering preserves property names and avoids generated name collisions', () => {
  const output = lowerTimers('const __anseronuiSetTimeout = 3; const x = { setTimeout: 1 }; const y = { setTimeout }; setTimeout(() => {}, 1);', 'page.ts');
  assert.match(output, /setTimeout as __anseronuiSetTimeout_/);
  assert.match(output, /setTimeout: 1/);
  assert.match(output, /setTimeout: __anseronuiSetTimeout_/);
});
