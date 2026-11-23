import type { DevtoolsSnapshot } from '../../src/protocol';
import type { DeviceCommand, EditTarget, FullSessionState, PropSchemaResult, NodeDto, ScreenshotDto } from './protocol';
import { adaptSnapshot } from './adapter';
export type ConnectionState = 'connecting' | 'open' | 'closed';
export interface SessionView {
  summary: FullSessionState;
  device: FullSessionState['device'];
  nodes: Map<number, NodeDto>;
  logs: FullSessionState['logs'];
  network: FullSessionState['network'];
  native: NonNullable<FullSessionState['native']>;
  screenshot: ScreenshotDto | null;
}
export class DevtoolsStore {
  readonly sessions = new Map<string, SessionView>();
  activePagerId: string | null = null;
  connection: ConnectionState = 'connecting';
  lastError: string | null = null;
  serverCapabilities: string[] = ['propSchemaV1'];
  private version = 0;
  private source?: EventSource;
  private reconnectTimer?: number;
  private reconnectDelay = 250;
  private disposed = false;
  private listeners = new Set<() => void>();
  private hidden = new Map<string, { logs: Set<number>; network: Set<string>; native: Set<string> }>();
  private archive = new Map<string, FullSessionState>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getVersion = () => this.version;
  get active() { return this.sessions.get(this.activePagerId ?? '') ?? null; }
  private notify() { this.version++; this.listeners.forEach(fn => fn()); }
  accept(snapshot: DevtoolsSnapshot) {
    const previous = this.archive.get(snapshot.pagerId);
    if (previous && previous.lastSeenAt > snapshot.ts) return;
    const state = adaptSnapshot(snapshot);
    state.firstSeenAt = previous?.firstSeenAt ?? state.firstSeenAt;
    this.archive.set(snapshot.pagerId, state);
    this.present(state);
    if (!this.activePagerId) this.activePagerId = snapshot.pagerId;
    this.notify();
  }
  private present(state: FullSessionState) {
    const hidden = this.hidden.get(state.pagerId);
    this.sessions.set(state.pagerId, { summary: state, device: state.device, nodes: new Map(state.nodes.map(n => [n.id, n])),
      logs: state.logs.filter(l => !hidden?.logs.has(l.seq)), network: state.network.filter(n => !hidden?.network.has(n.id)),
      native: (state.native ?? []).filter(n => !hidden?.native.has(n.id)), screenshot: state.screenshot ?? null });
  }
  connect() {
    this.disposed = false;
    if (this.source || this.reconnectTimer !== undefined) return;
    const source = this.source = new EventSource('/__anseronui_devtools/events');
    source.onopen = () => { this.reconnectDelay = 250; this.connection = 'open'; this.notify(); };
    source.onerror = () => {
      // EventSource implementations differ: some retry in place, while others
      // stay errored after a proxy/server restart. Explicitly recreate it so both
      // cases recover and the old socket cannot deliver duplicate snapshots.
      if (this.source !== source) return;
      source.close();
      this.source = undefined;
      this.connection = 'closed';
      this.notify();
      if (!this.disposed) {
        const delay = this.reconnectDelay;
        this.reconnectDelay = Math.min(5000, this.reconnectDelay * 2);
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = undefined;
          this.connect();
        }, delay);
      }
    };
    source.onmessage = e => {
      if (this.source !== source) return;
      const message = JSON.parse(e.data);
      if (message.type === 'snapshot') this.accept(message);
      if (message.type === 'sessions') {
        const ids = new Set(message.sessions.map((s: {pagerId: string}) => s.pagerId));
        for (const id of this.sessions.keys()) if (!ids.has(id)) { this.sessions.delete(id); this.archive.delete(id); this.hidden.delete(id); }
        if (!this.sessions.has(this.activePagerId ?? '')) this.activePagerId = this.sessions.keys().next().value ?? null;
        this.notify();
      }
    };
  }
  dispose() {
    this.disposed = true;
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.source?.close();
    this.source = undefined;
  }
  selectSession(pagerId: string) { this.activePagerId = pagerId; this.notify(); }
  clearActiveBuffers(kind: 'logs' | 'network' | 'native' = 'logs') {
    const id = this.activePagerId; if (!id) return;
    const state = this.archive.get(id); if (!state) return;
    const hidden = this.hidden.get(id) ?? { logs: new Set<number>(), network: new Set<string>(), native: new Set<string>() };
    if (kind === 'logs') state.logs.forEach(l => hidden.logs.add(l.seq));
    if (kind === 'network') state.network.forEach(l => hidden.network.add(l.id));
    if (kind === 'native') state.native?.forEach(l => hidden.native.add(l.id));
    this.hidden.set(id, hidden); this.present(state); this.notify();
  }
  private async command(command: unknown, pagerId = this.activePagerId): Promise<any> {
    if (!pagerId) throw new Error('未选择页面');
    const response = await fetch('/__anseronui_devtools/api/command', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pagerId,command}),signal:AbortSignal.timeout(12000)});
    const result = await response.json();
    if (!response.ok || result.ok === false) throw new Error(result.error ?? `HTTP ${response.status}`);
    return result;
  }
  sendCommand(command: DeviceCommand) {
    // Hook state is included in every committed snapshot.
    if (command.type === 'state') return;
    void this.command(command).then(() => {this.lastError=null;this.notify();}).catch(error => {this.lastError=String(error);this.notify();});
  }
  queryProps(id: number, pagerId?: string): Promise<PropSchemaResult> { return this.command({type:'inspectProps',id},pagerId); }
  async editNode(id: number, target: EditTarget, key: string, value: unknown, token?: string, pagerId?: string): Promise<void> {
    await this.command({type:'set',id,target,key,value,schemaToken:token},pagerId);
  }
}
