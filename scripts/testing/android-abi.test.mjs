import test from 'node:test';
import assert from 'node:assert/strict';
import { androidABI, androidTargetIdentity } from '../android-abi.mjs';

test('Android selects matching native toolchains and distinct cache identities for both ABIs', () => {
  assert.equal(androidABI({}).abi, 'arm64-v8a');
  const arm = androidABI({ ANSERONUI_ANDROID_ABI: 'arm64-v8a' });
  const x86 = androidABI({ ANSERONUI_ANDROID_ABI: 'x86_64' });
  assert.equal(arm.target, 'aarch64-linux-android');
  assert.equal(arm.clang, 'aarch64-linux-android26-clang');
  assert.equal(x86.target, 'x86_64-linux-android');
  assert.equal(x86.clang, 'x86_64-linux-android26-clang');
  assert.notDeepEqual(androidTargetIdentity({}), androidTargetIdentity({ ANSERONUI_ANDROID_ABI: 'x86_64' }));
  assert.equal(androidTargetIdentity({ ANSERONUI_ANDROID_ABI: 'x86_64' }).abi, 'x86_64');
});

test('Android device selection handles native preference, explicit overrides and incompatible devices', () => {
  assert.equal(androidABI({}, 'x86_64,x86').abi, 'x86_64');
  assert.equal(androidABI({}, 'arm64-v8a,armeabi-v7a').abi, 'arm64-v8a');
  assert.equal(androidABI({}, 'x86_64,arm64-v8a').abi, 'x86_64');
  assert.equal(androidABI({ ANSERONUI_ANDROID_ABI: 'arm64-v8a' }, 'x86_64,arm64-v8a').abi, 'arm64-v8a');
  assert.throws(() => androidABI({}, 'armeabi-v7a'), /supports arm64-v8a and x86_64/);
  assert.throws(() => androidABI({ ANSERONUI_ANDROID_ABI: 'x86' }), /supports arm64-v8a and x86_64/);
  assert.throws(() => androidABI({ ANSERONUI_ANDROID_ABI: 'arm64-v8a' }, 'x86_64'), /incompatible/);
});
