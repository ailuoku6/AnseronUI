import { LayoutEngine, MEASURE_MODE_UNDEFINED } from "@anseronui/layout";
import type { Node } from "@anseronui/layout";
import { isU32, validProps, validStyle, knownStyle, validKind, validEvent, validInputPair, patchProps, propPatch } from "@anseronui/protocol";
import type { Frame, RenderCommand } from "@anseronui/protocol";
import { CORE_ABI_VERSION } from "./contracts.js";
import type { BeginRenderRequest, ContinueRenderRequest, FinishRenderRequest, ResetSurfaceRequest, Prepared, CoreResult, RenderNode, MeasureQuery } from "./contracts.js";
import { isMeasured, textContent, measureKey, layoutKey, updateStyle } from "./layout-style.js";

type RecordNode = { host: RenderNode; layout: Node; children: number[]; parent: number; frame: Frame };
type Measurement = { width: number; height: number; baseline: number };
type Transaction = {
  request: BeginRenderRequest; before: Map<number, RecordNode | null>; parents: Map<number, number[]>;
  oldRoots: number[]; oldWidth: number; oldHeight: number; oldEnvironment: number;
  candidates: Set<number>; layoutDirty: boolean; round: number; queries: Map<number, MeasureQuery>;
  replies: Map<number, { input: string; result: Prepared }>; ready?: Prepared;
};
const zero: Frame = { x: 0, y: 0, width: 0, height: 0 };
function equalFrame(a: Frame, b: Frame): boolean { return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height; }
function dimension(v: number): boolean { return Number.isFinite(v) && v >= 0; }
function equalIds(a: number[], b: number[]): boolean { return a.length === b.length && a.every((id, i) => id === b[i]); }

/** A single mutable layout tree, with record and topology undo journals. The
 * committed frame baseline is never overwritten by provisional measurement. */
class TransactionSurface {
  readonly engine = new LayoutEngine("css");
  readonly root = this.engine.createNode();
  readonly nodes = new Map<number, RecordNode>();
  roots: number[] = [];
  revision = 0;
  through = 0;
  width = 0;
  height = 0;
  environment = 0;
  nextRequestId = 1;
  pending: Transaction | null = null;
  private collecting = false;
  private cache = new Map<string, Measurement>();
  private cacheKeys = new Map<number, Set<string>>();
  private terminal = new Map<number, { input: string; result: CoreResult }>();
  private resetToken = 0;
  private lastTarget = 0;
  private completed = new Map<number, Transaction>();
  private repair = false;
  constructor(readonly generation: number) { this.root.setFlexDirection(0); }

  private save(id: number): void {
    const tx = this.pending!;
    if (!tx.before.has(id)) tx.before.set(id, this.nodes.get(id) ?? null);
  }
  private edit(id: number): RecordNode {
    const record = this.nodes.get(id);
    if (!record) throw new Error("UNKNOWN_CORE_NODE:" + id);
    this.save(id);
    if (this.pending!.before.get(id) === record) {
      const next: RecordNode = { ...record, host: { ...record.host }, children: record.children };
      this.nodes.set(id, next); return next;
    }
    return record;
  }
  private children(id: number): number[] { return id === 0 ? this.roots : this.nodes.get(id)!.children; }
  private layout(id: number): Node { return id === 0 ? this.root : this.nodes.get(id)!.layout; }

  begin(request: BeginRenderRequest): Prepared {
    if (this.pending) {
      if (this.pending.request.transactionId === request.transactionId && JSON.stringify(this.pending.request) === JSON.stringify(request)) return this.pending.replies.get(0)!.result;
      throw new Error("CORE_TRANSACTION_PENDING");
    }
    const completed = this.completed.get(request.transactionId);
    if (completed) { if (JSON.stringify(completed.request) !== JSON.stringify(request)) throw new Error("CONFLICTING_CORE_BEGIN"); return completed.replies.get(0)!.result; }
    if (!isU32(request.transactionId) || request.transactionId <= this.through) throw new Error("STALE_CORE_TRANSACTION");
    if (request.baseRevision !== this.revision || !isU32(request.targetRevision) || request.targetRevision <= this.lastTarget) throw new Error("CORE_BASE_REVISION");
    if (!dimension(request.width) || !dimension(request.height)) throw new Error("INVALID_SURFACE_SIZE");
    if (!isU32(request.environmentVersion, true) || request.environmentVersion < this.environment || !isU32(request.nextRequestId) || !Array.isArray(request.mutations) || request.mutations.length > 262144) throw new Error("INVALID_CORE_BEGIN");
    for (const mutation of request.mutations) {
      if (mutation.type === "Create") {
        if (!validKind(mutation.kind) || !validProps(mutation.props) || !validInputPair(mutation.props, []) || !validStyle(mutation.style) || !Array.isArray(mutation.events) || !mutation.events.every(validEvent) || new Set(mutation.events).size !== mutation.events.length || mutation.kind === "Native" && (typeof mutation.nativeName !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(mutation.nativeName))) throw new Error("INVALID_CORE_CREATE");
      } else if (mutation.type === "Patch") {
        if (!validProps(mutation.propsSet) || !validStyle(mutation.styleSet) || !Array.isArray(mutation.styleUnset) || mutation.styleUnset.some(key => !knownStyle(key)) || new Set(mutation.styleUnset).size !== mutation.styleUnset.length || !Array.isArray(mutation.propsUnset) || mutation.events !== undefined && (!Array.isArray(mutation.events) || !mutation.events.every(validEvent) || new Set(mutation.events).size !== mutation.events.length)) throw new Error("INVALID_CORE_PATCH");
      } else if (mutation.type === "Children") {
        if (!isU32(mutation.parentId, true) || !Array.isArray(mutation.children) || !mutation.children.every(id => isU32(id))) throw new Error("INVALID_CORE_CHILDREN");
      } else if (mutation.type !== "Delete") throw new Error("INVALID_CORE_MUTATION");
    }
    const tx: Transaction = { request, before: new Map(), parents: new Map(), oldRoots: this.roots, oldWidth: this.width,
      oldHeight: this.height, oldEnvironment: this.environment, candidates: new Set(), layoutDirty: this.repair,
      round: 0, queries: new Map(), replies: new Map() };
    this.pending = tx; this.lastTarget = request.targetRevision;
    try {
      this.nextRequestId = Math.max(this.nextRequestId, request.nextRequestId);
      if (this.width !== request.width || this.height !== request.height || this.environment !== request.environmentVersion) tx.layoutDirty = true;
      if (this.environment !== request.environmentVersion) {
        this.cache.clear(); this.cacheKeys.clear();
        for (const record of this.nodes.values()) if (isMeasured(record.host.kind)) record.layout.markDirty();
      }
      this.width = request.width; this.height = request.height; this.environment = request.environmentVersion;
      const deletes = new Set<number>();
      for (const mutation of request.mutations) {
        if (mutation.type === "Children") {
          if (tx.parents.has(mutation.parentId)) throw new Error("DUPLICATE_CHILDREN_MUTATION");
          // Create messages may follow this entry; topology is resolved later.
          tx.parents.set(mutation.parentId, mutation.children.slice()); continue;
        }
        const id = mutation.nodeId;
        if (!isU32(id)) throw new Error("INVALID_CORE_NODE_ID");
        if (mutation.type === "Create") {
          if (this.nodes.has(id) || !validProps(mutation.props)) throw new Error("INVALID_CORE_CREATE");
          this.save(id);
          const host: RenderNode = { id, kind: mutation.kind, nativeName: mutation.nativeName, props: mutation.props,
            style: mutation.style, frame: zero, events: mutation.events, children: [] };
          const layout = this.engine.createNode();
          const record: RecordNode = { host, layout, children: [], parent: -1, frame: zero };
          this.nodes.set(id, record);
          layout.setLayoutObserver(() => { if (this.collecting) this.pending!.candidates.add(id); });
          if (isMeasured(host.kind)) layout.setMeasureFunc((width, mode) => this.measure(id, width, mode));
          updateStyle(layout, host); tx.layoutDirty = true; tx.candidates.add(id);
        } else if (mutation.type === "Patch") {
          const record = this.edit(id), old = record.host;
          const style = { ...old.style, ...mutation.styleSet };
          for (const key of mutation.styleUnset) {
            if (key in mutation.styleSet || !(key in old.style)) throw new Error("INVALID_STYLE_UNSET");
            delete (style as { [key: string]: unknown })[key];
          }
          const host = { ...old, props: patchProps(old.props, mutation.propsSet, mutation.propsUnset), style, events: mutation.events ?? old.events };
          record.host = host;
          if (layoutKey(old) !== layoutKey(host)) { updateStyle(record.layout, host); tx.layoutDirty = true; }
          if (isMeasured(host.kind) && measureKey(id, host.kind, textContent(old), old.style.fontSize ?? 16, 0, old.props) !== measureKey(id, host.kind, textContent(host), host.style.fontSize ?? 16, 0, host.props)) {
            record.layout.markDirty(); tx.layoutDirty = true;
          }
        } else { if (!this.nodes.has(id) || deletes.has(id)) throw new Error("INVALID_CORE_DELETE"); this.save(id); deletes.add(id); }
      }
      // Resolve the final parent map before checking cycles or touching Flexily.
      for (const [parent, ids] of tx.parents) {
        if (parent !== 0 && (!this.nodes.has(parent) || deletes.has(parent) || isMeasured(this.nodes.get(parent)!.host.kind))) throw new Error("INVALID_CORE_PARENT");
        if (new Set(ids).size !== ids.length) throw new Error("DUPLICATE_CORE_CHILD");
        const previous = this.children(parent);
        for (const id of previous) if (!ids.includes(id) && !deletes.has(id)) this.edit(id).parent = -1;
      }
      const assigned = new Set<number>();
      for (const [parent, ids] of tx.parents) {
        for (const id of ids) {
          if (!this.nodes.has(id) || deletes.has(id) || assigned.has(id)) throw new Error("INVALID_CORE_CHILD");
          assigned.add(id);
          const record = this.edit(id);
          if (record.parent !== -1 && record.parent !== parent && !tx.parents.has(record.parent) && !deletes.has(record.parent)) throw new Error("CORE_MULTIPLE_PARENTS");
          record.parent = parent;
        }
        if (!equalIds(this.children(parent), ids)) {
          if (parent === 0) this.roots = ids; else this.edit(parent).children = ids;
          tx.layoutDirty = true;
        }
      }
      for (const [id] of tx.before) if (!deletes.has(id)) {
        const record = this.nodes.get(id)!;
        if (record.parent < 0) throw new Error("ORPHAN_CORE_NODE");
        const seen = new Set<number>(); let ancestor = id;
        while (ancestor !== 0) {
          if (seen.has(ancestor) || deletes.has(ancestor)) throw new Error("CORE_GRAPH_CYCLE");
          seen.add(ancestor); const item = this.nodes.get(ancestor);
          if (!item || item.parent < 0) throw new Error("CORE_DANGLING_PARENT"); ancestor = item.parent;
        }
      }
      for (const id of deletes) {
        const parent = this.nodes.get(id)!.parent;
        if (parent >= 0 && !deletes.has(parent) && this.children(parent).includes(id)) throw new Error("CORE_DELETE_STILL_ATTACHED");
        const record = this.nodes.get(id)!;
        if (record.children.some(child => !deletes.has(child) && this.nodes.get(child)?.parent === id)) throw new Error("CORE_DELETE_HAS_SURVIVOR");
        this.nodes.delete(id); tx.layoutDirty = true;
      }
      this.syncTopology(tx);
      const result = this.prepare(); tx.replies.set(0, { input: JSON.stringify(request), result }); return result;
    } catch (error) { this.rollback(); this.through = request.transactionId; throw error; }
  }

  private syncTopology(tx: Transaction): void {
    // Detach every changed edge first; this also handles ancestor reversals.
    for (const [id, old] of tx.before) {
      const next = this.nodes.get(id);
      if (old && (!next || old.parent !== next.parent)) old.layout.getParent()?.removeChild(old.layout);
      if (!next && old) while (old.layout.getChildCount()) old.layout.removeChild(old.layout.getChild(0)!);
    }
    for (const [parent] of tx.parents) {
      if (parent !== 0 && !this.nodes.has(parent)) continue;
      const node = this.layout(parent), ids = this.children(parent);
      for (let i = 0; i < ids.length; i++) {
        const child = this.layout(ids[i]);
        if (node.getChild(i) !== child) node.insertChild(child, i);
      }
    }
  }

  private measure(id: number, width: number, mode: number): { width: number; height: number } {
    const record = this.nodes.get(id)!, host = record.host, tx = this.pending!;
    const maxWidth = mode === MEASURE_MODE_UNDEFINED || !Number.isFinite(width) ? this.width : Math.max(0, width);
    const text = textContent(host), fontSize = host.style.fontSize ?? 16;
    const key = measureKey(id, host.kind, text, fontSize, maxWidth, host.props);
    const cached = this.cache.get(key);
    if (cached) return cached;
    for (const query of tx.queries.values()) if (query.key === key) return { width: 0, height: 0 };
    const requestId = this.nextRequestId++;
    if (!isU32(requestId)) throw new Error("REQUEST_ID_OVERFLOW");
    tx.queries.set(requestId, { requestId, nodeId: id, key, kind: host.kind as MeasureQuery["kind"], text, fontSize, maxWidth, props: host.props });
    return { width: 0, height: 0 };
  }

  continue(request: ContinueRenderRequest): Prepared {
    if (!isU32(request.round) || !Array.isArray(request.measurements)) throw new Error("INVALID_CORE_ROUND");
    const held = this.completed.get(request.transactionId);
    if (held) { const reply = held.replies.get(request.round); if (!reply || reply.input !== JSON.stringify(request)) throw new Error("CONFLICTING_CORE_ROUND"); return reply.result; }
    const tx = this.transaction(request.transactionId);
    const repeated = tx.replies.get(request.round);
    if (repeated) { if (repeated.input !== JSON.stringify(request)) throw new Error("CONFLICTING_CORE_ROUND"); return repeated.result; }
    if (tx.ready || request.round !== tx.round || request.measurements.length !== tx.queries.size) throw new Error("STALE_CORE_ROUND");
    const matched = new Set<number>();
    for (const value of request.measurements) {
      const query = tx.queries.get(value.requestId);
      if (!query || matched.has(value.requestId) || query.nodeId !== value.nodeId || query.key !== value.key || ![value.width, value.height, value.baseline].every(dimension)) throw new Error("INVALID_CORE_MEASUREMENT");
      matched.add(value.requestId);
    }
    for (const value of request.measurements) {
      this.cache.set(value.key, { width: value.width, height: value.height, baseline: value.baseline });
      let keys = this.cacheKeys.get(value.nodeId);
      if (!keys) { keys = new Set(); this.cacheKeys.set(value.nodeId, keys); } keys.add(value.key);
      this.nodes.get(value.nodeId)!.layout.markDirty();
    }
    tx.queries.clear();
    try { const result = this.prepare(); tx.replies.set(request.round, { input: JSON.stringify(request), result }); return result; }
    catch (error) { this.rollback(); this.through = Math.max(this.through, request.transactionId); throw error; }
  }

  private prepare(): Prepared {
    const tx = this.pending!;
    if (++tx.round > 8) { this.rollback(); throw new Error("LAYOUT_NOT_CONVERGED"); }
    if (tx.layoutDirty) {
      this.root.setWidth(this.width); this.root.setHeight(this.height);
      this.collecting = true;
      try { this.engine.calculateLayout(this.root, this.width, this.height); } finally { this.collecting = false; }
    }
    const ready = tx.queries.size === 0;
    const frames: Prepared["frames"] = [];
    if (ready) for (const id of tx.candidates) {
      const record = this.nodes.get(id); if (!record) continue;
      const node = record.layout;
      const frame = { x: node.getComputedLeft(), y: node.getComputedTop(), width: node.getComputedWidth(), height: node.getComputedHeight() };
      if (![frame.x, frame.y].every(Number.isFinite) || !dimension(frame.width) || !dimension(frame.height)) throw new Error("INVALID_LAYOUT_FRAME");
      if (!tx.before.has(id) || tx.before.get(id)) { if (equalFrame(record.frame, frame)) continue; }
      this.edit(id).frame = frame; frames.push({ nodeId: id, frame });
    }
    const commands = ready ? this.commands(tx, frames) : [];
    const result: Prepared = { type: "Prepared", abi: CORE_ABI_VERSION, surfaceId: tx.request.surfaceId, generation: this.generation,
      transactionId: tx.request.transactionId, revision: tx.request.targetRevision, round: tx.round, ready,
      frames, commands, measures: [...tx.queries.values()], nextRequestId: this.nextRequestId,
      stats: { coreSyncNodes: tx.request.mutations.filter(m => m.type !== "Children").length, layoutVisited: tx.layoutDirty ? tx.candidates.size : 0,
        frameCandidates: tx.candidates.size, frameChanged: frames.length } };
    if (ready) tx.ready = result;
    return result;
  }

  private commands(tx: Transaction, frames: Prepared["frames"]): RenderCommand[] {
    const commands: RenderCommand[] = [];
    const entries = [...tx.before].sort((a, b) => a[0] - b[0]);
    const oldNode = (id: number): RecordNode | null => tx.before.has(id) ? (tx.before.get(id) ?? null) : this.nodes.get(id) ?? null;
    for (const [id, old] of entries) if (!old && this.nodes.has(id)) {
      const host = this.nodes.get(id)!.host;
      commands.push({ type: "CreateNode", nodeId: id, kind: host.kind, ...(host.nativeName ? { nativeName: host.nativeName } : {}) });
    }
    for (const [id, old] of tx.before) {
      const next = this.nodes.get(id);
      if (old && next && old.parent !== next.parent) commands.push({ type: "DetachChild", nodeId: id });
    }
    for (const [id, old] of tx.before) if (old && !this.nodes.has(id) && (old.parent === 0 || this.nodes.has(old.parent))) commands.push({ type: "RemoveNode", nodeId: id });
    // Only changed lists are simulated. Index is the position after removal.
    // Cost is explicitly list-size dependent; leaf patches never enter here.
    for (const [parent, ids] of tx.parents) {
      const old = parent === 0 ? tx.oldRoots : oldNode(parent)?.children ?? [];
      const sequence = old.filter(id => this.nodes.get(id)?.parent === parent && oldNode(id)?.parent === parent);
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]; if (sequence[i] === id) continue;
        const at = sequence.indexOf(id); if (at >= 0) sequence.splice(at, 1);
        sequence.splice(i, 0, id);
        commands.push({ type: oldNode(id) ? "MoveChild" : "InsertChild", nodeId: id, parentId: parent, index: i });
      }
    }
    for (const [id, old] of entries) {
      const next = this.nodes.get(id); if (!next) continue;
      const patch = propPatch(old?.host.props ?? {}, next.host.props);
      if (Object.keys(patch.set).length || patch.unset.length) commands.push({ type: "PatchProps", nodeId: id, ...patch });
      const events = new Set([...(old?.host.events ?? []), ...next.host.events]);
      for (const event of events) if ((old?.host.events.includes(event) ?? false) !== next.host.events.includes(event)) commands.push({ type: "BindEvent", nodeId: id, event, enabled: next.host.events.includes(event) });
    }
    for (const item of frames.sort((a, b) => a.nodeId - b.nodeId)) commands.push({ type: "SetFrame", ...item });
    return commands;
  }

  private transaction(id: number): Transaction {
    if (!this.pending || this.pending.request.transactionId !== id) throw new Error("STALE_CORE_TRANSACTION"); return this.pending;
  }
  finish(request: FinishRenderRequest): CoreResult {
    const repeated = this.terminal.get(request.transactionId), input = request.type;
    if (repeated) { if (repeated.input !== input) throw new Error("CORE_TRANSACTION_TERMINATED"); return repeated.result; }
    const tx = this.transaction(request.transactionId);
    if (request.type === "FinalizeRender") {
      if (!tx.ready) throw new Error("CORE_NOT_PREPARED");
      for (const [id, old] of tx.before) if (old && !this.nodes.has(id)) {
        this.engine.releaseSubtree(old.layout);
        for (const key of this.cacheKeys.get(id) ?? []) this.cache.delete(key);
        this.cacheKeys.delete(id);
      }
      this.revision = tx.request.targetRevision; this.repair = false; this.pending = null;
      // Bound measurements while idle, never evict during a transaction.
      this.pruneCache();
    } else this.rollback();
    this.through = Math.max(this.through, request.transactionId);
    const result: CoreResult = { type: request.type === "FinalizeRender" ? "Finalized" : "Aborted", abi: CORE_ABI_VERSION,
      surfaceId: request.surfaceId, generation: this.generation, transactionId: request.transactionId, revision: this.revision };
    this.terminal.set(request.transactionId, { input, result });
    this.completed.set(request.transactionId, tx);
    while (this.completed.size > 8) this.completed.delete(this.completed.keys().next().value!);
    while (this.terminal.size > 16) this.terminal.delete(this.terminal.keys().next().value!);
    return result;
  }

  private rollback(): void {
    const tx = this.pending; if (!tx) return;
    const created: Node[] = [];
    for (const [id, old] of tx.before) {
      const next = this.nodes.get(id);
      (next ?? old)?.layout.getParent()?.removeChild((next ?? old)!.layout);
      if (!old && next) created.push(next.layout);
    }
    // Clear changed parents before reconnecting; all old records remain owned.
    for (const [parent] of tx.parents) {
      const node = parent === 0 ? this.root : (this.nodes.get(parent) ?? tx.before.get(parent))?.layout;
      if (node) while (node.getChildCount()) node.removeChild(node.getChild(0)!);
    }
    for (const [id, old] of tx.before) {
      if (old) { this.nodes.set(id, old); updateStyle(old.layout, old.host); old.layout.markDirty(); }
      else {
        this.nodes.delete(id);
        for (const key of this.cacheKeys.get(id) ?? []) this.cache.delete(key);
        this.cacheKeys.delete(id);
      }
    }
    this.roots = tx.oldRoots; this.width = tx.oldWidth; this.height = tx.oldHeight; this.environment = tx.oldEnvironment;
    const parents = new Set<number>(tx.parents.keys());
    for (const old of tx.before.values()) if (old && old.parent >= 0) parents.add(old.parent);
    for (const parent of parents) if (parent === 0 || this.nodes.has(parent)) {
      const node = this.layout(parent), ids = this.children(parent);
      for (let i = 0; i < ids.length; i++) if (node.getChild(i) !== this.layout(ids[i])) node.insertChild(this.layout(ids[i]), i);
    }
    for (const node of created) { while (node.getChildCount()) node.removeChild(node.getChild(0)!); this.engine.releaseSubtree(node); }
    this.pending = null; this.repair = true; this.pruneCache();
  }
  private pruneCache(): void {
    while (this.cache.size > 4096) {
      const key = this.cache.keys().next().value!; this.cache.delete(key);
      const id = Number(key.slice(1, key.indexOf(','))), keys = this.cacheKeys.get(id);
      keys?.delete(key); if (keys?.size === 0) this.cacheKeys.delete(id);
    }
  }
  reset(request: ResetSurfaceRequest): CoreResult {
    if (request.resetToken < this.resetToken) throw new Error("STALE_CORE_RESET");
    if (request.resetToken !== this.resetToken) {
      if (this.pending) this.rollback();
      for (const node of this.nodes.values()) { node.layout.getParent()?.removeChild(node.layout); while (node.layout.getChildCount()) node.layout.removeChild(node.layout.getChild(0)!); }
      for (const node of this.nodes.values()) this.engine.releaseSubtree(node.layout);
      this.nodes.clear(); this.roots = []; this.revision = 0; this.cache.clear(); this.cacheKeys.clear(); this.terminal.clear(); this.completed.clear(); this.repair = true;
      this.resetToken = request.resetToken;
    }
    this.through = Math.max(this.through, request.rejectedThroughTransactionId);
    return { type: "SurfaceReset", abi: CORE_ABI_VERSION, surfaceId: request.surfaceId, generation: this.generation, transactionId: request.transactionId, resetToken: request.resetToken };
  }
  dispose(): void { this.engine.dispose(); this.nodes.clear(); this.cache.clear(); this.cacheKeys.clear(); this.pending = null; this.terminal.clear(); this.completed.clear(); }
}

export class TransactionKernel {
  private surfaces = new Map<number, TransactionSurface>();
  execute(request: BeginRenderRequest | ContinueRenderRequest | FinishRenderRequest | ResetSurfaceRequest): CoreResult {
    if (!isU32(request.surfaceId) || !isU32(request.generation) || !isU32(request.transactionId, request.type === "ResetSurface")) throw new Error("INVALID_CORE_HEADER");
    if (request.type === "ResetSurface" && (!isU32(request.resetToken) || !isU32(request.rejectedThroughTransactionId, true))) throw new Error("INVALID_CORE_RESET");
    let surface = this.surfaces.get(request.surfaceId);
    if (surface && surface.generation > request.generation) throw new Error("STALE_SURFACE_GENERATION");
    if (surface && surface.generation !== request.generation) { surface.dispose(); this.surfaces.delete(request.surfaceId); surface = undefined; }
    if (!surface) { if (request.type !== "BeginRender" && request.type !== "ResetSurface") throw new Error("UNKNOWN_CORE_SURFACE"); surface = new TransactionSurface(request.generation); this.surfaces.set(request.surfaceId, surface); }
    if (request.type === "BeginRender") return surface.begin(request);
    if (request.type === "ContinueRender") return surface.continue(request);
    if (request.type === "ResetSurface") return surface.reset(request);
    return surface.finish(request);
  }
  release(id: number, generation: number): void { const surface = this.surfaces.get(id); if (surface?.generation === generation) { surface.dispose(); this.surfaces.delete(id); } }
  dispose(): void { for (const surface of this.surfaces.values()) surface.dispose(); this.surfaces.clear(); }
}
