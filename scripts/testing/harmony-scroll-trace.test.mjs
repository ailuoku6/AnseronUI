import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyHarmonyScrollTrace } from './harmony-scroll-trace.mjs';

function trace({ jump = false, gap = false, stopped = false } = {}) {
  const log = [], emit = line => log.push('AnseronScroll: ' + line);
  for (let swipe = 0; swipe < 4; swipe++) {
    emit('start node=10');
    const direction = swipe % 2 ? -1 : 1;
    for (let frame = 0; frame < 40; frame++) {
      if (frame === 20) { emit('anchor node=10 delta=300 active=1'); emit('consume node=10 delta=300'); }
      emit(`frame node=10 y=${1000 + direction * frame * 3} travel=${1000 + direction * frame * 3} error=${jump && frame === 21 ? 100 : .25} matched=20 rows=7 gap=${gap && frame === 22 ? 60 : 0}`);
      if (stopped && swipe === 0 && frame === 20) break;
    }
    emit('stop node=10');
  }
  return log.join('\n');
}

test('Harmony scroll gate accepts retained rows and inertia continuing through corrections', () => {
  const result = verifyHarmonyScrollTrace(trace());
  assert.equal(result.frames, 160);
  assert.equal(result.maxAnchorErrorVp, .25);
  assert.equal(result.continuedFlings, 4);
});
test('Harmony scroll gate rejects row jumps, empty runway and an interrupted fling', () => {
  assert.throws(() => verifyHarmonyScrollTrace(trace({ jump: true })), /anchor jumped/);
  assert.throws(() => verifyHarmonyScrollTrace(trace({ gap: true })), /Uncovered viewport/);
  assert.throws(() => verifyHarmonyScrollTrace(trace({ stopped: true })), /stopped an active native fling/);
  assert.throws(() => verifyHarmonyScrollTrace(''), /Missing native frame samples/);
});
