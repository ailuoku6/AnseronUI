import test from 'node:test';
import assert from 'node:assert/strict';
import { command, withHTTPFixture } from './process.mjs';

test('test commands reject a failing subprocess', async () => {
  await assert.rejects(command(process.execPath, ['-e', 'process.exit(7)']), /exit 7/);
});

test('test commands stop a hung subprocess instead of passing or waiting forever', async () => {
  const start = Date.now();
  await assert.rejects(command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 100 }), /timed out/);
  assert.ok(Date.now() - start < 10_000);
});

test('HTTP fixture serves the sample contract and releases its port after failure', async () => {
  await assert.rejects(withHTTPFixture(async () => {
    const response = await fetch('http://127.0.0.1:5174/hello.txt');
    assert.equal(response.status, 200);
    assert.equal((await response.text()).trim(), 'loaded from HTTP');
    assert.equal((await fetch('http://127.0.0.1:5174/missing')).status, 404);
    throw new Error('test failed');
  }), /test failed/);
  await withHTTPFixture(async () => {
    assert.equal((await fetch('http://127.0.0.1:5174/hello.txt')).status, 200);
  });
});

test('HTTP fixture rejects a second owner instead of using a stale server', async () => {
  await withHTTPFixture(() => assert.rejects(withHTTPFixture(async () => assert.fail('must not run')), /EADDRINUSE/));
});
