import test from 'node:test';
import assert from 'node:assert/strict';
import { androidJava17 } from './android-java.mjs';

const java = version => ({ status: 0, stdout: '', stderr: `Property settings:\n    java.specification.version = ${version}\n` });
test('Android honors a working explicit JDK 17 without probing the system default', () => {
  const calls = [];
  assert.equal(androidJava17({ env: { JAVA_HOME: '/tools/jdk17' }, platform: 'darwin', run: (...args) => { calls.push(args); return java(17); } }), '/tools/jdk17');
  assert.equal(calls[0][0], '/tools/jdk17/bin/java');
  assert.equal(calls.length, 1);
});
test('Android probes macOS with strict matching and validates the result', () => {
  const calls = [];
  const directory = androidJava17({ env: {}, platform: 'darwin', run: (bin, args) => {
    calls.push([bin, args]);
    return bin === '/usr/libexec/java_home' ? { status: 0, stdout: '/tools/jdk17\n' } : java(17);
  } });
  assert.equal(directory, '/tools/jdk17');
  assert.deepEqual(calls[0], ['/usr/libexec/java_home', ['-F', '-v', '17']]);
});
test('Android rejects missing, wrong or broken Java installations before Gradle starts', () => {
  for (const result of [java(11), java(25), { status: 1 }, { error: new Error('missing java') }]) {
    assert.throws(() => androidJava17({ env: { JAVA_HOME: '/wrong' }, run: () => result }), /require JDK 17/);
  }
  assert.throws(() => androidJava17({ env: {}, platform: 'linux' }), /require JDK 17/);
  assert.throws(() => androidJava17({ env: {}, platform: 'darwin', run: () => ({ status: 1 }) }), /require JDK 17/);
});
