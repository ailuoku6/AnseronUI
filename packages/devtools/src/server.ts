import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { DevtoolsHub } from './hub.js';
import { SnapshotAssembler } from './chunks.js';
import type { DevtoolsSnapshot } from './protocol.js';
export const DEVTOOLS_PANEL_PATH = '/__anseronui_devtools';
export const DEVTOOLS_INGEST_PATH = DEVTOOLS_PANEL_PATH + '/ingest';
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*'}); res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8 * 1024 * 1024) throw new Error('PAYLOAD_TOO_LARGE'); chunks.push(Buffer.from(chunk)); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export interface DevtoolsServer { server: Server; hub: DevtoolsHub; port: number; close(): Promise<void>; }
export async function startDevtoolsServer(options: {port?: number; host?: string; hub?: DevtoolsHub} = {}): Promise<DevtoolsServer> {
  const hub = options.hub ?? new DevtoolsHub();
  const assembler = new SnapshotAssembler();
  const clients = new Set<ServerResponse>();
  const emit = (res: ServerResponse, data: unknown) => {
    if (res.writableEnded || res.destroyed) return false;
    try { return res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { return false; }
  };
  const summaries = () => ({type:'sessions', sessions:hub.summaries()});
  const unsubscribe = hub.onSnapshot((snapshot, session) => {
    for (const client of clients) if (!emit(client, snapshot.destroyed ? summaries() : session.state())) clients.delete(client);
  });
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;
      if (req.method === 'OPTIONS') { res.writeHead(204, {'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}); res.end(); return; }
      if (req.method === 'GET' && path === DEVTOOLS_PANEL_PATH + '/events') {
        res.writeHead(200, {'content-type':'text/event-stream','cache-control':'no-cache',connection:'keep-alive','access-control-allow-origin':'*'});
        clients.add(res); emit(res, summaries()); for (const session of hub.sessions.values()) emit(res, session.state());
        req.on('close', () => clients.delete(res)); return;
      }
      if (req.method === 'GET' && path === DEVTOOLS_PANEL_PATH + '/api/sessions') return json(res, 200, {sessions:hub.summaries()});
      if (req.method === 'GET' && path === DEVTOOLS_PANEL_PATH + '/api/session') {
        const s = hub.sessions.get(url.searchParams.get('pagerId') ?? ''); return json(res, s ? 200 : 404, s?.state() ?? {error:'UNKNOWN_SESSION'});
      }
      if (req.method === 'POST' && path === DEVTOOLS_PANEL_PATH + '/api/command') {
        const {pagerId, command} = await body(req);
        const session = hub.sessions.get(pagerId);
        if (!session || session.stale) return json(res, 404, {error:'PAGE_OFFLINE'});
        if (!command || !['full','sample'].includes(command.type) || !session.capabilities.includes(command.type)) return json(res, 400, {error:'UNSUPPORTED_COMMAND'});
        if (command.type === 'sample' && (!Number.isInteger(command.value) || command.value < 100 || command.value > 5000)) return json(res, 400, {error:'INVALID_INTERVAL'});
        session.commands = session.commands.filter(c => c.type !== command.type);
        session.commands.push(command.type === 'full' ? {type:'full'} : {type:'sample', value:command.value});
        return json(res, 200, {ok:true});
      }
      if (req.method === 'POST' && path === DEVTOOLS_INGEST_PATH) {
        const snapshot = assembler.accept(await body(req));
        if (!snapshot) return json(res, 200, {ok:true, commands:[]});
        const session = hub.ingest(snapshot); return json(res, 200, {ok:true, commands:session.commands.splice(0)});
      }
      if (req.method === 'GET' && (path === DEVTOOLS_PANEL_PATH || path === DEVTOOLS_PANEL_PATH + '/' || /^\/__anseronui_devtools\/assets\/[\w.-]+\.(js|css)$/.test(path))) {
        const file = path.includes('/assets/') ? path.slice(DEVTOOLS_PANEL_PATH.length + 1) : 'index.html';
        const data = await readFile(new URL('./panel/' + file, import.meta.url));
        res.writeHead(200, {'content-type':file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8','cache-control':'no-store'}); res.end(data); return;
      }
      json(res,404,{error:'NOT_FOUND'});
    } catch (error) { json(res,400,{error:String(error)}); }
  });
  await new Promise<void>((resolve,reject) => { server.once('error',reject); server.listen(options.port ?? 8091, options.host ?? '127.0.0.1', () => { server.removeListener('error',reject); resolve(); }); });
  const timer = setInterval(() => {
    hub.prune();
    for (const client of clients) {
      // Keep proxies and browser EventSource implementations from treating an
      // otherwise idle inspector as dead. A comment is valid SSE and is ignored
      // by the panel parser.
      if (client.writableEnded || client.destroyed) { clients.delete(client); continue; }
      if (!emit(client, summaries())) clients.delete(client);
    }
  }, 5000); timer.unref();
  return {server,hub,port:(server.address() as AddressInfo).port,close:async () => {clearInterval(timer);unsubscribe();for (const client of clients) client.end(); await new Promise<void>(resolve => server.close(() => resolve()));}};
}
