import type { DevtoolsNetwork, DevtoolsSessionSummary, DevtoolsSnapshot, DevtoolsNode, DevtoolsLog, DevtoolsNativeCall } from "./protocol.js";

const STALE_AFTER_MS = 10_000;
const MAX_LOGS = 20_000;
const MAX_NETWORK = 2_000;

export class DevtoolsSession {
  readonly pagerId: string;
  page = "";
  lastSeenAt = 0;
  nodes = new Map<number, DevtoolsNode>();
  logs: DevtoolsLog[] = [];
  network: DevtoolsNetwork[] = [];
  native: DevtoolsNativeCall[] = [];
  stats: Record<string, number> = {};
  droppedLogs = 0;
  platform = "";
  sampleMs = 1000;
  capabilities: string[] = [];
  device: DevtoolsSnapshot["device"];
  private lastSeq = 0;
  commands: Array<{type: "full"} | {type: "sample"; value: number}> = [];
  diagnostics: { code: string; message: string }[] = [];

  constructor(pagerId: string) { this.pagerId = pagerId; }
  get stale(): boolean { return Date.now() - this.lastSeenAt > STALE_AFTER_MS; }
  summary(): DevtoolsSessionSummary {
    return { pagerId: this.pagerId, page: this.page, nodeCount: this.nodes.size, logCount: this.logs.length,
      networkCount: this.network.length, nativeCount: this.native.length, lastSeenAt: this.lastSeenAt, stale: this.stale };
  }
  state(): DevtoolsSnapshot & { nodes: DevtoolsNode[]; logs: DevtoolsLog[]; network: DevtoolsNetwork[] } {
    return { protocol: 1, type: "snapshot", pagerId: this.pagerId, page: this.page, ts: this.lastSeenAt,
      sampleMs: this.sampleMs, capabilities: this.capabilities, device: this.device,
      platform: this.platform as DevtoolsSnapshot["platform"], nodes: [...this.nodes.values()], logs: this.logs, network: this.network, native: this.native, stats: this.stats, droppedLogs: this.droppedLogs, diagnostics: this.diagnostics };
  }
  apply(snapshot: DevtoolsSnapshot): void {
    if (snapshot.seq !== undefined && snapshot.seq <= this.lastSeq) return;
    if (snapshot.seq !== undefined) this.lastSeq = snapshot.seq;
    this.lastSeenAt = Date.now();
    if (snapshot.sampleMs) this.sampleMs = snapshot.sampleMs;
    if (snapshot.capabilities) this.capabilities = snapshot.capabilities;
    if (snapshot.device) this.device = snapshot.device;
    if (snapshot.page) this.page = snapshot.page;
    if (snapshot.platform) this.platform = snapshot.platform;
    if (snapshot.nodes) this.nodes = new Map(snapshot.nodes.map(node => [node.id, node]));
    if (snapshot.stats) this.stats = { ...snapshot.stats };
    if (snapshot.logs?.length) this.logs = [...new Map([...this.logs, ...snapshot.logs].map(l => [l.seq, l])).values()].slice(-MAX_LOGS);
    if (snapshot.network?.length) {
      const byId = new Map(this.network.map(item => [item.id, item]));
      for (const item of snapshot.network) byId.set(item.id, item);
      this.network = [...byId.values()].slice(-MAX_NETWORK);
    }
    if (snapshot.native?.length) this.native = [...new Map([...this.native, ...snapshot.native].map(n => [n.id, n])).values()].slice(-2000);
    this.droppedLogs += snapshot.droppedLogs ?? 0;
    if (snapshot.diagnostics?.length) this.diagnostics = [...this.diagnostics, ...snapshot.diagnostics].slice(-200);
  }
}

export class DevtoolsHub {
  readonly sessions = new Map<string, DevtoolsSession>();
  private destroyed = new Map<string, number>();
  private listeners = new Set<(snapshot: DevtoolsSnapshot, session: DevtoolsSession) => void>();
  onSnapshot(listener: (snapshot: DevtoolsSnapshot, session: DevtoolsSession) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  session(pagerId: string): DevtoolsSession {
    let value = this.sessions.get(pagerId);
    if (!value) { value = new DevtoolsSession(pagerId); this.sessions.set(pagerId, value); }
    return value;
  }
  ingest(snapshot: DevtoolsSnapshot): DevtoolsSession {
    if (snapshot.protocol !== 1 || !snapshot.pagerId) throw new Error("INVALID_DEVTOOLS_PAYLOAD");
    // A keepalive destroy can arrive before an older in-flight snapshot.
    // Retain tombstones beyond the client's request timeout to prevent resurrection.
    if (this.destroyed.has(snapshot.pagerId)) return new DevtoolsSession(snapshot.pagerId);
    const session = this.session(snapshot.pagerId); session.apply(snapshot);
    if (snapshot.destroyed) { this.sessions.delete(snapshot.pagerId); this.destroyed.set(snapshot.pagerId, Date.now()); }
    for (const listener of this.listeners) listener(snapshot, session);
    return session;
  }
  summaries(): DevtoolsSessionSummary[] { return [...this.sessions.values()].map(session => session.summary()); }
  prune(): void {
    for (const [id, session] of this.sessions) if (session.stale) this.sessions.delete(id);
    for (const [id, ts] of this.destroyed) if (Date.now() - ts > 60_000) this.destroyed.delete(id);
  }
}
