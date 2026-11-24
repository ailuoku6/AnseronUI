import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// Terminate the whole command tree on timeout or cancellation, including Core
// probes and Gradle/Xcode children. A hung child must not hold a runner forever.
export function command(bin, args, { timeout = 30 * 60_000, log, ...options } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', ...options });
    let stopped;
    const kill = signal => {
      if (!child.pid) return;
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    let force;
    const stop = reason => { stopped = reason; kill('SIGTERM'); force ??= setTimeout(() => kill('SIGKILL'), 5000).unref(); };
    const interrupt = () => stop('cancelled');
    process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
    const timer = setTimeout(() => stop(`timed out after ${timeout}ms`), timeout);
    child.stdout.on('data', data => { process.stdout.write(data); log?.write(data); });
    child.stderr.on('data', data => { process.stderr.write(data); log?.write(data); });
    const cleanup = () => { clearTimeout(timer); clearTimeout(force); process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', (code, signal) => {
      cleanup();
      if (code === 0 && !stopped) resolve();
      else reject(new Error(`${bin} ${args.join(' ')}: ${stopped ?? signal ?? `exit ${code}`}`));
    });
  });
}

// Native sample pages use this exact endpoint. Binding a fixed port fails if a
// stale fixture owns it; tests must not silently use another checkout's server.
export async function withHTTPFixture(run) {
  const body = await readFile(new URL('../../examples/async-form/public/hello.txt', import.meta.url));
  const server = createServer((request, response) => {
    if (request.url !== '/hello.txt') { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(body);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(5174, '127.0.0.1', resolve); });
  try { await run(); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
