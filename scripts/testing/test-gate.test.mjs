import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateTestGate } from '../../.github/scripts/test-gate.mjs';

const jobs = ['unit', 'runtime', 'android-build', 'device-config', 'android', 'harmony'];
const results = () => Object.fromEntries(jobs.map(job => [job, { result: 'success' }]));

test('test gate accepts successful jobs and an explicitly skipped HarmonyOS job', () => {
  assert.equal(evaluateTestGate(results()).ok, true);
  const needs = results(); needs.harmony.result = 'skipped';
  assert.deepEqual(evaluateTestGate(needs), { ok: true, errors: [], skipped: ['harmony'] });
});

test('every failed or cancelled job blocks the gate, including optional HarmonyOS', () => {
  for (const job of jobs) {
    for (const result of ['failure', 'cancelled']) {
      const needs = results(); needs[job].result = result;
      const verdict = evaluateTestGate(needs);
      assert.equal(verdict.ok, false, `${job}: ${result}`);
      assert.ok(verdict.errors.includes(`${job}: ${result}`));
    }
  }
});

test('required jobs cannot silently skip or disappear', () => {
  for (const job of jobs.filter(job => job !== 'harmony')) {
    const needs = results(); needs[job].result = 'skipped';
    assert.equal(evaluateTestGate(needs).ok, false, job);
    delete needs[job];
    assert.equal(evaluateTestGate(needs).ok, false, `missing ${job}`);
  }
  for (const value of [null, undefined, [], 'success']) assert.throws(() => evaluateTestGate(value));
  const needs = results(); needs.unit = {};
  assert.equal(evaluateTestGate(needs).ok, false);
});

test('failures in newly added dependencies are also rejected', () => {
  for (const result of ['failure', 'cancelled', 'skipped', 'unknown']) {
    assert.equal(evaluateTestGate({ ...results(), additional: { result } }).ok, false, result);
  }
});

test('gate command exits unsuccessfully on failure and records skipped jobs in Actions summary', () => {
  const directory = mkdtempSync(join(tmpdir(), 'anseronui-test-gate-'));
  const script = fileURLToPath(new URL('../../.github/scripts/test-gate.mjs', import.meta.url));
  const summary = join(directory, 'summary.md');
  const run = needs => spawnSync(process.execPath, [script], {
    encoding: 'utf8', env: { ...process.env, TEST_JOB_RESULTS: JSON.stringify(needs), GITHUB_STEP_SUMMARY: summary },
  });
  try {
    const needs = results(); needs.harmony.result = 'skipped';
    assert.equal(run(needs).status, 0);
    assert.match(readFileSync(summary, 'utf8'), /Optional jobs skipped: harmony/);
    needs.runtime.result = 'failure';
    const failure = run(needs);
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /::error::Test gate rejected runtime: failure/);
    assert.equal(run(null).status, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
