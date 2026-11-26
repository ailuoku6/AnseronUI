import { build } from 'esbuild';
import { writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, sep } from 'node:path';
import { webkit } from 'playwright';
import { browserSuites, wasmBrowserSuites } from './testing/suites.mjs';

const suite = process.argv[2] ?? 'extensions';
if (![...browserSuites, ...wasmBrowserSuites].includes(suite)) throw new Error(`Unknown browser suite: ${suite}`);
const directory = `.verification/browser/${suite}`;
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
const entry = suite.startsWith('text-measurement') ? 'verifyTextMeasurement' : suite.startsWith('virtual-list') ? 'verifyVirtualList' : suite === 'accessibility-wasm' ? 'verifyAccessibilityWasm' : suite === 'accessibility-demo' ? 'verifyAccessibilityDemo' : suite === 'accessibility' ? 'verifyAccessibility' : suite === 'styles' ? 'verifyStyles' : suite === 'layout' ? 'verifyLayout' : suite === 'timers' ? 'verifyTimers' : suite === 'split' ? 'verifySplitTimers' : suite === 'routing' ? 'verifyRouting' : 'verifyExtensions';
const encoded = wasmBrowserSuites.includes(suite)
  ? await Promise.all(['business', 'framework'].map(async kind => (await readFile(`.verification/${kind}-wasm/entry.wasm`)).toString('base64'))) : [];
const args = encoded.map(text => `Uint8Array.from(atob(${JSON.stringify(text)}), c => c.charCodeAt(0))`).join(',');
const result = await build({ stdin: { contents: `import {${entry}} from './packages/render-web/test/${suite.startsWith('text-measurement') ? 'text-measurement' : suite === 'virtual-list-wasm' ? 'virtual-list' : suite}.browser.ts';
const timeout = setTimeout(() => globalThis.__anseronuiReport({ok:false,error:'Test timeout',state:globalThis.__anseronuiTestState?.()}),90000);
${entry}(${args}).finally(() => clearTimeout(timeout)).then(report => globalThis.__anseronuiReport({ok:true,suite:'${suite}',...(report?{report}:{})}),error => globalThis.__anseronuiReport({ok:false,error:String(error),stack:error.stack,state:globalThis.__anseronuiTestState?.()}));`, resolveDir: process.cwd() }, bundle: true, write: false, jsx: 'automatic', jsxImportSource: '@anseronui/ui', platform: 'browser', format: 'iife', target: 'es2022' });
const html = '<!doctype html><html><body><script src="/test.js"></script></body></html>';
await writeFile(`${directory}/test.js`, result.outputFiles[0].text);
await writeFile(`${directory}/index.html`, html);
const assetRoot = resolve('examples/components/assets');
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html); return; }
    if (path === '/test.js') { response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }).end(result.outputFiles[0].text); return; }
    const file = resolve(assetRoot, decodeURIComponent(path.slice('/assets/'.length)));
    if (!path.startsWith('/assets/') || !file.startsWith(assetRoot + sep)) { response.writeHead(404).end(); return; }
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': file.endsWith('.png') ? 'image/png' : file.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
let browser, context, page, timer;
const messages = [];
try {
  browser = await webkit.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 500, height: 900 }, colorScheme: 'light', locale: 'en-US' });
  // Debug AOT sends inspector snapshots. Supply an idle inspector so these
  // renderer tests do not depend on a developer's server at port 8091.
  await context.route('http://127.0.0.1:8091/__anseronui_devtools/ingest', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"commands":[]}',
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' },
  }));
  await context.tracing.start({ screenshots: true, snapshots: true });
  page = await context.newPage();
  const completion = Promise.withResolvers();
  await page.exposeFunction('__anseronuiReport', completion.resolve);
  page.on('pageerror', error => completion.reject(error));
  page.on('crash', () => completion.reject(new Error('WebKit content process crashed')));
  page.on('console', message => messages.push(`${message.type()}: ${message.text()}`));
  timer = setTimeout(() => completion.reject(new Error('WebKit timeout after 120s')), 120_000);
  // Start observing completion before navigation so early script failures are handled.
  const completed = completion.promise;
  completed.catch(() => {});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const report = await completed;
  await writeFile(`${directory}/result.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (!report.ok) throw new Error(report.error ?? 'Browser test failed');
  if (suite.startsWith('virtual-list')) {
    if (!report.report) throw new Error('Missing browser performance report');
    await mkdir('.verification/performance', { recursive: true });
    await writeFile(`.verification/performance/${report.report.mode}.json`, JSON.stringify(report.report, null, 2) + '\n');
  }
  await context.tracing.stop();
} catch (error) {
  await writeFile(`${directory}/failure.json`, JSON.stringify({ error: String(error), stack: error.stack, console: messages }, null, 2) + '\n');
  await page?.screenshot({ path: `${directory}/failure.png` }).catch(() => {});
  await context?.tracing.stop({ path: `${directory}/trace.zip` }).catch(() => {});
  throw error;
} finally {
  clearTimeout(timer);
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
