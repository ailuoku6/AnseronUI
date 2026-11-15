import test from 'node:test';
import assert from 'node:assert/strict';
import { loadETS } from './load-ets.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const closed = [], removed = [], requests = [], progress = []; let opened;
  const httpRequest = { destroy() {}, on() {}, requestInStream: async () => { requests.push('download'); return 200; } };
  const fs = { OpenMode: { CREATE: 1, READ_WRITE: 2, TRUNC: 4 }, open: () => new Promise(resolve => { opened = resolve; }), close: async file => closed.push(file.fd), unlink: async file => removed.push(file) };
  const mocks = { '@kit.ArkTS': { util: { generateRandomUUID: () => 'id' } }, '@kit.AssetStoreKit': {}, '@kit.CoreFileKit': { fileIo: fs }, '@kit.MediaLibraryKit': {}, '@kit.ArkData': {}, '@kit.LocationKit': {}, '@kit.SensorServiceKit': {}, '@kit.ShareKit': {}, '@kit.NetworkKit': { http: { createHttp: () => httpRequest, RequestMethod: { GET: 'GET' } } } };
  const { HarmonyServices } = loadETS('HarmonyServices', mocks);
  const service = new HarmonyServices({ cacheDir: '/tmp/test' }, (module, value) => progress.push(value));
  return { service, fs, closed, removed, requests, progress, opened: file => opened(file) };
}
test('download cancellation during asynchronous open closes late file and never starts HTTP', async () => {
  const f = fixture(); let cancel;
  const result = f.service.invoke('transfers', 'download', { taskId: 'slow', url: 'https://example.test/file' }, action => { cancel = action; });
  cancel(); await assert.rejects(result, /CANCELLED/);
  f.opened({ fd: 7 }); await tick();
  assert.deepEqual(f.closed, [7]); assert.deepEqual(f.removed, ['/tmp/test/anseronui-id']); assert.deepEqual(f.requests, []); assert.equal(f.service.tasks.size, 0);
});
test('host disposal cancels in-flight downloads and releases late file descriptors', async () => {
  const f = fixture(); const result = f.service.invoke('transfers', 'download', { taskId: 'dispose', url: 'https://example.test/file' }, () => {});
  f.service.dispose(); await assert.rejects(result, /CANCELLED/); f.opened({ fd: 8 }); await tick();
  assert.deepEqual(f.closed, [8]); assert.deepEqual(f.progress, []); assert.deepEqual(f.requests, []);
});
test('failed picker copy closes the source and removes partial temporary output', async () => {
  const f = fixture(); f.fs.copyFile = async () => { throw new Error('disk full'); };
  const result = f.service.remember('file://picked');f.opened({fd:9});
  await assert.rejects(result,/disk full/);assert.deepEqual(f.closed,[9]);assert.deepEqual(f.removed,['/tmp/test/anseronui-id']);assert.equal(f.service.files.size,0);
});
test('release rejects in-flight uploads and retains the file when unlink fails', async () => {
  const f=fixture(),reference={id:'file',name:'x',size:3,mimeType:'application/octet-stream'};
  f.service.files.set('file',{path:'/tmp/test/x',reference});f.service.uploads.set('file',1);
  await assert.rejects(f.service.invoke('files','release',{file:reference},()=>{}),/being uploaded/);assert.equal(f.removed.length,0);
  f.service.uploads.clear();f.fs.unlink=async()=>{throw new Error('busy');};
  await assert.rejects(f.service.invoke('files','release',{file:reference},()=>{}),/busy/);assert.equal(f.service.files.size,1);
});
