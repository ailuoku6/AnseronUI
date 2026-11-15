  // Inserted into the staged BusinessRuntime only for Debug builds.
  private devtoolsCalls = new Map<number, Map<number, { id: string; module: string; method: string; args: string; ts: number; durationMs?: number; result?: string; error?: string }>>();
  private devtoolsLogs = new Map<number, Array<{ seq: number; level: string; tag: string; args: string[]; ts: number }>>();
  private devtoolsLogSink(surface: Surface, level: string, args: unknown[]): void {
    let logs = this.devtoolsLogs.get(surface.id);
    if (!logs) { logs = []; this.devtoolsLogs.set(surface.id, logs); }
    logs.push({ seq: (logs.at(-1)?.seq ?? 0) + 1, level, tag: level, args: args.map(value => String(this.devtoolsValue(value))).slice(0, 32), ts: Date.now() });
    if (logs.length > 200) logs.shift();
  }
  private devtoolsTrace(surface: Surface, requestId: number, module: string, method: string, args: string, owner: ServiceSlot): void {
    if (owner === this.devtoolsSessions.get(surface.id)?.owner || module === 'timer' || module === 'events') return;
    let calls = this.devtoolsCalls.get(surface.id);
    if (!calls) { calls = new Map(); this.devtoolsCalls.set(surface.id, calls); }
    calls.set(requestId, { id: String(requestId), module, method, args: args.slice(0, 4096), ts: Date.now() });
    if (calls.size > 200) calls.delete(calls.keys().next().value!);
  }
  private devtoolsResult(surface: Surface, id: number, ok: boolean, value: string): void {
    const call = this.devtoolsCalls.get(surface.id)?.get(id);
    if (!call) return;
    call.durationMs = Date.now() - call.ts;
    if (ok) call.result = value.slice(0, 4096); else call.error = value.slice(0, 4096);
  }
  private devtoolsDiagnostic(id: number, code: string, message: string, stack?: string): void {
    let logs = this.devtoolsLogs.get(id);
    if (!logs) { logs = []; this.devtoolsLogs.set(id, logs); }
    logs.push({ seq: (logs.at(-1)?.seq ?? 0) + 1, level: 'error', tag: code, args: [message.slice(0, 4096), ...(stack ? [stack.slice(0, 32768)] : [])], ts: Date.now() });
    if (logs.length > 200) logs.shift();
    // Leave room for the tree and network records in the bounded snapshot.
    let size = 0;
    for (let i = logs.length - 1; i >= 0; i--) {
      for (const value of logs[i].args) size += value.length;
      if (size > 131072) { logs.splice(0, i + 1); break; }
    }
  }
  private devtoolsSessions = new Map<number, { id: string; owner: ServiceSlot; seq: number; interval: number; ids: Map<string, number>; nextId: number }>();
  private devtoolsValue(value: unknown, depth = 0): unknown {
    if (depth > 4) return '[Depth limit]';
    if (typeof value === 'function') return '[Function]';
    if (typeof value === 'bigint') return String(value);
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice(0, 100).map(item => this.devtoolsValue(item, depth + 1));
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).slice(0, 100)) {
      if (key !== 'children') result[key] = this.devtoolsValue((value as Record<string, unknown>)[key], depth + 1);
    }
    return result;
  }
  private devtoolsStart(surface: Surface): void {
    if (this.devtoolsSessions.has(surface.id)) return;
    const session = { id: '__PLATFORM__-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '-' + surface.id,
      owner: this.newServiceSlot(surface), seq: 0, interval: 1000, ids: new Map<string, number>(), nextId: -3 };
    this.devtoolsSessions.set(surface.id, session);
    __anseronuiDevtoolsSetLogSink(surface.id, (level, args) => this.devtoolsLogSink(surface, level, args));
    void this.devtoolsPoll(surface);
  }
  private devtoolsNodes(surface: Surface): Array<{ id: number; parentId: number; tag: string; component: string; props: Record<string, unknown>; state: Record<string, unknown>; rect: Frame; children: number[]; path: string }> {
    const session = this.devtoolsSessions.get(surface.id)!;
    const nodes: Array<{ id: number; parentId: number; tag: string; component: string; props: Record<string, unknown>; state: Record<string, unknown>; rect: Frame; children: number[]; path: string }> = [];
    nodes.push({ id: -2, parentId: 0, tag: 'Page', component: surface.page.name, props: {}, state: {}, rect: { x: 0, y: 0, width: surface.width, height: surface.height }, children: [], path: '' });
    const visit = (items: HostNode[], x: number, y: number): void => {
      for (const node of items) {
        const rect = { x: x + node.frame.x, y: y + node.frame.y, width: node.frame.width, height: node.frame.height };
        nodes.push({ id: node.id, parentId: -2, tag: node.nativeName ?? node.kind, component: '', props: this.devtoolsValue(node.props) as Record<string, unknown>, state: {}, rect, children: [], path: node.path });
        visit(node.children, rect.x, rect.y);
      }
    };
    visit(surface.tree, 0, 0);
    for (const frame of surface.frames.values()) {
      if (!session.ids.has(frame.path)) session.ids.set(frame.path, session.nextId--);
      const state: Record<string, unknown> = {};
      for (let i = 0; i < frame.slots.length; i++) {
        const slot = frame.slots[i];
        if (slot.kind === 'state' || slot.kind === 'reducer' || slot.kind === 'memo') state[slot.kind + '[' + i + ']'] = this.devtoolsValue(slot.value);
      }
      const descendants = nodes.filter(node => node.id > 0 && node.path.startsWith(frame.path + '/'));
      let x = surface.width, y = surface.height, right = 0, bottom = 0;
      for (const node of descendants) { x = Math.min(x, node.rect.x); y = Math.min(y, node.rect.y); right = Math.max(right, node.rect.x + node.rect.width); bottom = Math.max(bottom, node.rect.y + node.rect.height); }
      if (!descendants.length) { x = 0; y = 0; }
      nodes.push({ id: session.ids.get(frame.path)!, parentId: -2, tag: 'Component', component: frame.devtoolsName ?? surface.page.devtoolsName ?? surface.page.name,
        props: this.devtoolsValue(frame.props) as Record<string, unknown>, state, rect: { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }, children: [], path: frame.path });
    }
    for (const node of nodes) {
      if (node.id === -2) continue;
      let parent = nodes[0];
      for (const candidate of nodes) if (candidate.path.length > parent.path.length && node.path.startsWith(candidate.path + '/')) parent = candidate;
      node.parentId = parent.id; parent.children.push(node.id);
    }
    return nodes;
  }
  private async devtoolsPoll(surface: Surface): Promise<void> {
    const session = this.devtoolsSessions.get(surface.id);
    if (!session) return;
    while (session.owner.active && !this.disposed && this.surfaces.get(surface.id) === surface) {
      try {
        const nodes = this.devtoolsNodes(surface);
        const calls = [...(this.devtoolsCalls.get(surface.id)?.values() ?? [])];
        const network = calls.filter(call => call.module === 'http').map(call => {
          let args: { url?: string; method?: string; body?: string; headers?: Record<string, string> } = {};
          let result: { status?: number; body?: string; headers?: Record<string, string> } = {};
          try { args = call.method === 'getText' ? { url: call.args } : JSON.parse(call.args); } catch {}
          try { result = call.method === 'getText' ? { body: call.result, status: call.error ? 0 : 200 } : JSON.parse(call.result ?? '{}'); } catch {}
          return { id: call.id, url: args.url ?? '', method: args.method ?? 'GET', ts: call.ts, durationMs: call.durationMs,
            status: result.status, requestBody: args.body, requestHeaders: args.headers, responseBody: result.body, responseHeaders: result.headers, error: call.error, transport: 'AnseronUI HTTP' };
        });
        const payload = JSON.stringify({ protocol: 1, type: 'snapshot', pagerId: session.id, platform: '__PLATFORM__', page: surface.page.name,
          ts: Date.now(), seq: ++session.seq, sampleMs: session.interval, capabilities: ['full', 'sample'], nodes, logs: this.devtoolsLogs.get(surface.id) ?? [], network, native: calls.filter(call => call.module !== 'http'),
          device: { platform: '__PLATFORM__', pageWidth: surface.width, pageHeight: surface.height },
          // Node statistics describe the AnseronUI inspection tree itself:
          // Page + components + logical host nodes. Native UIView/NSView
          // descendants are never traversed or counted here.
          stats: { nodes: nodes.length, hostNodes: nodes.filter(node => node.id > 0).length,
            components: nodes.filter(node => node.component.length > 0).length, revision: surface.revision } });
        // Module arguments are bounded at 64 KiB; the service reassembles full snapshots atomically.
        const count = Math.ceil(payload.length / 3000);
        if (count > 512) throw new Error('DEVTOOLS_SNAPSHOT_TOO_LARGE');
        for (let index = 0; index < count && session.owner.active; index++) {
          const body = JSON.stringify({ protocol: 1, type: 'snapshotChunk', pagerId: session.id, seq: session.seq, index, count, data: payload.slice(index * 3000, (index + 1) * 3000) });
          const response = JSON.parse(await this.invokeModule(surface, session.owner, 'http', 'request', JSON.stringify({
            url: '__ENDPOINT__', method: 'POST', headers: { 'content-type': 'application/json' }, body, timeout: 3000,
          }))) as { status: number; body: string };
          if (response.status >= 200 && response.status < 300) {
            const result = JSON.parse(response.body) as { commands?: Array<{ type: string; value?: number }> };
            for (const command of result.commands ?? []) if (command.type === 'sample' && command.value !== undefined && command.value >= 100 && command.value <= 5000) session.interval = command.value;
          }
        }
      } catch { /* A disconnected inspector must never fail the page; retry the complete tree. */ }
      if (!session.owner.active || this.disposed) break;
      try { await this.invokeModule(surface, session.owner, 'timer', 'sleep', String(session.interval)); }
      catch { break; }
    }
  }
  private devtoolsStop(surface: Surface): void {
    const session = this.devtoolsSessions.get(surface.id);
    if (!session) return;
    session.owner.active = false;
    for (const [id, request] of surface.modules) if (request.owner === session.owner) {
      this.emit(surface, { type: 'CancelRequest', requestId: id }); surface.modules.delete(id); request.reject(new Error('SURFACE_DISPOSED'));
    }
    this.devtoolsSessions.delete(surface.id);
    this.devtoolsCalls.delete(surface.id); this.devtoolsLogs.delete(surface.id);
    __anseronuiDevtoolsClearLogSink(surface.id);
  }

