import { templateNode } from "../../ui/src/template.js";
import type { TemplateElement, HostTemplate } from "../../ui/src/template.js";
import { registerTimerScope, unregisterTimerScope, withTimerScope, timeoutInScope, clearTimeout, forgetTimeout } from "../../ui/src/timers.js";
import type { TimerScope } from "../../ui/src/timers.js";
import { prepareTextMeasurement } from "../../ui/src/text-measurement.js";
import { CORE_ABI_VERSION } from "./contracts.js";
import type { RenderNode, BeginRenderRequest, NodeMutation, CoreRequest, CoreResult } from "./contracts.js";
import {
  PROTOCOL_MAJOR, PROTOCOL_MINOR, RENDER_CAPABILITIES, RENDER_LIMITS, splitCommit, propPatch, isU32, validateEnvelope, validateAnimationOptions, validateAnimationStyle,
} from "@anseronui/protocol";
import type {
  Envelope, Frame, InputPayload, NativeEvent, EventKind, NodeKind, OutputPayload, RenderCommand, RenderProps,
} from "@anseronui/protocol";
import { normalizeChildren, setHookDispatcher, RefCell, createNativeServices, NativeServiceError } from "@anseronui/ui";
import type {
  Child, Component, Context, EffectSetup, HookDispatcher, Page, Ref, Services, Style, UIElement, MeasureTextOptions, TextSize,
} from "@anseronui/ui";

type PendingUpdate = { id: number; value: unknown };
type StateSlot = { owner: string; kind: "state" | "reducer"; value: unknown; pending: PendingUpdate[]; dispatch: (value: unknown) => void; active: boolean; reducer?: (state: unknown, action: unknown) => unknown };
type RefSlot = { kind: "ref"; ref: RefCell };
type MemoSlot = { kind: "memo"; value: unknown; deps: readonly unknown[] };
type EffectSlot = { kind: "effect"; setup: EffectSetup; deps?: readonly unknown[]; cleanup?: () => void };
type ServiceSlot = { kind: "services"; facade: Services; active: boolean; subscriptions: Set<() => void>; pageListeners: Set<(visible: boolean) => void> };
type Slot = StateSlot | RefSlot | MemoSlot | EffectSlot | ServiceSlot;
type DraftSlot =
  | { kind: "state" | "reducer"; slot: StateSlot; value: unknown; watermark: number }
  | { kind: "ref"; slot: RefSlot }
  | { kind: "memo"; slot: MemoSlot; value: unknown; deps: readonly unknown[] }
  | { kind: "effect"; slot: EffectSlot; setup: EffectSetup; deps?: readonly unknown[]; changed: boolean }
  | { kind: "services"; slot: ServiceSlot };
type ContextRead = { context: Context<any>; value: unknown; provider: string };
type ComponentFrame = { regionPath: string; path: string; component: Component<any>; props: object; rendered: UIElement | null; contexts: Map<number, ContextRead>; slots: Slot[]; depth: number };
type DraftFrame = { regionPath: string; path: string; component: Component<any>; base: ComponentFrame | null; props: object; rendered: UIElement | null; contexts: Map<number, ContextRead>; slots: DraftSlot[]; depth: number; reused?: ComponentFrame };
type EventCallbacks = {
  nativeComponent?: (event: import("@anseronui/ui").NativeComponentEvent) => void | Promise<void>;
  tap?: () => void | Promise<void>; changeText?: (value: string) => void | Promise<void>;
  longPress?: () => void | Promise<void>; backPress?: () => boolean; focus?: () => void | Promise<void>; blur?: () => void | Promise<void>;
  submit?: (value: string) => void | Promise<void>;
  scroll?: (offset: number, event: { x: number; y: number; contentWidth: number; contentHeight: number; scrollAdjustment?: number }) => void | Promise<void>;
  scrollEnd?: (event: { x: number; y: number; contentWidth: number; contentHeight: number; scrollAdjustment?: number }) => void | Promise<void>;
  layout?: (frame: Frame) => void | Promise<void>;
  loadSuccess?: (source: string) => void | Promise<void>;
  loadFailure?: (source: string, errorCode: number) => void | Promise<void>;
  playStateDidChanged?: (state: string) => void | Promise<void>;
  playTimeDidChanged?: (currentTime: number, duration: number) => void | Promise<void>;
  firstFrameDidDisplay?: () => void | Promise<void>;
  touchDown?: (event: import("@anseronui/ui").TouchEvent) => void | Promise<void>;
  touchMove?: (event: import("@anseronui/ui").TouchEvent) => void | Promise<void>;
  touchUp?: (event: import("@anseronui/ui").TouchEvent) => void | Promise<void>;
  touchCancel?: (event: import("@anseronui/ui").TouchEvent) => void | Promise<void>;
  touchDownCapture?: (event: import("@anseronui/ui").TouchEvent) => void | Promise<void>;
  touchMoveCapture?: (event: import("@anseronui/ui").TouchEvent) => void | Promise<void>;
  touchUpCapture?: (event: import("@anseronui/ui").TouchEvent) => void | Promise<void>;
  touchCancelCapture?: (event: import("@anseronui/ui").TouchEvent) => void | Promise<void>;
  spanClick?: (index: number) => void | Promise<void>;
};
type UIInput = Extract<InputPayload, { type: "Tap" | "InputChange" | "NativeEvent" }>;
const EVENT_NAMES: EventKind[] = ["nativeComponent", "tap", "changeText", "longPress", "backPress", "focus", "blur", "submit", "scroll", "scrollEnd", "layout", "touchDown", "touchMove", "touchUp", "touchCancel", "spanClick", "loadSuccess", "loadFailure", "playStateDidChanged", "playTimeDidChanged", "firstFrameDidDisplay"];
type HostNode = { id: number; path: string; kind: NodeKind; props: RenderProps; style: Style; children: HostNode[]; frame: Frame; events: EventCallbacks; nativeName?: string; ref?: import("@anseronui/ui").RefTarget<import("@anseronui/ui").NodeHandle> };
type MeasureQuery = { requestId: number; nodeId: number; kind: "Text" | "RichText" | "TextInput"; text: string; fontSize: number; maxWidth: number; props: RenderProps; key: string };
type TemplateInstance = { plan: HostTemplate; values: unknown[]; paths: string[]; root: import("@anseronui/ui").HostElement };
type OutputRegion = { template?: TemplateInstance; path: string; parent: string | null; element: UIElement; context: Map<number, unknown>; depth: number; children: string[]; output: HostNode[]; hostId?: number; framePath?: string };
type Draft = { contextOwners: Set<string>; lastRequest?: CoreRequest; commitPayloads: OutputPayload[]; staticChildren: Map<string, HostNode[]>; watermark: number; regions: Map<string, OutputRegion>; hosts: Map<number, HostNode>; removedRegions: Set<string>; removedHosts: Set<number>; removedFrames: Set<string>; inputTokens: Map<number, number>; measurements: { requestId: number; nodeId: number; key: string; width: number; height: number; baseline: number }[]; finalizing: boolean; revision: number; tree: HostNode[]; frames: Map<string, DraftFrame>; measures: Map<number, MeasureQuery>; measureRound: number; readyForAck: boolean; corePending: boolean; coreStarted?: number; commitStarted?: number };
type Surface = {
  visible: boolean; timerScope: TimerScope; timers: Map<number, { id: number; callback: () => void; remaining: number; started: number; suspended: boolean }>;
  id: number; generation: number; page: Page<any>; width: number; height: number;
  recovering: boolean; recoveryAttempts: number; resetToken: number; coreResetAck: boolean; hostResetAck: boolean; recoveryNodes: HostNode[] | null;
  watchdog: number | null; retries: number; contextConsumers: Map<string, Set<string>>; backHandlers: Set<number>; backOrder: number[] | null; positions: Map<number, number>;
  nextRevision: number; dirtyOwners: Set<string>; regions: Map<string, OutputRegion>; nodes: Map<number, HostNode>; parents: Map<number, number>; inputSyncDirty: Set<number>; environmentVersion: number;
  revision: number; frames: Map<string, ComponentFrame>; tree: HostNode[];
  pending: Draft | null; dirty: boolean; nodeIds: Map<string, number>;
  nextNodeId: number; nextRequestId: number; nextUpdateId: number;
  measureCache: Map<string, { width: number; height: number; baseline: number }>;
  modules: Map<number, { owner: ServiceSlot; resolve: (value: string) => void; reject: (reason: Error) => void; measureNodeId?: number }>;
  handles: Map<number, { owner: ServiceSlot; handle: import("@anseronui/ui").NodeHandle }>;
  deferredEvents: InputPayload[];
  inputRevisions: Map<number, number>;
};

export interface RuntimeOptions { renderCore?: (request: CoreRequest) => CoreResult; bundleBuildId: string; pages: Page<any>[]; runtimeEpoch?: number; onWake?: () => void; profile?: boolean }

function sameDeps(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  if (a === undefined || b === undefined || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}
function sameProps(a: object, b: object): boolean {
  const left = Object.keys(a);
  const right = Object.keys(b);
  return left.length === right.length && left.every(key => Object.prototype.hasOwnProperty.call(b, key) && Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
function sameFrame(a: Frame, b: Frame): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
function finiteDimension(value: number): boolean { return Number.isFinite(value) && value >= 0; }
// Nested intrinsic containers can reveal another text constraint after each
// measurement pass. Allow bounded convergence for composed controls and lists.
const MAX_MEASURE_ROUNDS = 8;

/** Shared UI runtime, executed directly in JS or AOT compiled into native libraries and Wasm. */
export class BusinessRuntime {
  readonly bundleBuildId: string;
  readonly runtimeEpoch: number;
  private pages = new Map<string, Page<any>>();
  private surfaces = new Map<number, Surface>();
  private generations = new Map<number, number>();
  private incoming: Envelope<InputPayload>[] = [];
  private outgoing: Envelope<OutputPayload>[] = [];
  private inputSequences = new Map<string, number>();
  private outputSequences = new Map<string, number>();
  private componentTypes = new WeakMap<Component<any>, number>();
  private nextComponentType = 1;
  private disposed = false;
  private readonly onWake?: () => void;
  private readonly renderCore?: (request: CoreRequest) => CoreResult;
  private coreRequests: CoreRequest[] = [];
  private profiling = false;
  private metrics: Record<string, number> = {};
  private countMetric(name: string, value = 1): void { if (this.profiling) this.metrics[name] = (this.metrics[name] ?? 0) + Math.max(0, value); }
  /** Counts are live; phase durations/traffic are collected only when profiling is enabled. */
  getStats(): Record<string, number> {
    let nodes = 0, frames = 0, timers = 0, modules = 0, measurements = 0, hidden = 0, pendingRenders = 0;
    for (const surface of this.surfaces.values()) {
      nodes += surface.nodes.size; frames += surface.frames.size; timers += surface.timers.size;
      modules += surface.modules.size; measurements += surface.measureCache.size; if (!surface.visible) hidden++; if (surface.pending) pendingRenders++;
    }
    return { ...this.metrics, pendingRenders, surfaces: this.surfaces.size, hiddenSurfaces: hidden, nodes, frames, timers, modules,
      measureCacheEntries: measurements, incoming: this.incoming.length, outgoing: this.outgoing.length, coreRequests: this.coreRequests.length };
  }

  constructor(options: RuntimeOptions) {
    if (!options.bundleBuildId || options.bundleBuildId.length > 128) throw new Error("Invalid build ID");
    this.bundleBuildId = options.bundleBuildId;
    this.profiling = options.profile ?? false;
    this.onWake = options.onWake;
    this.renderCore = options.renderCore;
    this.runtimeEpoch = options.runtimeEpoch ?? 1;
    if (!isU32(this.runtimeEpoch)) throw new Error("Invalid runtime epoch");
    for (const page of options.pages) {
      if (this.pages.has(page.name)) throw new Error("Duplicate page: " + page.name);
      this.pages.set(page.name, page);
    }
  }

  post(input: Envelope<InputPayload>): void {
    if (this.disposed) return;
    validateEnvelope<InputPayload>(input);
    if (input.bundleBuildId !== this.bundleBuildId || input.runtimeEpoch !== this.runtimeEpoch) return;
    const surface = this.surfaces.get(input.surfaceId);
    const latestGeneration = this.generations.get(input.surfaceId) ?? 0;
    if (surface && surface.generation !== input.surfaceGeneration) return;
    if (!surface) {
      if (input.surfaceGeneration <= latestGeneration ||
        (input.payload.type !== "Handshake" && input.payload.type !== "CreateSurface")) return;
    }
    const identity = input.surfaceId + ":" + input.surfaceGeneration;
    const previous = this.inputSequences.get(identity) ?? 0;
    if (input.sequence <= previous) return;
    if (input.sequence !== previous + 1) throw new Error("PROTOCOL_SEQUENCE_GAP");
    if (input.ackSequence > (this.outputSequences.get(identity) ?? 0)) throw new Error("PROTOCOL_ACK_AHEAD");
    if (this.incoming.length >= 4096) throw new Error("PROTOCOL_QUEUE_FULL");
    this.inputSequences.set(identity, input.sequence);
    this.incoming.push(input);
  }

  /** A bounded, nonblocking step. Calls are serialized by the adapter owner. */
  step(maxMessages = 64): Envelope<OutputPayload>[] {
    if (this.disposed) return [];
    if (!Number.isInteger(maxMessages) || maxMessages < 1) throw new Error("Invalid step budget");
    let count = 0;
    while (this.incoming.length > 0 && count++ < maxMessages) this.handle(this.incoming.shift()!);
    for (const surface of this.surfaces.values()) {
      if (surface.visible && !surface.recovering && !surface.pending && surface.deferredEvents.length > 0) {
        const events = surface.deferredEvents;
        surface.deferredEvents = [];
        let blocked = false;
        for (const event of events) {
          if (event.type !== "Tap" && event.type !== "NativeEvent") continue;
          // Consume current motion and its gesture boundaries before rendering
          // again. Requiring an ACK per sample makes drags chase old positions.
          const continuous = event.type === "NativeEvent" && ["scroll", "touchDown", "touchMove", "touchUp", "touchCancel"].includes(event.event);
          if (blocked || surface.dirty && !continuous) { blocked = true; surface.deferredEvents.push(event); }
          else this.invokeEvent(surface, { ...event, revision: surface.revision });
        }
      }
      if (this.incoming.length === 0 && surface.visible && surface.dirty && !surface.pending && (!surface.recovering || surface.coreResetAck && surface.hostResetAck)) this.beginRender(surface);
      this.ensureWatchdog(surface);
    }
    return this.takeOutputs();
  }

  takeOutputs(): Envelope<OutputPayload>[] { const result = this.outgoing; this.outgoing = []; return result; }
  takeCoreRequest(): CoreRequest | null { return this.coreRequests.shift() ?? null; }

  hasPendingWork(): boolean {
    return this.coreRequests.length > 0 || this.incoming.length > 0 || this.outgoing.length > 0 || [...this.surfaces.values()].some(s => s.visible && s.dirty && !s.pending);
  }

  dispose(): void {
    if (this.disposed) return;
    for (const surface of this.surfaces.values()) this.disposeSurface(surface);
    this.surfaces.clear();
    this.incoming = [];
    this.coreRequests = [];
    this.outgoing = [];
    this.inputSequences.clear();
    this.outputSequences.clear();
    this.generations.clear();
    this.disposed = true;
  }

  private emitError(surface: Surface | { id: number; generation: number }, code: string, error: unknown): void {
    let message = "Unprintable thrown value";
    let stack = "";
    let errorName = "NonErrorThrown";
    try { message = String(error).slice(0, 4096); } catch {}
    // Read the original stack, never create a replacement Error in the collector.
    try {
      if (error instanceof Error) {
        errorName = String(error.name).slice(0, 256);
        const originalStack = error.stack;
        if (typeof originalStack === "string") stack = originalStack.slice(0, 32768);
      }
    } catch {}
    this.emit(surface, { type: "Diagnostic", code, message, stack, errorName, buildId: this.bundleBuildId });
  }

  private emit(surface: Surface | { id: number; generation: number }, payload: OutputPayload): void {
    const identity = surface.id + ":" + surface.generation;
    const sequence = (this.outputSequences.get(identity) ?? 0) + 1;
    if (!isU32(sequence)) throw new Error("PROTOCOL_SEQUENCE_OVERFLOW");
    this.outputSequences.set(identity, sequence);
    this.outgoing.push({
      protocolMajor: PROTOCOL_MAJOR, protocolMinor: PROTOCOL_MINOR,
      bundleBuildId: this.bundleBuildId, runtimeEpoch: this.runtimeEpoch,
      surfaceId: surface.id, surfaceGeneration: surface.generation, sequence,
      ackSequence: this.inputSequences.get(identity) ?? 0, payload,
    });
    this.onWake?.();
  }

  private handle(input: Envelope<InputPayload>): void {
    const payload = input.payload;
    if (payload.type === "Handshake") {
      if (payload.capabilities && !RENDER_CAPABILITIES.every(capability => payload.capabilities!.includes(capability)) || payload.limits && (payload.limits.messageBytes < RENDER_LIMITS.messageBytes || payload.limits.transactionBytes < RENDER_LIMITS.transactionBytes || payload.limits.commandsPerMessage < RENDER_LIMITS.commandsPerMessage || payload.limits.commandsPerTransaction < RENDER_LIMITS.commandsPerTransaction)) {
        this.emit({ id: input.surfaceId, generation: input.surfaceGeneration }, { type: "Diagnostic", code: "RENDER_CAPABILITY_MISMATCH", message: "Host does not support the required render commands and transaction limits" }); return;
      }
      const supportedNodes: NodeKind[] = ["View", "Text", "RichText", "TextInput", "ScrollView", "Image", "Video", "Native"];
      if (payload.requiredNodes.some(kind => !supportedNodes.includes(kind))) {
        this.emit({ id: input.surfaceId, generation: input.surfaceGeneration }, { type: "Diagnostic", code: "UNSUPPORTED_NODE", message: "Required node is unavailable" });
      } else this.emit({ id: input.surfaceId, generation: input.surfaceGeneration }, { type: "Ready", supportedNodes, capabilities: RENDER_CAPABILITIES, limits: RENDER_LIMITS });
      return;
    }
    if (payload.type === "CreateSurface") {
      const previous = this.generations.get(input.surfaceId) ?? 0;
      if (input.surfaceGeneration <= previous || this.surfaces.has(input.surfaceId)) return;
      const page = this.pages.get(payload.page);
      if (!page || !finiteDimension(payload.width) || !finiteDimension(payload.height)) {
        this.emit({ id: input.surfaceId, generation: input.surfaceGeneration }, { type: "Diagnostic", code: "INVALID_SURFACE", message: "Unknown page or invalid size" });
        return;
      }
      this.generations.set(input.surfaceId, input.surfaceGeneration);
      const timerScope: TimerScope = { active: true,
        schedule: (id, callback, milliseconds) => {
          if (this.rendering) throw new Error("TIMER_DURING_RENDER");
          const surface = this.surfaces.get(input.surfaceId);
          if (!surface || surface.generation !== input.surfaceGeneration) throw new Error("SURFACE_DISPOSED");
          const requestId = surface.nextRequestId++;
          if (!isU32(requestId)) throw new Error("REQUEST_ID_OVERFLOW");
          surface.timers.set(requestId, { id, callback, remaining: milliseconds, started: Date.now(), suspended: !surface.visible });
          if (surface.visible) this.emit(surface, { type: "InvokeModule", requestId, module: "timer", method: "sleep", argument: String(milliseconds) });
        },
        cancel: id => {
          const surface = this.surfaces.get(input.surfaceId);
          if (!surface || surface.generation !== input.surfaceGeneration) return;
          for (const [requestId, timer] of surface.timers) if (timer.id === id) {
            surface.timers.delete(requestId);
            this.emit(surface, { type: "CancelRequest", requestId });
          }
        },
      };
      registerTimerScope(timerScope);
      this.surfaces.set(input.surfaceId, {
        visible: payload.visible !== false, timerScope, timers: new Map(),
        id: input.surfaceId, generation: input.surfaceGeneration, page,
        width: payload.width, height: payload.height, revision: 0,
        frames: new Map(), tree: [], pending: null, dirty: true, watchdog: null, retries: 0, contextConsumers: new Map(), backHandlers: new Set(), backOrder: null, positions: new Map(), recovering: false, recoveryAttempts: 0, resetToken: 0, coreResetAck: false, hostResetAck: false, recoveryNodes: null, nextRevision: 1, dirtyOwners: new Set(), regions: new Map(), nodes: new Map(), parents: new Map(), inputSyncDirty: new Set(), environmentVersion: 0,
        nodeIds: new Map(), nextNodeId: 1, nextRequestId: 1, nextUpdateId: 1,
        measureCache: new Map(), modules: new Map(), handles: new Map(), deferredEvents: [], inputRevisions: new Map(),
      });
      return;
    }
    const surface = this.surfaces.get(input.surfaceId);
    if (!surface || surface.generation !== input.surfaceGeneration) return;
    if (payload.type === "InspectRuntime") {
      if (payload.enabled !== undefined) this.profiling = payload.enabled;
      if (payload.reset) this.metrics = {};
      this.emit(surface, { type: "RuntimeStats", values: this.getStats() });
    } else if (payload.type === "DestroySurface") {
      this.disposeSurface(surface);
      this.surfaces.delete(surface.id);
      this.emit(surface, { type: "SurfaceDisposed" });
      const identity = surface.id + ":" + surface.generation;
      this.inputSequences.delete(identity);
      this.outputSequences.delete(identity);
    } else if (payload.type === "SurfaceVisibility") {
      this.setVisibility(surface, payload.visible);
    } else if (payload.type === "BackPress") {
      this.emit(surface, { type: "BackPressResult", consumed: this.invokeBackPress(surface) });
    } else if (payload.type === "EnvironmentChanged") {
      if (payload.version > surface.environmentVersion) { surface.environmentVersion = payload.version; surface.dirty = true; }
    } else if (payload.type === "ResetAck") {
      if (surface.recovering && payload.resetToken === surface.resetToken) { this.progress(surface); surface.hostResetAck = true; this.resumeRecovery(surface); }
    } else if (payload.type === "Resize") {
      if (!finiteDimension(payload.width) || !finiteDimension(payload.height)) return;
      surface.width = payload.width; surface.height = payload.height; surface.dirty = true;
    } else if (payload.type === "MeasureResult") {
      this.acceptMeasure(surface, payload);
    } else if (payload.type === "CommitAck") {
      this.ack(surface, payload.revision);
    } else if (payload.type === "CommitFailed") {
      if (surface.pending?.revision === payload.revision) {
        if (payload.reason === "SCROLL_WINDOW_SUPERSEDED" && surface.pending.readyForAck) {
          this.abandonScrollWindow(surface, surface.pending);
        } else this.recoverSurface(surface, payload.reason);
      }
    } else if (payload.type === "Tap" || payload.type === "InputChange" || payload.type === "NativeEvent") {
      if (!surface.visible) return;
      if (payload.type === "NativeEvent" && ["scroll", "scrollEnd", "touchDown", "touchMove", "touchUp", "touchCancel"].includes(payload.event) && payload.revision <= surface.revision) {
        // Native motion remains valid when a commit overtakes its event. In
        // particular, a late up/cancel must still finish the active gesture.
        // IDs are not reused; invokeEvent rejects nodes that were unmounted.
        if (surface.pending || surface.dirty) this.deferEvent(surface, payload);
        else this.invokeEvent(surface, { ...payload, revision: surface.revision });
      } else if ((payload.type === "Tap" || payload.type === "NativeEvent") && (surface.pending || surface.dirty) &&
          (payload.revision === surface.revision || payload.revision === surface.pending?.revision)) this.deferEvent(surface, payload);
      else if (surface.pending && payload.revision === surface.pending.revision) this.deferEvent(surface, payload);
      else this.invokeEvent(surface, payload);
    } else if (payload.type === "ModuleResult") {
      if (payload.requestId === surface.watchdog) { surface.watchdog = null; this.retryTransaction(surface); return; }
      const timer = surface.timers.get(payload.requestId);
      if (timer) {
        if (timer.suspended) return;
        surface.timers.delete(payload.requestId); forgetTimeout(timer.id);
        if (payload.ok) {
          try {
            const result = withTimerScope(surface.timerScope, timer.callback) as unknown;
            if (result instanceof Promise) result.catch(error => {
              if (surface.timerScope.active) this.emitError(surface, "TIMER_ERROR", error);
            });
          } catch (error) { this.emitError(surface, "TIMER_ERROR", error); }
        } else this.emit(surface, { type: "Diagnostic", code: "TIMER_ERROR", message: payload.value });
        return;
      }
      const request = surface.modules.get(payload.requestId);
      if (!request || !request.owner.active || request.measureNodeId !== undefined) return;
      surface.modules.delete(payload.requestId);
      if (payload.ok) request.resolve(payload.value);
      else request.reject(new Error(payload.value));
    }
  }

  private deferEvent(surface: Surface, event: UIInput): void {
    // Pending motion is a latest-position snapshot, not a path to replay one
    // render/ACK at a time. Keep gesture boundaries and other inputs as barriers.
    if (event.type === "NativeEvent" && event.event === "touchMove") {
      for (let i = surface.deferredEvents.length - 1; i >= 0; i--) {
        const previous = surface.deferredEvents[i];
        if (previous.type !== "NativeEvent" || previous.event !== "touchMove") break;
        if (previous.nodeId === event.nodeId && previous.targetId === event.targetId && previous.pointerId === event.pointerId) {
          surface.deferredEvents.splice(i, 1); break;
        }
      }
    }
    // Scroll offsets describe current viewport state. Replaying old offsets after
    // an asynchronous layout makes virtual lists chase a fling for seconds.
    // Discrete events are barriers: never move a scroll update across a tap/input.
    if (event.type === "NativeEvent" && event.event === "scroll") {
      for (let i = surface.deferredEvents.length - 1; i >= 0; i--) {
        const previous = surface.deferredEvents[i];
        if (previous.type !== "NativeEvent" || previous.event !== "scroll") break;
        if (previous.nodeId === event.nodeId) { surface.deferredEvents.splice(i, 1); break; }
      }
    }
    surface.deferredEvents.push(event);
  }

  private setVisibility(surface: Surface, visible: boolean): void {
    if (surface.visible === visible) return;
    surface.visible = visible;
    if (!visible) surface.deferredEvents = [];
    for (const [requestId, timer] of [...surface.timers]) {
      if (!visible && !timer.suspended) {
        timer.remaining = Math.max(0, timer.remaining - Math.max(0, Date.now() - timer.started));
        timer.suspended = true;
        this.emit(surface, { type: "CancelRequest", requestId });
      } else if (visible && timer.suspended) {
        surface.timers.delete(requestId);
        const next = surface.nextRequestId++;
        if (!isU32(next)) throw new Error("REQUEST_ID_OVERFLOW");
        timer.started = Date.now(); timer.suspended = false;
        surface.timers.set(next, timer);
        this.emit(surface, { type: "InvokeModule", requestId: next, module: "timer", method: "sleep", argument: String(timer.remaining) });
      }
    }
    for (const frame of surface.frames.values()) for (const slot of frame.slots) if (slot.kind === "services") {
      for (const listener of [...slot.pageListeners]) {
        try { withTimerScope(surface.timerScope, () => listener(visible)); }
        catch (error) { this.emitError(surface, "PAGE_LIFECYCLE_ERROR", error); }
      }
    }
  }

  private invokeEvent(surface: Surface, event: UIInput): void {
    withTimerScope(surface.timerScope, () => this.invokeScopedEvent(surface, event));
  }
  private invokeScopedEvent(surface: Surface, event: UIInput): void {
    if (!surface.visible || surface.recovering) return;
    if (event.type !== "InputChange" && event.revision !== surface.revision) return;
    if (event.type === "InputChange" && (event.revision > surface.revision || event.inputRevision <= (surface.inputRevisions.get(event.nodeId) ?? 0))) return;
    const touchInput = event.type === "NativeEvent" && ["touchDown", "touchMove", "touchUp", "touchCancel"].includes(event.event);
    const node = surface.nodes.get(touchInput ? event.targetId ?? event.nodeId : event.nodeId);
    if (!node || node.props.disabled === true || node.style.visibility === "hidden") return;
    try {
      let result: void | Promise<void> = undefined;
      if (event.type === "Tap") {
        if (!node.events.tap) return;
        result = node.events.tap();
      } else if (event.type === "NativeEvent") {
        if (event.event === "nativeComponent") result = node.events.nativeComponent?.(JSON.parse(event.value ?? "{}"));
        else if (event.event === "submit") result = node.events.submit?.(event.value ?? "");
        else if (event.event === "scroll" || event.event === "scrollEnd") {
          const data = { x: event.x!, y: event.y!, contentWidth: event.contentWidth!, contentHeight: event.contentHeight!, scrollAdjustment: event.scrollAdjustment };
          result = event.event === "scroll" ? node.events.scroll?.(data.y, data) : node.events.scrollEnd?.(data);
        } else if (event.event === "layout") result = node.events.layout?.({ x: event.x!, y: event.y!, width: event.contentWidth!, height: event.contentHeight! });
        else if (event.event === "loadSuccess") result = node.events.loadSuccess?.(event.source ?? "");
        else if (event.event === "loadFailure") result = node.events.loadFailure?.(event.source ?? "", event.errorCode ?? 1);
        else if (event.event === "playStateDidChanged") result = node.events.playStateDidChanged?.(event.state ?? "unknown");
        else if (event.event === "playTimeDidChanged") result = node.events.playTimeDidChanged?.(event.x ?? 0, event.duration ?? 0);
        else if (event.event === "firstFrameDidDisplay") result = node.events.firstFrameDidDisplay?.();
        else if (["touchDown", "touchMove", "touchUp", "touchCancel"].includes(event.event)) {
          result = this.dispatchTouch(surface, node, event);
        } else if (event.event === "spanClick") result = node.events.spanClick?.(Number(event.value ?? 0));
        else if (event.event === "longPress") result = node.events.longPress?.();
        else if (event.event === "focus") result = node.events.focus?.();
        else if (event.event === "blur") result = node.events.blur?.();
      } else {
        if (!node.events.changeText || node.props.editable === false) return;
        surface.inputRevisions.set(event.nodeId, event.inputRevision);
        surface.inputSyncDirty.add(event.nodeId); surface.dirty = true;
        result = node.events.changeText(event.value);
      }
      if (result instanceof Promise) result.catch(error => {
        if (this.surfaces.get(surface.id) === surface) this.emitError(surface, "EVENT_REJECTION", error);
      });
    } catch (error) {
      this.emitError(surface, "EVENT_ERROR", error);
    }
  }

  /** Back handlers are deliberately synchronous: the host must decide whether
   * to continue with native navigation before returning from the system callback. */
  private invokeBackPress(surface: Surface): boolean {
    return withTimerScope(surface.timerScope, () => this.invokeScopedBackPress(surface));
  }
  private invokeScopedBackPress(surface: Surface): boolean {
    if (!surface.backOrder) {
      const order = (id: number): number[] => {
        const result: number[] = [];
        while (id) { result.push(surface.positions.get(id) ?? 0); id = surface.parents.get(id) ?? 0; }
        return result.reverse();
      };
      const paths = new Map<number, number[]>();
      for (const id of surface.backHandlers) paths.set(id, order(id));
      surface.backOrder = [...surface.backHandlers].sort((a, b) => {
        const left = paths.get(a)!, right = paths.get(b)!;
        for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return right[i] - left[i];
        return right.length - left.length;
      });
    }
    for (const id of surface.backOrder) {
      const node = surface.nodes.get(id)!;
      if (!node.events.backPress) continue;
      try {
        if (node.events.backPress()) return true;
      } catch (error) {
        this.emitError(surface, "BACK_PRESS_ERROR", error);
      }
    }
    return false;
  }

  private dispatchTouch(surface: Surface, target: HostNode, event: NativeEvent): void {
    const path: HostNode[] = [];
    let current: HostNode | undefined = target;
    while (current) { path.push(current); current = surface.nodes.get(surface.parents.get(current.id) ?? 0); }
    path.reverse();
    const phase: "touchDown" | "touchMove" | "touchUp" | "touchCancel" = event.event === "touchDown" ? "touchDown" : event.event === "touchMove" ? "touchMove" : event.event === "touchUp" ? "touchUp" : "touchCancel";
    let stopped = false;
    const invoke = (node: HostNode, capture: boolean): void => {
      const callback = phase === "touchDown" ? (capture ? node.events.touchDownCapture : node.events.touchDown)
        : phase === "touchMove" ? (capture ? node.events.touchMoveCapture : node.events.touchMove)
        : phase === "touchUp" ? (capture ? node.events.touchUpCapture : node.events.touchUp)
        : (capture ? node.events.touchCancelCapture : node.events.touchCancel);
      if (!callback) return;
      let result: void | Promise<void>;
      try {
        result = callback({ x: event.x!, y: event.y!, pageX: event.pageX!, pageY: event.pageY!, pointerId: event.pointerId!,
          touches: event.touches!, target: target.id, currentTarget: node.id, eventPhase: node.id === target.id ? "target" : capture ? "capture" : "bubble", stopPropagation: () => { stopped = true; } });
      } catch (error) {
        this.emitError(surface, "EVENT_ERROR", error);
        return;
      }
      if (result instanceof Promise) result.catch(error => {
        if (this.surfaces.get(surface.id) === surface) this.emitError(surface, "EVENT_REJECTION", error);
      });
    };
    for (const node of path.slice(0, -1)) { invoke(node, true); if (stopped) return; }
    // stopPropagation skips other nodes; both target callbacks belong to the same node.
    invoke(target, true);
    invoke(target, false); if (stopped) return;
    for (const node of path.slice(0, -1).reverse()) { invoke(node, false); if (stopped) return; }
  }

  private typeId(component: Component<any>): number {
    let id = this.componentTypes.get(component);
    if (!id) { id = this.nextComponentType++; this.componentTypes.set(component, id); }
    return id;
  }

  private beginRender(surface: Surface): void {
    surface.dirty = false;
    const draft: Draft = { contextOwners: new Set(), commitPayloads: [], staticChildren: new Map(), watermark: surface.nextUpdateId - 1, regions: new Map(), hosts: new Map(), removedRegions: new Set(), removedHosts: new Set(), removedFrames: new Set(), inputTokens: new Map(), measurements: [], finalizing: false,
      revision: surface.nextRevision++, tree: surface.tree, frames: new Map(), measures: new Map(), measureRound: 0, readyForAck: false, corePending: false };
    if (!isU32(draft.revision)) throw new Error("REVISION_OVERFLOW");
    const owners = [...surface.dirtyOwners].sort((a, b) => (surface.frames.get(a)?.depth ?? 0) - (surface.frames.get(b)?.depth ?? 0));
    surface.dirtyOwners.clear();
    try {
      const started = this.profiling ? Date.now() : 0;
      if (surface.recoveryNodes) {
        for (const node of surface.recoveryNodes) draft.hosts.set(node.id, node);
        for (const base of surface.frames.values()) {
          const slots: DraftSlot[] = base.slots.map(slot => {
            if (slot.kind === "state" || slot.kind === "reducer") return { kind: slot.kind, slot, value: slot.value, watermark: 0 };
            if (slot.kind === "memo") return { kind: "memo", slot, value: slot.value, deps: slot.deps };
            if (slot.kind === "effect") return { kind: "effect", slot, setup: slot.setup, deps: slot.deps, changed: true };
            if (slot.kind === "ref") return { kind: "ref", slot };
            return { kind: "services", slot: slot as ServiceSlot };
          });
          draft.frames.set(base.path, { ...base, base, slots });
        }
      } else if (!surface.regions.has("root")) {
        const root: UIElement = { kind: "component", component: surface.page.component, props: {}, key: null };
        draft.tree = this.visit(surface, draft, root, "root", new Map(), 0);
      } else {
      const queue = new Set(owners);
      while (queue.size || draft.contextOwners.size) {
        for (const owner of draft.contextOwners) queue.add(owner);
        draft.contextOwners.clear();
        const owner = [...queue].sort((a, b) => (surface.frames.get(a)?.depth ?? 0) - (surface.frames.get(b)?.depth ?? 0))[0];
        queue.delete(owner);
        if (draft.frames.has(owner) || draft.removedFrames.has(owner)) continue;
        const frame = surface.frames.get(owner);
        const region = frame && (draft.regions.get(frame.regionPath) ?? surface.regions.get(frame.regionPath));
        if (!region || draft.removedRegions.has(region.path)) continue;
        const output = this.visit(surface, draft, region.element, region.path, this.contextFor(surface, draft, region), region.depth);
        if (!this.sameOutput(region.output, output)) this.propagateOutput(surface, draft, region.path);
      }
      }
      for (const id of surface.inputSyncDirty) {
        const node = draft.hosts.get(id) ?? surface.nodes.get(id);
        if (node && !draft.removedHosts.has(id)) {
          const token = surface.inputRevisions.get(id) ?? 0;
          draft.hosts.set(id, { ...node, props: { ...node.props, inputRevision: token } }); draft.inputTokens.set(id, token);
        }
      }
      this.countMetric("evaluateMs", this.profiling ? Date.now() - started : 0);
      this.countMetric("renders");
      surface.pending = draft;
      this.layout(surface, draft);
    } catch (error) {
      surface.pending = null;
      this.discardDraft(surface, draft);
      this.emitError(surface, "RENDER_ERROR", error);
    }
  }

  private visitChildren(surface: Surface, draft: Draft, children: Child, path: string, context: Map<number, unknown>, depth: number): HostNode[] {
    const result: HostNode[] = [];
    const seen = new Set<string>();
    const normalized = normalizeChildren(children);
    for (let i = 0; i < normalized.length; i++) {
      const child = normalized[i];
      if (typeof child === "string" || typeof child === "number") throw new Error("RAW_TEXT_OUTSIDE_TEXT");
      if (typeof child !== "object" || child === null) continue;
      const key = child.key === null ? "i:" + i : "k:" + String(child.key);
      if (seen.has(key)) throw new Error("DUPLICATE_KEY: " + key);
      seen.add(key);
      result.push(...this.visit(surface, draft, child, path + "/" + key, context, depth + 1));
    }
    return result;
  }

  private contextFor(surface: Surface, draft: Draft, region: OutputRegion): Map<number, unknown> {
    const result = new Map<number, unknown>();
    let parent = region.parent;
    while (parent) {
      const ancestor = draft.regions.get(parent) ?? surface.regions.get(parent);
      if (!ancestor) break;
      if (ancestor.element.kind === "provider" && !result.has(ancestor.element.contextId)) result.set(ancestor.element.contextId, ancestor.element.value);
      parent = ancestor.parent;
    }
    return result;
  }
  private providerFor(surface: Surface, draft: Draft, id: number): string {
    let ancestor = this.activeRegion;
    while (ancestor) {
      if (ancestor.element.kind === "provider" && ancestor.element.contextId === id) return ancestor.path + ":" + id;
      ancestor = ancestor.parent ? draft.regions.get(ancestor.parent) ?? surface.regions.get(ancestor.parent) ?? null : null;
    }
    return "default:" + id;
  }
  private unbindContexts(surface: Surface, frame: ComponentFrame): void {
    for (const read of frame.contexts.values()) {
      const consumers = surface.contextConsumers.get(read.provider);
      consumers?.delete(frame.path);
      if (consumers?.size === 0) surface.contextConsumers.delete(read.provider);
    }
  }
  private activeRegion: OutputRegion | null = null;
  private sameOutput(a: HostNode[], b: HostNode[]): boolean { return a.length === b.length && a.every((node, i) => node.id === b[i].id); }
  private retireRegion(surface: Surface, draft: Draft, path: string): void {
    if (draft.removedRegions.has(path)) return;
    const region = draft.regions.get(path) ?? surface.regions.get(path);
    if (!region) return;
    draft.removedRegions.add(path); draft.regions.delete(path);
    for (const child of region.children) this.retireRegion(surface, draft, child);
    if (region.hostId) { draft.removedHosts.add(region.hostId); draft.hosts.delete(region.hostId); }
    if (region.framePath) { draft.removedFrames.add(region.framePath); draft.frames.delete(region.framePath); }
  }
  private propagateOutput(surface: Surface, draft: Draft, path: string): void {
    const region = draft.regions.get(path) ?? surface.regions.get(path)!;
    if (!region.parent) { draft.tree = region.output; return; }
    const old = draft.regions.get(region.parent) ?? surface.regions.get(region.parent)!;
    const output: HostNode[] = [];
    for (const child of old.children) output.push(...(draft.regions.get(child) ?? surface.regions.get(child))!.output);
    if (old.hostId) {
      const host = draft.hosts.get(old.hostId) ?? surface.nodes.get(old.hostId)!;
      if (!this.sameOutput(host.children, output)) draft.hosts.set(host.id, { ...host, children: output });
      return;
    }
    if (this.sameOutput(old.output, output)) return;
    draft.regions.set(old.path, { ...old, output }); this.propagateOutput(surface, draft, old.path);
  }
  private discardDraft(surface: Surface, draft: Draft): void {
    for (const frame of draft.frames.values()) if (!frame.base) for (const hook of frame.slots) {
      if (hook.kind === "state" || hook.kind === "reducer") hook.slot.active = false;
      if (hook.kind === "services") hook.slot.active = false;
    }
    for (const node of draft.hosts.values()) if (!surface.nodes.has(node.id)) surface.nodeIds.delete(node.path);
  }
  private visit(surface: Surface, draft: Draft, element: UIElement, path: string, context: Map<number, unknown>, depth: number): HostNode[] {
    this.countMetric("scopeVisits");
    const old = draft.regions.get(path) ?? surface.regions.get(path);
    const parent = this.activeRegion;
    if (parent) parent.children.push(path);
    const region: OutputRegion = { path, parent: parent?.path ?? old?.parent ?? null, element, context, depth, children: [], output: [] };
    if (draft.staticChildren.has(path) && old) region.children = old.children;
    draft.regions.set(path, region);
    this.activeRegion = region;
    try { region.output = this.visitElement(surface, draft, element, path, context, depth); }
    finally { this.activeRegion = parent; }
    if (element.kind === "component") region.framePath = path + "/component:" + this.typeId(element.component);
    if (element.kind === "host" || element.kind === "template") region.hostId = region.output[0]?.id;
    if (old) {
      const children = new Set(region.children);
      for (const child of old.children) if (!children.has(child)) this.retireRegion(surface, draft, child);
      if (old.framePath && old.framePath !== region.framePath) draft.removedFrames.add(old.framePath);
      if (old.hostId && old.hostId !== region.hostId) draft.removedHosts.add(old.hostId);
    }
    draft.regions.set(path, region);
    return region.output;
  }
  private visitElement(surface: Surface, draft: Draft, element: UIElement, path: string, context: Map<number, unknown>, depth: number): HostNode[] {
    if (element.kind === "template") return this.visitTemplate(surface, draft, element, path, context, depth);
    if (element.kind === "fragment") return this.visitChildren(surface, draft, element.children, path + "/fragment", context, depth);
    if (element.kind === "provider") {
      const previous = surface.regions.get(path)?.element;
      if (previous?.kind === "provider" && !Object.is(previous.value, element.value)) {
        for (const owner of surface.contextConsumers.get(path + ":" + element.contextId) ?? []) draft.contextOwners.add(owner);
      }
      const next = new Map(context);
      next.set(element.contextId, element.value);
      return this.visitChildren(surface, draft, element.children, path + "/provider", next, depth);
    }
    if (element.kind === "component") {
      const framePath = path + "/component:" + this.typeId(element.component);
      const base = surface.frames.get(framePath) ?? null;
      const props = element.props;
      const hasPendingState = base?.slots.some(slot => (slot.kind === "state" || slot.kind === "reducer") && slot.pending.length > 0) ?? false;
      const contextsUnchanged = base && [...base.contexts].every(([id, read]) => Object.is(context.has(id) ? context.get(id) : read.context.defaultValue, read.value));
      if (base && base.component === element.component && sameProps(base.props, props) && contextsUnchanged && !hasPendingState) {
        const region = surface.regions.get(path)!;
        this.activeRegion!.children = region.children; return region.output;
      }
      const frame: DraftFrame = { regionPath: path, path: framePath, component: element.component, base, props, rendered: null, contexts: new Map(), slots: [], depth };
      draft.frames.set(framePath, frame);
      let cursor = 0;
      const next = (): number => cursor++;
      const dispatcher: HookDispatcher = {
        state: (initial: unknown): [unknown, (value: unknown) => void] => {
          const slotIndex = next();
          const old = base?.slots[slotIndex];
          if (old && old.kind !== "state") throw new Error("HOOK_ORDER_CHANGED");
          const slot = old as StateSlot | undefined ?? this.newStateSlot(surface, framePath, "state", typeof initial === "function" ? (initial as () => unknown)() : initial);
          const watermark = draft.watermark;
          let value = slot.value;
          for (const update of slot.pending) if (update.id <= watermark) value = typeof update.value === "function" ? (update.value as (v: unknown) => unknown)(value) : update.value;
          frame.slots.push({ kind: "state", slot, value, watermark });
          return [value, slot.dispatch];
        },
        reducer: <S, A>(reducer: (state: S, action: A) => S, initial: S): [S, (action: A) => void] => {
          const slotIndex = next();
          const old = base?.slots[slotIndex];
          if (old && old.kind !== "reducer") throw new Error("HOOK_ORDER_CHANGED");
          const slot = old as StateSlot | undefined ?? this.newStateSlot(surface, framePath, "reducer", initial);
          const watermark = draft.watermark;
          let value = slot.value as S;
          for (const update of slot.pending) if (update.id <= watermark) value = reducer(value, update.value as A);
          frame.slots.push({ kind: "reducer", slot, value, watermark });

          return [value, slot.dispatch as (action: A) => void];
        },
        ref: <T>(initial: T): Ref<T> => {
          const slotIndex = next(); const old = base?.slots[slotIndex];
          if (old && old.kind !== "ref") throw new Error("HOOK_ORDER_CHANGED");
          const slot: RefSlot = old as RefSlot | undefined ?? { kind: "ref", ref: new RefCell(initial) };
          frame.slots.push({ kind: "ref", slot }); return slot.ref as Ref<T>;
        },
        effect: (setup: EffectSetup, deps?: readonly unknown[]): void => {
          const slotIndex = next(); const old = base?.slots[slotIndex];
          if (old && old.kind !== "effect") throw new Error("HOOK_ORDER_CHANGED");
          const slot: EffectSlot = old as EffectSlot | undefined ?? { kind: "effect", setup, deps: undefined };
          frame.slots.push({ kind: "effect", slot, setup, deps, changed: !old || !sameDeps(slot.deps, deps) });
        },
        memo: <T>(factory: () => T, deps: readonly unknown[]): T => {
          const slotIndex = next(); const old = base?.slots[slotIndex];
          if (old && old.kind !== "memo") throw new Error("HOOK_ORDER_CHANGED");
          const slot = old as MemoSlot | undefined ?? { kind: "memo", value: undefined, deps: [] };
          const value = old && sameDeps(slot.deps, deps) ? slot.value as T : factory();
          frame.slots.push({ kind: "memo", slot, value, deps }); return value;
        },
        context: <T>(requested: Context<T>): T => {
          const value = context.has(requested.id) ? context.get(requested.id) as T : requested.defaultValue;
          frame.contexts.set(requested.id, { context: requested as Context<any>, value, provider: this.providerFor(surface, draft, requested.id) });
          return value;
        },
        services: (): Services => {
          const slotIndex = next(); const old = base?.slots[slotIndex];
          if (old && old.kind !== "services") throw new Error("HOOK_ORDER_CHANGED");
          const slot = old as ServiceSlot | undefined ?? this.newServiceSlot(surface);
          frame.slots.push({ kind: "services", slot }); return slot.facade;
        },
      };
      let rendered: UIElement | null;
      this.countMetric("logicalEvaluations");
      setHookDispatcher(dispatcher);
      this.rendering = true;
      try { rendered = withTimerScope(surface.timerScope, () => element.component(element.props)); }
      finally { this.rendering = false; setHookDispatcher(null); }
      if (base && base.slots.length !== cursor) throw new Error("HOOK_COUNT_CHANGED");
      frame.rendered = rendered;
      draft.frames.set(framePath, frame);
      return rendered ? this.visit(surface, draft, rendered, framePath, context, depth + 1) : [];
    }
    const hostPath = path + "/host:" + element.tag + (element.tag === "Native" ? ":" + String((element.props as Record<string, unknown>).name) : "");
    let id = surface.nodeIds.get(hostPath);
    if (!id) {
      id = surface.nextNodeId++;
      if (!isU32(id)) throw new Error("NODE_ID_OVERFLOW");
      surface.nodeIds.set(hostPath, id);
    }
    const props = element.props as Record<string, unknown>;
    const style = (props.style ?? {}) as Style;
    const outputProps: RenderProps = {};
    if (element.tag === "Native") {
      if (typeof props.name !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(props.name)) throw new Error("INVALID_NATIVE_NAME");
      outputProps.nativeProps = JSON.stringify(props.nativeProps ?? {});
      if (outputProps.nativeProps.length > 65536) throw new Error("NATIVE_PROPS_TOO_LARGE");
    }
    if (element.tag === "Text") outputProps.text = normalizeChildren(element.children).map(child => {
      if (typeof child !== "string" && typeof child !== "number") throw new Error("TEXT_CHILD_NOT_SCALAR");
      return String(child);
    }).join("");
    if (element.tag === "RichText") {
      const allSpansClickable = typeof props.onSpanClick === "function";
      outputProps.spans = JSON.stringify(((props.spans ?? []) as import("@anseronui/ui").RichTextSpan[]).map(span => ({
        text: span.text, color: span.color, dmColor: span.dmColor, fontSize: span.fontSize, fontWeight: span.fontWeight,
        fontStyle: span.fontStyle, textDecorationLine: span.textDecorationLine,
        clickable: allSpansClickable || typeof span.onClick === "function",
      })));
    }
    if (typeof props.touchAction === "string") outputProps.touchAction = props.touchAction;
    if (element.tag === "TextInput") {
      outputProps.value = String(props.value ?? "");
      outputProps.inputRevision = surface.inputRevisions.get(id) ?? 0;
      outputProps.placeholder = String(props.placeholder ?? "");
    }
    if (element.tag === "Image" || element.tag === "Video") {
      outputProps.src = String(props.src ?? "");
      if (typeof props.resizeMode === "string") outputProps.resizeMode = props.resizeMode;
      if (element.tag === "Image" && typeof props.dmSrc === "string") outputProps.dmSrc = props.dmSrc;
      if (element.tag === "Image" && typeof props.placeholderSrc === "string") outputProps.placeholderSrc = props.placeholderSrc;
      if (element.tag === "Video") {
        for (const key of ["controls", "autoplay", "loop", "muted", "rate"] as const) {
          const value = props[key];
          if (typeof value === "boolean" || typeof value === "number") outputProps[key] = value;
        }
        if (typeof props.playControl === "string") outputProps.playControl = props.playControl;
      }
    }
    if (props.animation !== undefined) { validateAnimationOptions(props.animation); outputProps.animation = JSON.stringify(props.animation); }
    if (typeof props.disabled === "boolean") outputProps.disabled = props.disabled;
    for (const key of ["translateX", "translateY", "scaleX", "scaleY", "rotate", "backgroundColor", "backgroundBlurRadius", "color", "dmBackgroundColor", "dmColor", "dmBorderColor", "shadowColor", "dmShadowColor", "shadowOpacity", "shadowRadius", "shadowOffsetX", "shadowOffsetY", "placeholderTextColor", "dmPlaceholderTextColor", "opacity", "fontSize", "lineHeight", "borderWidth", "borderColor", "borderRadius", "overflow", "visibility", "fontWeight", "fontStyle", "textAlign", "textDecorationLine", "glassEffect", "glassEffectStyle", "glassEffectTintColor", "glassEffectInteractive", "glassEffectContainer", "glassEffectSpacing"] as const) {
      const value = style[key];
      if (value !== undefined) outputProps[key] = value;
    }
    for (const key of ["testID", "accessibilityLabel", "accessibilityRole", "accessibilityHint", "accessibilityValue", "accessible", "accessibilityHidden", "accessibilityChecked", "accessibilitySelected", "numberOfLines", "ellipsizeMode", "editable", "secureTextEntry", "maxLength", "keyboardType", "returnKeyType", "autoCapitalize", "autoCorrect", "placeholderTextColor", "dmPlaceholderTextColor", "scrollEnabled", "showsVerticalScrollIndicator", "scrollAnchorOffset"]) {
      const value = props[key];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") outputProps[key] = value;
    }
    const accessibilityInfo = props.accessibilityInfo as import("@anseronui/ui").AccessibilityInfo | undefined;
    if (accessibilityInfo !== undefined) {
      if (typeof accessibilityInfo.clickable !== "boolean" || typeof accessibilityInfo.longClickable !== "boolean") throw new Error("INVALID_ACCESSIBILITY_INFO");
      outputProps.accessibilityClickable = accessibilityInfo.clickable;
      outputProps.accessibilityLongClickable = accessibilityInfo.longClickable;
    }
    const events: EventCallbacks = {};
    if (typeof props.onClick === "function") events.tap = props.onClick as EventCallbacks["tap"];
    if (typeof props.onChangeText === "function") events.changeText = props.onChangeText as EventCallbacks["changeText"];
    if (typeof props.onLongPress === "function") events.longPress = props.onLongPress as EventCallbacks["longPress"];
    if (typeof props.onBackPress === "function") events.backPress = props.onBackPress as EventCallbacks["backPress"];
    if (typeof props.onTouchDown === "function") events.touchDown = props.onTouchDown as EventCallbacks["touchDown"];
    if (typeof props.onTouchMove === "function") events.touchMove = props.onTouchMove as EventCallbacks["touchMove"];
    if (typeof props.onTouchUp === "function") events.touchUp = props.onTouchUp as EventCallbacks["touchUp"];
    if (typeof props.onTouchCancel === "function") events.touchCancel = props.onTouchCancel as EventCallbacks["touchCancel"];
    if (typeof props.onTouchDownCapture === "function") events.touchDownCapture = props.onTouchDownCapture as EventCallbacks["touchDownCapture"];
    if (typeof props.onTouchMoveCapture === "function") events.touchMoveCapture = props.onTouchMoveCapture as EventCallbacks["touchMoveCapture"];
    if (typeof props.onTouchUpCapture === "function") events.touchUpCapture = props.onTouchUpCapture as EventCallbacks["touchUpCapture"];
    if (typeof props.onTouchCancelCapture === "function") events.touchCancelCapture = props.onTouchCancelCapture as EventCallbacks["touchCancelCapture"];
    if (typeof props.onSpanClick === "function" || (element.tag === "RichText" && (props.spans as { onClick?: unknown }[] | undefined)?.some(span => typeof span.onClick === "function"))) {
      events.spanClick = (index: number): void => {
        const spanClick = (props.spans as { onClick?: () => void }[] | undefined)?.[index]?.onClick;
        if (spanClick) spanClick(); else (props.onSpanClick as ((index: number) => void) | undefined)?.(index);
      };
    }
    if (typeof props.onFocus === "function") events.focus = props.onFocus as EventCallbacks["focus"];
    if (typeof props.onBlur === "function") events.blur = props.onBlur as EventCallbacks["blur"];
    if (typeof props.onSubmitEditing === "function") events.submit = props.onSubmitEditing as EventCallbacks["submit"];
    if (typeof props.onScroll === "function") events.scroll = props.onScroll as EventCallbacks["scroll"];
    if (typeof props.onScrollEnd === "function") events.scrollEnd = props.onScrollEnd as EventCallbacks["scrollEnd"];
    if (typeof props.onLayout === "function") events.layout = props.onLayout as EventCallbacks["layout"];
    if (typeof props.onLoad === "function") events.loadSuccess = props.onLoad as EventCallbacks["loadSuccess"];
    if (typeof props.onError === "function") events.loadFailure = props.onError as EventCallbacks["loadFailure"];
    if (typeof props.onPlaybackStateChange === "function") events.playStateDidChanged = props.onPlaybackStateChange as EventCallbacks["playStateDidChanged"];
    if (typeof props.onTimeUpdate === "function") events.playTimeDidChanged = props.onTimeUpdate as EventCallbacks["playTimeDidChanged"];
    if (typeof props.onFirstFrame === "function") events.firstFrameDidDisplay = props.onFirstFrame as EventCallbacks["firstFrameDidDisplay"];
    if (typeof props.onNativeEvent === "function") events.nativeComponent = props.onNativeEvent as EventCallbacks["nativeComponent"];
    const children = element.tag === "Text" || element.tag === "RichText" || element.tag === "TextInput" || element.tag === "Image" || element.tag === "Video"
      ? [] : draft.staticChildren.get(path) ?? this.visitChildren(surface, draft, element.children, hostPath, context, depth + 1);
    const base = surface.nodes.get(id);
    const node: HostNode = { id, path: hostPath, kind: element.tag, props: outputProps, style, children, frame: base?.frame ?? { x: 0, y: 0, width: 0, height: 0 }, events, nativeName: element.tag === "Native" ? String(props.name) : undefined, ref: props.ref as HostNode["ref"] };
    draft.hosts.set(id, node); this.countMetric("reconciledNodes");
    return [base ?? node];
  }

  private visitTemplate(surface: Surface, draft: Draft, element: TemplateElement, path: string, context: Map<number, unknown>, depth: number): HostNode[] {
    const oldRegion = surface.regions.get(path), old = oldRegion?.template;
    const plan = element.plan, values = element.values;
    if (old && old.plan === plan) {
      this.activeRegion!.children = oldRegion!.children;
      let root = old.root;
      const changed = new Set<number>();
      for (const field of plan.fields) { this.countMetric("dynamicSlotsChecked"); if (!Object.is(old.values[field.input], values[field.input])) changed.add(field.node); }
      const owner = this.activeRegion;
      for (const index of changed) {
        const target = old.paths[index], region = surface.regions.get(target)!;
        const base = index === 0 ? old.root : region.element as import("@anseronui/ui").HostElement;
        const node = templateNode(plan, index, values, base.children);
        const host = draft.hosts.get(region.hostId!) ?? surface.nodes.get(region.hostId!)!;
        const structural = plan.nodes[index].tag !== "Text" && plan.fields.some(field => field.node === index && field.field === "children");
        if (!structural) draft.staticChildren.set(target, host.children);
        else if (index === 0) this.activeRegion!.children = [];
        if (index === 0) { root = node; this.visitElement(surface, draft, node, target, context, depth); }
        else {
          this.activeRegion = null;
          try { this.visit(surface, draft, node, target, region.context, region.depth); }
          finally { this.activeRegion = owner; }
        }
        draft.staticChildren.delete(target);
      }
      this.activeRegion!.template = { plan, values, paths: old.paths, root };
      this.countMetric("computeRegionsReused", plan.nodes.length - changed.size);
      return oldRegion!.output;
    }
    const paths: string[] = [];
    const materialize = (index: number, target: string): import("@anseronui/ui").HostElement => {
      const descriptor = plan.nodes[index]; paths[index] = target;
      const children = descriptor.children.map((child, position) => materialize(child, target + "/host:" + descriptor.tag + "/" + (plan.nodes[child].key === null ? "i:" + position : "k:" + String(plan.nodes[child].key))));
      return templateNode(plan, index, values, children);
    };
    const root = materialize(0, path);
    this.activeRegion!.template = { plan, values, paths, root };
    return this.visitElement(surface, draft, root, path, context, depth);
  }

  private newStateSlot(surface: Surface, owner: string, kind: "state" | "reducer", value: unknown): StateSlot {
    const slot: StateSlot = { owner, kind, value, pending: [], active: true, dispatch: () => {} };
    slot.dispatch = (next: unknown) => {
      if (!slot.active || this.disposed) return;
      if (this.rendering) throw new Error("STATE_UPDATE_DURING_RENDER");
      const id = surface.nextUpdateId++;
      if (!isU32(id)) throw new Error("UPDATE_ID_OVERFLOW");
      slot.pending.push({ id, value: next });
      surface.dirtyOwners.add(slot.owner); surface.dirty = true;
      this.onWake?.();
    };
    return slot;
  }
  private validateRouteValue(value: unknown, seen: Set<unknown>): void {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (typeof value !== "object" || seen.has(value)) throw new Error("INVALID_ROUTE_PARAMS");
    seen.add(value);
    if (Array.isArray(value)) { for (const item of value) this.validateRouteValue(item, seen); }
    else { for (const [, item] of Object.entries(value)) this.validateRouteValue(item, seen); }
    seen.delete(value);
  }
  private newServiceSlot(surface: Surface): ServiceSlot {
    const route = async (method: "push" | "replace", page: string, params?: import("@anseronui/ui").RouteParams): Promise<void> => {
      if (!/^[a-z][a-z0-9_-]*$/.test(page)) throw new Error("INVALID_ROUTE");
      if (params !== undefined && (params === null || typeof params !== "object" || Array.isArray(params))) throw new Error("INVALID_ROUTE_PARAMS");
      if (params !== undefined) this.validateRouteValue(params, new Set());
      const argument = JSON.stringify(params === undefined ? { page } : { page, params });
      if (argument.length > 12000) throw new Error("ROUTE_PARAMS_TOO_LARGE");
      await this.invokeModule(surface, slot, "router", method, argument);
    };
    const pop = async (): Promise<void> => { await this.invokeModule(surface, slot, "router", "pop", "{}"); };
    // Keep captured implementations non-generic: scriptc lowers generic local
    // functions to module functions, which cannot retain this service scope.
    // The public Services facade supplies the generic JSON result types.
    const invokeJSON = async (module: string, method: string, args?: unknown): Promise<any> => {
      try { return JSON.parse(await this.invokeModule(surface, slot, module, method, JSON.stringify(args ?? null))); }
      catch (error) { throw new NativeServiceError(String(error)); }
    };
    const subscribe = (module: string, listener: (value: any) => void, onError?: (error: Error) => void) => {
      if (this.rendering) throw new Error("SERVICE_DURING_RENDER");
      if (!slot.active) throw new Error("SURFACE_DISPOSED");
      const id = String(surface.nextRequestId++);
      let active = true;
      let pending = 0;
      const stop = () => {
        if (!active) return;
        active = false; slot.subscriptions.delete(stop);
        const request = surface.modules.get(pending);
        if (request) { surface.modules.delete(pending); this.emit(surface, { type: "CancelRequest", requestId: pending }); request.reject(new Error("CANCELLED")); }
        // Closing also covers the gap between successive next calls.
        if (slot.active) void invokeJSON("events", "close", { id }).catch(() => {});
      };
      slot.subscriptions.add(stop);
      const next = async (): Promise<void> => {
        try {
          while (active && slot.active) {
            pending = surface.nextRequestId;
            const value = await invokeJSON("events", "next", { id, module });
            if (active && slot.active) listener(value);
          }
        } catch (error) { if (active && slot.active) { stop(); onError?.(error instanceof Error ? error : new Error(String(error))); } }
      };
      void next();
      return stop;
    };
    const slot: ServiceSlot = { kind: "services", active: true, subscriptions: new Set(), pageListeners: new Set(), facade: {
      ...createNativeServices(invokeJSON, subscribe), subscribe,
      measureText: options => this.measureText(surface, slot, options),
      page: {
        isVisible: () => surface.visible,
        subscribe: listener => {
          if (this.rendering) throw new Error("SERVICE_DURING_RENDER");
          if (!slot.active) throw new Error("SURFACE_DISPOSED");
          slot.pageListeners.add(listener);
          return () => { slot.pageListeners.delete(listener); };
        },
      },
      timers: { setTimeout: (callback, delay = 0) => timeoutInScope(surface.timerScope, callback, delay), clearTimeout },
      invoke: async <T>(module: string, method: string, args?: unknown): Promise<T> => {
        if (module === "events" || module === "__view" || module === "http" || module === "timer" || module === "router") throw new Error("RESERVED_MODULE");
        return JSON.parse(await this.invokeModule(surface, slot, module, method, JSON.stringify(args ?? null))) as T;
      },
      router: {
        push: (page: string, params) => route("push", page, params),
        replace: (page: string, params) => route("replace", page, params),
        pop,
        back: pop,
        getParams: () => invokeJSON("router", "getParams"),
        current: async () => JSON.parse(await this.invokeModule(surface, slot, "router", "current", "{}")) as string,
      },
      http: { getText: (url: string) => this.invokeModule(surface, slot, "http", "getText", url), request: options => invokeJSON("http", "request", options) },
      sleep: async (milliseconds: number) => {
        if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error("Invalid sleep duration");
        await this.invokeModule(surface, slot, "timer", "sleep", String(milliseconds));
      },
    } };
    return slot;
  }
  private async measureText(surface: Surface, owner: ServiceSlot, options: MeasureTextOptions): Promise<TextSize> {
    if (this.rendering) throw new Error("SERVICE_DURING_RENDER");
    if (!owner.active || this.disposed || this.surfaces.get(surface.id) !== surface) throw new Error("SURFACE_DISPOSED");
    const query = prepareTextMeasurement(options);
    if (query.text.length === 0 || query.maxWidth === 0 || query.maxHeight === 0) return { width: 0, height: 0 };
    const requestId = surface.nextRequestId++, nodeId = surface.nextNodeId++;
    if (!isU32(requestId) || !isU32(nodeId)) throw new Error("REQUEST_ID_OVERFLOW");
    // Reserve an identity without creating a render node. All hosts measure
    // detached text already; the identity only correlates the response.
    const promise = new Promise<string>((resolve, reject) => {
      surface.modules.set(requestId, { owner, resolve, reject, measureNodeId: nodeId });
    });
    this.emit(surface, { type: "MeasureRequest", requestId, nodeId, kind: "Text",
      text: query.text, fontSize: query.fontSize, maxWidth: query.maxWidth,
      props: { ...query.props, text: query.text, fontSize: query.fontSize } });
    const size = JSON.parse(await promise) as TextSize;
    return { width: Math.min(query.maxWidth, size.width), height: Math.min(query.maxHeight ?? size.height, size.height) };
  }
  private invokeModule(surface: Surface, owner: ServiceSlot, module: string, method: string, argument: string): Promise<string> {
    if (this.rendering) throw new Error("SERVICE_DURING_RENDER");
    if (!owner.active || this.disposed || this.surfaces.get(surface.id) !== surface) return Promise.reject(new Error("SURFACE_DISPOSED"));
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(module) || !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(method)) return Promise.reject(new Error("INVALID_MODULE_METHOD"));
    if (argument.length > 65536) return Promise.reject(new Error("MODULE_ARGUMENT_TOO_LARGE"));
    const requestId = surface.nextRequestId++;
    if (!isU32(requestId)) return Promise.reject(new Error("REQUEST_ID_OVERFLOW"));
    const promise = new Promise<string>((resolve, reject) => {
      surface.modules.set(requestId, { owner, resolve, reject });
    });
    void promise.catch(() => {});
    this.emit(surface, { type: "InvokeModule", requestId, module, method, argument });
    return promise;
  }
  private rendering = false;

  private sendCore(request: CoreRequest): void {
    if (this.profiling) this.countMetric("coreRequestUnits", JSON.stringify(request).length);
    const surface = this.surfaces.get(request.surfaceId);
    if (surface?.pending) surface.pending.lastRequest = request;
    if (this.renderCore) {
      let result: CoreResult;
      try { result = this.renderCore(request); }
      catch (error) {
        if (surface?.pending) this.failCore(surface, String(error)); else throw error;
        return;
      }
      this.acceptCoreResult(result);
    } else this.coreRequests.push(request);
  }
  private layout(surface: Surface, draft: Draft): void {
    draft.corePending = true;
    if (this.profiling) draft.coreStarted = Date.now();
    if (draft.measureRound > 0) {
      this.sendCore({ type: "ContinueRender", abi: CORE_ABI_VERSION, surfaceId: surface.id, generation: surface.generation,
        transactionId: draft.revision, round: draft.measureRound, measurements: draft.measurements });
      draft.measurements = []; return;
    }
    const mutations: NodeMutation[] = [];
    for (const id of draft.removedHosts) mutations.push({ type: "Delete", nodeId: id });
    for (const node of draft.hosts.values()) {
      const base = surface.nodes.get(node.id), events = EVENT_NAMES.filter(event => this.hasEvent(node, event));
      if (!base) mutations.push({ type: "Create", nodeId: node.id, kind: node.kind, nativeName: node.nativeName, props: node.props, style: node.style, events });
      else {
        const props = propPatch(base.props, node.props), styles = propPatch(base.style as RenderProps, node.style as RenderProps);
        const oldEvents = EVENT_NAMES.filter(event => this.hasEvent(base, event));
        const eventsChanged = !sameDeps(events, oldEvents);
        if (Object.keys(props.set).length || props.unset.length || Object.keys(styles.set).length || styles.unset.length || eventsChanged) mutations.push({ type: "Patch", nodeId: node.id,
          propsSet: props.set, propsUnset: props.unset, styleSet: styles.set as Style, styleUnset: styles.unset, ...(eventsChanged ? { events } : {}) });
      }
      if ((!base && node.children.length) || (base && !this.sameOutput(base.children, node.children))) mutations.push({ type: "Children", parentId: node.id, children: node.children.map(child => child.id) });
    }
    if (surface.recoveryNodes || !this.sameOutput(surface.tree, draft.tree)) mutations.push({ type: "Children", parentId: 0, children: draft.tree.map(node => node.id) });
    const request: BeginRenderRequest = { type: "BeginRender", abi: CORE_ABI_VERSION, surfaceId: surface.id, generation: surface.generation,
      transactionId: draft.revision, baseRevision: surface.revision, targetRevision: draft.revision, width: surface.width, height: surface.height,
      environmentVersion: surface.environmentVersion, nextRequestId: surface.nextRequestId, mutations, profile: this.profiling };
    this.sendCore(request);
  }
  acceptCoreResult(result: CoreResult): void {
    if (result.abi !== CORE_ABI_VERSION) throw new Error("CORE_ABI_MISMATCH");
    if (result.type === "SurfaceReleased" || result.type === "Aborted") return;
    if (result.type === "SurfaceReset") {
      const surface = this.surfaces.get(result.surfaceId);
      if (surface?.generation === result.generation && surface.recovering && surface.resetToken === result.resetToken) { this.progress(surface); surface.coreResetAck = true; this.resumeRecovery(surface); }
      return;
    }
    if (result.type === "RenderResult") throw new Error("UNEXPECTED_LEGACY_CORE_RESULT");
    const surface = this.surfaces.get(result.surfaceId), draft = surface?.pending;
    if (!surface || surface.generation !== result.generation || !draft || draft.revision !== result.transactionId) return;
    if (result.type === "CoreFailure") { this.failCore(surface, result.code); return; }
    this.progress(surface);
    if (result.type === "Finalized") { if (draft.finalizing) this.publish(surface, result.revision); return; }
    if (result.type !== "Prepared" || !draft.corePending) return;
    draft.corePending = false; draft.measureRound = result.round;
    if (draft.coreStarted !== undefined) this.countMetric("coreRoundTripMs", Date.now() - draft.coreStarted);
    this.countMetric("measureRequests", result.measures.length);
    for (const [name, value] of Object.entries(result.stats)) this.countMetric(name, value);
    surface.nextRequestId = Math.max(surface.nextRequestId, result.nextRequestId);
    for (const item of result.frames) {
      const node = draft.hosts.get(item.nodeId) ?? surface.nodes.get(item.nodeId);
      if (!node) throw new Error("CORE_UNKNOWN_FRAME");
      if (!surface.nodes.has(item.nodeId)) { node.frame = item.frame; draft.hosts.set(item.nodeId, node); }
      else draft.hosts.set(item.nodeId, { ...node, frame: item.frame });
    }
    for (const query of result.measures) {
      draft.measures.set(query.requestId, query);
      this.emit(surface, { type: "MeasureRequest", requestId: query.requestId, nodeId: query.nodeId, kind: query.kind, text: query.text, fontSize: query.fontSize, maxWidth: query.maxWidth, props: query.props });
    }
    if (result.ready) {
      if (this.supersedeStaleScrollWindow(surface, draft)) return;
      draft.readyForAck = true;
      if (this.profiling) draft.commitStarted = Date.now();
      this.countMetric("commands", result.commands.length);
      draft.commitPayloads = splitCommit(draft.revision, surface.revision, result.commands);
      for (const payload of draft.commitPayloads) this.emit(surface, payload);
    }
  }
  private supersedeStaleScrollWindow(surface: Surface, draft: Draft): boolean {
    // Native motion can reverse while text measurements are in flight. Never
    // publish a virtual window that has already left the reported viewport;
    // it would remove visible rows before the next window can be measured.
    const events: NativeEvent[] = [];
    let barrier = false;
    for (const event of surface.deferredEvents) {
      if (event.type !== "NativeEvent" || event.event !== "scroll") { barrier = true; break; }
      events.push(event);
    }
    // Include posted motion that the bounded input step has not consumed yet.
    // A superseded draft is rebuilt only after that input queue is drained.
    for (const input of this.incoming) {
      if (barrier) break;
      if (input.surfaceId !== surface.id || input.surfaceGeneration !== surface.generation) continue;
      const event = input.payload;
      if (event.type !== "NativeEvent" || event.event !== "scroll") break;
      events.push(event);
    }
    const checked = new Set<number>();
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (checked.has(event.nodeId)) continue;
      checked.add(event.nodeId);
      if (draft.removedHosts.has(event.nodeId)) continue;
      const old = surface.nodes.get(event.nodeId);
      const scroll = draft.hosts.get(event.nodeId) ?? old;
      if (!old || !scroll || scroll.kind !== "ScrollView" || typeof scroll.props.scrollAnchorOffset !== "number") continue;
      const child = scroll.children[0];
      const document = child && (draft.hosts.get(child.id) ?? child);
      if (!document || document.children.length === 0) continue;
      let top = Infinity, bottom = -Infinity;
      for (const child of document.children) {
        const row = draft.hosts.get(child.id) ?? child;
        if (row.style.position !== "absolute") continue;
        top = Math.min(top, row.frame.y); bottom = Math.max(bottom, row.frame.y + row.frame.height);
      }
      if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
      const offset = Math.max(0, Math.min(document.frame.height - scroll.frame.height,
        event.y! + scroll.props.scrollAnchorOffset - Number(old.props.scrollAnchorOffset ?? 0)));
      if (offset >= top - 1 && Math.min(document.frame.height, offset + scroll.frame.height) <= bottom + 1) continue;
      this.abandonScrollWindow(surface, draft);
      return true;
    }
    return false;
  }
  private abandonScrollWindow(surface: Surface, draft: Draft): void {
    for (const frame of draft.frames.values()) if (frame.base) surface.dirtyOwners.add(frame.path);
    this.discardDraft(surface, draft); surface.pending = null; surface.dirty = true;
    this.countMetric("aborts");
    this.sendCore({ type: "AbortRender", abi: CORE_ABI_VERSION, surfaceId: surface.id, generation: surface.generation, transactionId: draft.revision });
  }
  private acceptMeasure(surface: Surface, result: Extract<InputPayload, { type: "MeasureResult" }>): void {
    const request = surface.modules.get(result.requestId);
    if (request?.measureNodeId === result.nodeId && request.owner.active) {
      surface.modules.delete(result.requestId);
      if (!finiteDimension(result.width) || !finiteDimension(result.height)) request.reject(new Error("INVALID_TEXT_MEASUREMENT_RESULT"));
      else request.resolve(JSON.stringify({ width: result.width, height: result.height }));
      return;
    }
    const draft = surface.pending, query = draft?.measures.get(result.requestId);
    if (!draft || !query || query.nodeId !== result.nodeId || !finiteDimension(result.width) || !finiteDimension(result.height)) return;
    this.progress(surface);
    draft.measurements.push({ ...result, key: query.key }); draft.measures.delete(result.requestId);
    if (draft.measures.size === 0) this.layout(surface, draft);
  }

  private flatten(tree: HostNode[]): HostNode[] {
    const result: HostNode[] = [];
    const append = (node: HostNode): void => { result.push(node); node.children.forEach(append); };
    tree.forEach(append); return result;
  }

  private hasEvent(node: HostNode, event: EventKind): boolean {
    if (node.events[event]) return true;
    return event === "touchDown" ? Boolean(node.events.touchDownCapture)
      : event === "touchMove" ? Boolean(node.events.touchMoveCapture)
      : event === "touchUp" ? Boolean(node.events.touchUpCapture)
      : event === "touchCancel" ? Boolean(node.events.touchCancelCapture) : false;
  }

  private ack(surface: Surface, revision: number): void {
    const draft = surface.pending;
    if (!draft || !draft.readyForAck || draft.finalizing || revision !== draft.revision) return;
    this.progress(surface);
    draft.finalizing = true;
    this.sendCore({ type: "FinalizeRender", abi: CORE_ABI_VERSION, surfaceId: surface.id, generation: surface.generation, transactionId: revision });
  }
  private publish(surface: Surface, revision: number): void {
    const draft = surface.pending!;
    const removed: ComponentFrame[] = [];
    for (const path of draft.removedFrames) { const frame = surface.frames.get(path); if (frame) removed.push(frame); }
    removed.sort((a, b) => b.depth - a.depth);
    const changed = [...draft.frames.values()].sort((a, b) => b.depth - a.depth);
    for (const frame of removed) this.cleanupFrame(surface, frame);
    for (const frame of changed) {
      for (const hook of frame.slots) if (hook.kind === "effect" && hook.changed && hook.slot.cleanup) {
        this.runCleanup(surface, hook.slot.cleanup); hook.slot.cleanup = undefined;
      }
    }
    const committed = surface.frames;
    for (const frame of removed) { this.unbindContexts(surface, frame); committed.delete(frame.path); }
    for (const frame of draft.frames.values()) {
      if (frame.base) this.unbindContexts(surface, frame.base);
      for (const read of frame.contexts.values()) {
        let consumers = surface.contextConsumers.get(read.provider);
        if (!consumers) { consumers = new Set(); surface.contextConsumers.set(read.provider, consumers); }
        consumers.add(frame.path);
      }
      if (frame.reused) {
        committed.set(frame.path, frame.reused);
        continue;
      }
      const slots: Slot[] = [];
      for (const hook of frame.slots) {
        if (hook.kind === "state" || hook.kind === "reducer") {
          hook.slot.value = hook.value;
          hook.slot.pending = hook.slot.pending.filter(update => update.id > hook.watermark);
          slots.push(hook.slot);
        } else if (hook.kind === "memo") {
          hook.slot.value = hook.value; hook.slot.deps = hook.deps; slots.push(hook.slot);
        } else if (hook.kind === "effect") {
          if (hook.changed) { hook.slot.setup = hook.setup; hook.slot.deps = hook.deps; }
          slots.push(hook.slot);
        } else slots.push(hook.slot);
      }
      committed.set(frame.path, {
        regionPath: frame.regionPath, path: frame.path, component: frame.component, props: frame.props,
        rendered: frame.rendered, contexts: frame.contexts, slots, depth: frame.depth,
      });
    }
    surface.frames = committed;
    const oldNodes = new Map<number, HostNode>();
    for (const id of draft.removedHosts) { const old = surface.nodes.get(id); if (old) oldNodes.set(id, { ...old }); }
    for (const id of draft.hosts.keys()) { const old = surface.nodes.get(id); if (old) oldNodes.set(id, { ...old }); }
    for (const path of draft.removedRegions) surface.regions.delete(path);
    for (const [path, region] of draft.regions) surface.regions.set(path, region);
    for (const id of draft.removedHosts) {
      const old = surface.nodes.get(id); if (old) surface.nodeIds.delete(old.path);
      surface.nodes.delete(id); surface.parents.delete(id); surface.positions.delete(id);
      if (surface.backHandlers.delete(id)) surface.backOrder = null; surface.inputRevisions.delete(id); surface.inputSyncDirty.delete(id);
    }
    for (const [id, node] of draft.hosts) {
      const old = surface.nodes.get(id);
      if (old) Object.assign(old, node); else surface.nodes.set(id, node);
      if (node.events.backPress) { if (!surface.backHandlers.has(id)) { surface.backHandlers.add(id); surface.backOrder = null; } }
      else if (surface.backHandlers.delete(id)) surface.backOrder = null;
      // Topology changes own the list traversal; ordinary field updates skip it.
      if (!oldNodes.has(id) || !this.sameOutput(oldNodes.get(id)!.children, node.children)) {
        surface.backOrder = null;
        node.children.forEach((child, index) => { surface.parents.set(child.id, id); surface.positions.set(child.id, index); });
      }
    }
    if (!this.sameOutput(surface.tree, draft.tree) || surface.recoveryNodes) {
      surface.backOrder = null; draft.tree.forEach((node, index) => { surface.parents.set(node.id, 0); surface.positions.set(node.id, index); });
    }
    for (const [id, token] of draft.inputTokens) if (surface.inputRevisions.get(id) === token) surface.inputSyncDirty.delete(id);
    this.countMetric("commitLogEntries", draft.hosts.size + draft.frames.size + draft.regions.size + draft.removedHosts.size + draft.removedFrames.size);
    surface.tree = draft.tree;
    surface.revision = revision;
    this.countMetric("commits");
    if (draft.commitStarted !== undefined) this.countMetric("commitRoundTripMs", Date.now() - draft.commitStarted);
    const nextNodes = new Map<number, HostNode>();
    for (const id of draft.hosts.keys()) { const node = surface.nodes.get(id); if (node) nextNodes.set(id, node); }
    for (const old of oldNodes.values()) {
      const next = surface.nodes.get(old.id);
      if (!next || old.ref !== next.ref) this.assignRef(surface, old.ref, null);
      if (!next) this.retireHandle(surface, old.id);
    }
    for (const node of nextNodes.values()) {
      if (node.ref && oldNodes.get(node.id)?.ref !== node.ref) this.assignRef(surface, node.ref, this.nodeHandle(surface, node.id));
    }
    for (const node of nextNodes.values()) {
      const old = oldNodes.get(node.id);
      if (node.events.layout && (!old || !old.events.layout || !sameFrame(old.frame, node.frame))) {
        try {
          const result = withTimerScope(surface.timerScope, () => node.events.layout!({ ...node.frame }));
          if (result instanceof Promise) result.catch(error => this.emitError(surface, "EVENT_REJECTION", error));
        } catch (error) { this.emitError(surface, "EVENT_ERROR", error); }
      }
    }
    for (const frame of changed) {
      for (const hook of frame.slots) if (hook.kind === "effect" && hook.changed) {
        try {
          const cleanup = withTimerScope(surface.timerScope, hook.setup);
          hook.slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
        } catch (error) { this.emitError(surface, "EFFECT_ERROR", error); }
      }
    }
    surface.pending = null;
    if (surface.recoveryNodes) { surface.recoveryNodes = null; surface.recovering = false; surface.recoveryAttempts = 0; }
    const events = surface.deferredEvents;
    surface.deferredEvents = [];
    for (const event of events) {
      if (event.type === "InputChange") this.invokeEvent(surface, event);
      else if (event.type === "Tap" || event.type === "NativeEvent") surface.deferredEvents.push(event);
    }
    for (const frame of changed) for (const hook of frame.slots) if ((hook.kind === "state" || hook.kind === "reducer") && hook.slot.pending.length > 0) surface.dirtyOwners.add(frame.path);
    if (surface.dirtyOwners.size || surface.inputSyncDirty.size) surface.dirty = true;
  }

  private progress(surface: Surface): void {
    if (surface.watchdog !== null) this.emit(surface, { type: "CancelRequest", requestId: surface.watchdog });
    surface.watchdog = null; surface.retries = 0;
  }
  private failCore(surface: Surface, code: string): void {
    const draft = surface.pending;
    if (!draft) return;
    if (draft.readyForAck || surface.recovering) { this.recoverSurface(surface, code); return; }
    // The host has not seen this draft. Abort is idempotent; the kernel may
    // already have rolled back a failed Begin/Continue operation.
    this.progress(surface); this.discardDraft(surface, draft); surface.pending = null;
    this.countMetric("aborts");
    if (this.renderCore) {
      try { this.renderCore({ type: "AbortRender", abi: CORE_ABI_VERSION, surfaceId: surface.id, generation: surface.generation, transactionId: draft.revision }); } catch {}
    } else this.coreRequests.push({ type: "AbortRender", abi: CORE_ABI_VERSION, surfaceId: surface.id, generation: surface.generation, transactionId: draft.revision });
    this.emit(surface, { type: "Diagnostic", code: "CORE_RENDER_ERROR", message: code });
  }
  private ensureWatchdog(surface: Surface): void {
    if (surface.watchdog !== null || !surface.pending && !surface.recovering || surface.recoveryAttempts > 2) return;
    const requestId = surface.nextRequestId++;
    if (!isU32(requestId)) throw new Error("REQUEST_ID_OVERFLOW");
    surface.watchdog = requestId;
    this.emit(surface, { type: "InvokeModule", requestId, module: "timer", method: "sleep", argument: "5000", purpose: "renderWatchdog" });
  }
  private retryTransaction(surface: Surface): void {
    if (++surface.retries > 2) { this.recoverSurface(surface, "TRANSACTION_TIMEOUT"); return; }
    this.countMetric("transactionRetries");
    if (surface.recovering && !surface.recoveryNodes) {
      const through = surface.nextRevision - 1;
      if (!surface.hostResetAck) this.emit(surface, { type: "ResetSurface", resetToken: surface.resetToken, rejectedThroughTransactionId: through });
      if (!surface.coreResetAck) this.sendCore({ type: "ResetSurface", abi: CORE_ABI_VERSION, surfaceId: surface.id, generation: surface.generation, transactionId: through, resetToken: surface.resetToken, rejectedThroughTransactionId: through });
      return;
    }
    const draft = surface.pending;
    if (!draft) return;
    if (draft.corePending || draft.finalizing) { if (draft.lastRequest) this.sendCore(draft.lastRequest); }
    else if (draft.readyForAck) for (const payload of draft.commitPayloads) this.emit(surface, payload);
    else for (const query of draft.measures.values()) this.emit(surface, { type: "MeasureRequest", requestId: query.requestId, nodeId: query.nodeId, kind: query.kind, text: query.text, fontSize: query.fontSize, maxWidth: query.maxWidth, props: query.props });
  }
  private recoverSurface(surface: Surface, reason: string): void {
    this.progress(surface); this.countMetric("resets");
    const failed = surface.pending;
    if (failed) this.discardDraft(surface, failed);
    surface.pending = null; surface.dirty = false;
    if (++surface.recoveryAttempts > 2) { this.emit(surface, { type: "Diagnostic", code: "RECOVERY_FAILED", message: reason }); return; }
    if (!surface.recovering) {
      surface.recovering = true;
      for (const frame of [...surface.frames.values()].sort((a, b) => b.depth - a.depth)) for (const slot of frame.slots) {
        if (slot.kind === "effect" && slot.cleanup) { this.runCleanup(surface, slot.cleanup); slot.cleanup = undefined; }
        if (slot.kind === "services") {
          for (const stop of [...slot.subscriptions]) stop(); slot.pageListeners.clear();
          for (const [id, request] of surface.modules) if (request.owner === slot) { surface.modules.delete(id); this.emit(surface, { type: "CancelRequest", requestId: id }); request.reject(new Error("RENDERER_RESET")); }
        }
      }
      for (const node of surface.nodes.values()) { this.assignRef(surface, node.ref, null); this.retireHandle(surface, node.id); }
    }
    surface.resetToken++; surface.coreResetAck = false; surface.hostResetAck = false;
    const through = surface.nextRevision - 1;
    this.emit(surface, { type: "Diagnostic", code: "RENDERER_LOST", message: reason });
    this.emit(surface, { type: "ResetSurface", resetToken: surface.resetToken, rejectedThroughTransactionId: through });
    this.sendCore({ type: "ResetSurface", abi: CORE_ABI_VERSION, surfaceId: surface.id, generation: surface.generation,
      transactionId: through, resetToken: surface.resetToken, rejectedThroughTransactionId: through });
  }
  private resumeRecovery(surface: Surface): void {
    if (!surface.coreResetAck || !surface.hostResetAck) return;
    const nodes = [...surface.nodes.values()];
    surface.nodeIds.clear(); surface.nodes.clear(); surface.parents.clear(); surface.positions.clear(); surface.backHandlers.clear(); surface.backOrder = null; surface.inputRevisions.clear(); surface.inputSyncDirty.clear();
    for (const node of nodes) {
      node.id = surface.nextNodeId++; if (!isU32(node.id)) throw new Error("NODE_ID_OVERFLOW");
      node.frame = { x: 0, y: 0, width: 0, height: 0 };
      if (node.kind === "TextInput") node.props = { ...node.props, inputRevision: 0 };
      surface.nodeIds.set(node.path, node.id);
    }
    for (const region of surface.regions.values()) if (region.hostId) region.hostId = region.output[0].id;
    surface.revision = 0; surface.recoveryNodes = nodes.length ? nodes : null; surface.dirty = true;
    if (!nodes.length) { surface.regions.clear(); surface.tree = []; surface.recovering = false; }
    this.onWake?.();
  }

  private assignRef(surface: Surface, ref: HostNode["ref"], handle: import("@anseronui/ui").NodeHandle | null): void {
    try { withTimerScope(surface.timerScope, () => { if (typeof ref === "function") ref(handle); else if (ref) ref.current = handle; }); }
    catch (error) { this.emitError(surface, "REF_ERROR", error); }
  }
  private nodeHandle(surface: Surface, nodeId: number): import("@anseronui/ui").NodeHandle {
    const existing = surface.handles.get(nodeId);
    if (existing) return existing.handle;
    const owner = this.newServiceSlot(surface);
    const invoke = async (method: string, args?: unknown): Promise<any> => {
      if (!owner.active || !surface.nodes.has(nodeId)) throw new Error("NODE_UNMOUNTED");
      const result = await this.invokeModule(surface, owner, "__view", method, JSON.stringify({ nodeId, args: args ?? null }));
      return JSON.parse(result);
    };
    const handle: import("@anseronui/ui").NodeHandle = { nodeId, invoke,
      animate: (style, options = {}) => { validateAnimationStyle(style); validateAnimationOptions(options); return invoke("animate", { style, options }); },
      cancelAnimation: () => invoke("cancelAnimation"),
      accessibilityFocus: () => invoke("accessibilityFocus"),
      accessibilityAnnounce: message => {
        if (typeof message !== "string" || message.length === 0 || message.length > 16384) return Promise.reject(new Error("INVALID_ACCESSIBILITY_MESSAGE"));
        return invoke("accessibilityAnnounce", { message });
      },
      focus: () => invoke("focus"), blur: () => invoke("blur"),
      scrollTo: (x, y, animated = false) => invoke("scrollTo", { x, y, animated }),
      measure: () => invoke("measure"),
    };
    // Keep the same owner object used by pending requests.
    surface.handles.set(nodeId, { owner, handle });
    return handle;
  }
  private retireHandle(surface: Surface, nodeId: number): void {
    const owner = surface.handles.get(nodeId)?.owner;
    if (!owner) return;
    owner.active = false;
    surface.handles.delete(nodeId);
    for (const [requestId, request] of surface.modules) if (request.owner === owner) {
      surface.modules.delete(requestId);
      this.emit(surface, { type: "CancelRequest", requestId });
      request.reject(new Error("NODE_UNMOUNTED"));
    }
  }

  private runCleanup(surface: Surface, cleanup: () => void): void {
    try { withTimerScope(surface.timerScope, cleanup); }
    catch (error) { this.emitError(surface, "EFFECT_CLEANUP_ERROR", error); }
  }
  private cleanupFrame(surface: Surface, frame: ComponentFrame): void {
    for (const slot of frame.slots) {
      if (slot.kind === "state" || slot.kind === "reducer") slot.active = false;
      if (slot.kind === "effect" && slot.cleanup) this.runCleanup(surface, slot.cleanup);
      if (slot.kind === "services") { slot.pageListeners.clear();
        for (const stop of slot.subscriptions) stop();
        slot.active = false;
        for (const [requestId, request] of surface.modules) if (request.owner === slot) {
          surface.modules.delete(requestId);
          this.emit(surface, { type: "CancelRequest", requestId });
          request.reject(new Error("SURFACE_DISPOSED"));
        }
      }
    }
  }
  private disposeSurface(surface: Surface): void {
    this.coreRequests = this.coreRequests.filter(request => request.surfaceId !== surface.id || request.generation !== surface.generation);
    const release: CoreRequest = { type: "ReleaseSurface", abi: CORE_ABI_VERSION, surfaceId: surface.id, generation: surface.generation };
    if (this.renderCore) this.renderCore(release);
    else this.coreRequests.push(release);
    this.progress(surface);
    if (surface.pending) this.discardDraft(surface, surface.pending);
    unregisterTimerScope(surface.timerScope);
    for (const node of this.flatten(surface.tree)) { this.assignRef(surface, node.ref, null); this.retireHandle(surface, node.id); }
    for (const frame of [...surface.frames.values()].sort((a, b) => b.depth - a.depth)) this.cleanupFrame(surface, frame);
    surface.frames.clear(); surface.tree = []; surface.pending = null; surface.nodes.clear(); surface.regions.clear(); surface.parents.clear(); surface.dirtyOwners.clear(); surface.inputSyncDirty.clear();
    surface.contextConsumers.clear(); surface.backHandlers.clear(); surface.positions.clear(); surface.backOrder = null;
    surface.nodeIds.clear(); surface.measureCache.clear(); surface.modules.clear(); surface.deferredEvents = [];
  }
}
