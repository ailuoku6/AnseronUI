import { registerTimerScope, unregisterTimerScope, withTimerScope, timeoutInScope, clearTimeout, forgetTimeout } from "../../ui/src/timers.js";
import type { TimerScope } from "../../ui/src/timers.js";
import { CORE_ABI_VERSION } from "./contracts.js";
import type { RenderNode, RenderRequest, RenderResult } from "./contracts.js";
import {
  PROTOCOL_MAJOR, PROTOCOL_MINOR, isU32, validateEnvelope, validateAnimationOptions, validateAnimationStyle,
} from "@anseronui/protocol";
import type {
  Envelope, Frame, InputPayload, NativeEvent, EventKind, NodeKind, OutputPayload, RenderCommand, RenderProps,
} from "@anseronui/protocol";
import { normalizeChildren, setHookDispatcher, RefCell } from "@anseronui/ui";
import type {
  Child, Component, Context, EffectSetup, HookDispatcher, Page, Ref, Services, Style, UIElement,
} from "@anseronui/ui";

type PendingUpdate = { id: number; value: unknown };
type StateSlot = { kind: "state" | "reducer"; value: unknown; pending: PendingUpdate[]; dispatch: (value: unknown) => void; active: boolean; reducer?: (state: unknown, action: unknown) => unknown };
type RefSlot = { kind: "ref"; ref: RefCell };
type MemoSlot = { kind: "memo"; value: unknown; deps: readonly unknown[] };
type EffectSlot = { kind: "effect"; setup: EffectSetup; deps?: readonly unknown[]; cleanup?: () => void };
type ServiceSlot = { kind: "services"; facade: Services; active: boolean };
type Slot = StateSlot | RefSlot | MemoSlot | EffectSlot | ServiceSlot;
type DraftSlot =
  | { kind: "state" | "reducer"; slot: StateSlot; value: unknown; watermark: number }
  | { kind: "ref"; slot: RefSlot }
  | { kind: "memo"; slot: MemoSlot; value: unknown; deps: readonly unknown[] }
  | { kind: "effect"; slot: EffectSlot; setup: EffectSetup; deps?: readonly unknown[]; changed: boolean }
  | { kind: "services"; slot: ServiceSlot };
type ContextRead = { context: Context<any>; value: unknown };
type ComponentFrame = { path: string; component: Component<any>; props: object; rendered: UIElement | null; contexts: Map<number, ContextRead>; slots: Slot[]; depth: number };
type DraftFrame = { path: string; component: Component<any>; base: ComponentFrame | null; props: object; rendered: UIElement | null; contexts: Map<number, ContextRead>; slots: DraftSlot[]; depth: number; reused?: ComponentFrame };
type EventCallbacks = {
  nativeComponent?: (event: import("@anseronui/ui").NativeComponentEvent) => void | Promise<void>;
  tap?: () => void | Promise<void>; changeText?: (value: string) => void | Promise<void>;
  longPress?: () => void | Promise<void>; backPress?: () => boolean; focus?: () => void | Promise<void>; blur?: () => void | Promise<void>;
  submit?: (value: string) => void | Promise<void>;
  scroll?: (offset: number, event: { x: number; y: number; contentWidth: number; contentHeight: number }) => void | Promise<void>;
  scrollEnd?: (event: { x: number; y: number; contentWidth: number; contentHeight: number }) => void | Promise<void>;
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
type MeasureQuery = { requestId: number; nodeId: number; kind: "Text" | "RichText" | "Button" | "TextInput"; text: string; fontSize: number; maxWidth: number; props: RenderProps; key: string };
type Draft = { revision: number; tree: HostNode[]; frames: Map<string, DraftFrame>; measures: Map<number, MeasureQuery>; measureRound: number; readyForAck: boolean; corePending: boolean };
type Surface = {
  timerScope: TimerScope; timers: Map<number, { id: number; callback: () => void }>;
  id: number; generation: number; page: Page<any>; width: number; height: number;
  revision: number; frames: Map<string, ComponentFrame>; tree: HostNode[];
  pending: Draft | null; dirty: boolean; nodeIds: Map<string, number>;
  nextNodeId: number; nextRequestId: number; nextUpdateId: number;
  measureCache: Map<string, { width: number; height: number; baseline: number }>;
  modules: Map<number, { owner: ServiceSlot; resolve: (value: string) => void; reject: (reason: Error) => void }>;
  handles: Map<number, { owner: ServiceSlot; handle: import("@anseronui/ui").NodeHandle }>;
  deferredEvents: InputPayload[];
  inputRevisions: Map<number, number>;
};

export interface RuntimeOptions { renderCore?: (request: RenderRequest) => RenderResult; bundleBuildId: string; pages: Page<any>[]; runtimeEpoch?: number; onWake?: () => void }

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
const MAX_MEASURE_ROUNDS = 3;

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
  private readonly renderCore?: (request: RenderRequest) => RenderResult;
  private coreRequests: RenderRequest[] = [];

  constructor(options: RuntimeOptions) {
    if (!options.bundleBuildId || options.bundleBuildId.length > 128) throw new Error("Invalid build ID");
    this.bundleBuildId = options.bundleBuildId;
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
      if (!surface.dirty && !surface.pending && surface.deferredEvents.length > 0) {
        const events = surface.deferredEvents;
        surface.deferredEvents = [];
        for (const event of events) {
          if (event.type !== "Tap" && event.type !== "NativeEvent") continue;
          if (surface.dirty) surface.deferredEvents.push(event);
          else this.invokeEvent(surface, { ...event, revision: surface.revision });
        }
      }
      if (surface.dirty && !surface.pending) this.beginRender(surface);
    }
    return this.takeOutputs();
  }

  takeOutputs(): Envelope<OutputPayload>[] { const result = this.outgoing; this.outgoing = []; return result; }
  takeCoreRequest(): RenderRequest | null { return this.coreRequests.shift() ?? null; }

  hasPendingWork(): boolean {
    return this.coreRequests.length > 0 || this.incoming.length > 0 || this.outgoing.length > 0 || [...this.surfaces.values()].some(s => s.dirty && !s.pending);
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
      const supportedNodes: NodeKind[] = ["View", "Text", "RichText", "Button", "TextInput", "ScrollView", "Image", "Video", "Native"];
      if (payload.requiredNodes.some(kind => !supportedNodes.includes(kind))) {
        this.emit({ id: input.surfaceId, generation: input.surfaceGeneration }, { type: "Diagnostic", code: "UNSUPPORTED_NODE", message: "Required node is unavailable" });
      } else this.emit({ id: input.surfaceId, generation: input.surfaceGeneration }, { type: "Ready", supportedNodes });
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
          surface.timers.set(requestId, { id, callback });
          this.emit(surface, { type: "InvokeModule", requestId, module: "timer", method: "sleep", argument: String(milliseconds) });
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
        timerScope, timers: new Map(),
        id: input.surfaceId, generation: input.surfaceGeneration, page,
        width: payload.width, height: payload.height, revision: 0,
        frames: new Map(), tree: [], pending: null, dirty: true,
        nodeIds: new Map(), nextNodeId: 1, nextRequestId: 1, nextUpdateId: 1,
        measureCache: new Map(), modules: new Map(), handles: new Map(), deferredEvents: [], inputRevisions: new Map(),
      });
      return;
    }
    const surface = this.surfaces.get(input.surfaceId);
    if (!surface || surface.generation !== input.surfaceGeneration) return;
    if (payload.type === "DestroySurface") {
      this.disposeSurface(surface);
      this.surfaces.delete(surface.id);
      this.emit(surface, { type: "SurfaceDisposed" });
      const identity = surface.id + ":" + surface.generation;
      this.inputSequences.delete(identity);
      this.outputSequences.delete(identity);
    } else if (payload.type === "BackPress") {
      this.emit(surface, { type: "BackPressResult", consumed: this.invokeBackPress(surface) });
    } else if (payload.type === "Resize") {
      if (!finiteDimension(payload.width) || !finiteDimension(payload.height)) return;
      surface.width = payload.width; surface.height = payload.height; surface.dirty = true;
    } else if (payload.type === "MeasureResult") {
      this.acceptMeasure(surface, payload);
    } else if (payload.type === "CommitAck") {
      this.ack(surface, payload.revision);
    } else if (payload.type === "CommitFailed") {
      if (surface.pending?.revision === payload.revision) {
        for (const node of this.flatten(surface.tree)) { this.assignRef(surface, node.ref, null); this.retireHandle(surface, node.id); }
        surface.pending = null; surface.tree = []; surface.dirty = true;
        this.emit(surface, { type: "Diagnostic", code: "RENDERER_LOST", message: payload.reason });
      }
    } else if (payload.type === "Tap" || payload.type === "InputChange" || payload.type === "NativeEvent") {
      if ((payload.type === "Tap" || payload.type === "NativeEvent") && (surface.pending || surface.dirty) &&
          (payload.revision === surface.revision || payload.revision === surface.pending?.revision)) surface.deferredEvents.push(payload);
      else if (surface.pending && payload.revision === surface.pending.revision) surface.deferredEvents.push(payload);
      else this.invokeEvent(surface, payload);
    } else if (payload.type === "ModuleResult") {
      const timer = surface.timers.get(payload.requestId);
      if (timer) {
        surface.timers.delete(payload.requestId); forgetTimeout(timer.id);
        if (payload.ok) {
          try {
            const result = withTimerScope(surface.timerScope, timer.callback) as unknown;
            if (result instanceof Promise) result.catch(error => {
              if (surface.timerScope.active) this.emit(surface, { type: "Diagnostic", code: "TIMER_ERROR", message: String(error) });
            });
          } catch (error) { this.emit(surface, { type: "Diagnostic", code: "TIMER_ERROR", message: String(error) }); }
        } else this.emit(surface, { type: "Diagnostic", code: "TIMER_ERROR", message: payload.value });
        return;
      }
      const request = surface.modules.get(payload.requestId);
      if (!request || !request.owner.active) return;
      surface.modules.delete(payload.requestId);
      if (payload.ok) request.resolve(payload.value);
      else request.reject(new Error(payload.value));
    }
  }

  private invokeEvent(surface: Surface, event: UIInput): void {
    withTimerScope(surface.timerScope, () => this.invokeScopedEvent(surface, event));
  }
  private invokeScopedEvent(surface: Surface, event: UIInput): void {
    if (event.type !== "InputChange" && event.revision !== surface.revision) return;
    if (event.type === "InputChange" && (event.revision > surface.revision || event.inputRevision <= (surface.inputRevisions.get(event.nodeId) ?? 0))) return;
    const touchInput = event.type === "NativeEvent" && ["touchDown", "touchMove", "touchUp", "touchCancel"].includes(event.event);
    const node = this.flatten(surface.tree).find(item => item.id === (touchInput ? event.targetId ?? event.nodeId : event.nodeId));
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
          const data = { x: event.x!, y: event.y!, contentWidth: event.contentWidth!, contentHeight: event.contentHeight! };
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
        result = node.events.changeText(event.value);
      }
      if (result instanceof Promise) result.catch(error => {
        if (this.surfaces.get(surface.id) === surface) this.emit(surface, { type: "Diagnostic", code: "EVENT_REJECTION", message: String(error) });
      });
    } catch (error) {
      this.emit(surface, { type: "Diagnostic", code: "EVENT_ERROR", message: String(error) });
    }
  }

  /** Back handlers are deliberately synchronous: the host must decide whether
   * to continue with native navigation before returning from the system callback. */
  private invokeBackPress(surface: Surface): boolean {
    return withTimerScope(surface.timerScope, () => this.invokeScopedBackPress(surface));
  }
  private invokeScopedBackPress(surface: Surface): boolean {
    const nodes = this.flatten(surface.tree).reverse();
    for (const node of nodes) {
      if (!node.events.backPress) continue;
      try {
        if (node.events.backPress()) return true;
      } catch (error) {
        this.emit(surface, { type: "Diagnostic", code: "BACK_PRESS_ERROR", message: String(error) });
      }
    }
    return false;
  }

  private dispatchTouch(surface: Surface, target: HostNode, event: NativeEvent): void {
    const path: HostNode[] = [];
    const findPath = (nodes: HostNode[], ancestors: HostNode[]): boolean => {
      for (const item of nodes) {
        const next = [...ancestors, item];
        if (item.id === target.id) { path.push(...next); return true; }
        if (findPath(item.children, next)) return true;
      }
      return false;
    };
    if (!findPath(surface.tree, [])) return;
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
        this.emit(surface, { type: "Diagnostic", code: "EVENT_ERROR", message: String(error) });
        return;
      }
      if (result instanceof Promise) result.catch(error => {
        if (this.surfaces.get(surface.id) === surface) this.emit(surface, { type: "Diagnostic", code: "EVENT_REJECTION", message: String(error) });
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
    const draft: Draft = { revision: surface.revision + 1, tree: [], frames: new Map(), measures: new Map(), measureRound: 0, readyForAck: false, corePending: false };
    try {
      const root: UIElement = { kind: "component", component: surface.page.component, props: {}, key: null };
      draft.tree = this.visit(surface, draft, root, "root", new Map(), 0);
      surface.pending = draft;
      this.layout(surface, draft);
    } catch (error) {
      surface.pending = null;
      this.emit(surface, { type: "Diagnostic", code: "RENDER_ERROR", message: String(error) });
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

  private visit(surface: Surface, draft: Draft, element: UIElement, path: string, context: Map<number, unknown>, depth: number): HostNode[] {
    if (element.kind === "fragment") return this.visitChildren(surface, draft, element.children, path + "/fragment", context, depth);
    if (element.kind === "provider") {
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
        draft.frames.set(framePath, { path: framePath, component: element.component, base, props, rendered: base.rendered, contexts: base.contexts, slots: [], depth, reused: base });
        return base.rendered ? this.visit(surface, draft, base.rendered, framePath, context, depth + 1) : [];
      }
      const frame: DraftFrame = { path: framePath, component: element.component, base, props, rendered: null, contexts: new Map(), slots: [], depth };
      let cursor = 0;
      const next = (): number => cursor++;
      const dispatcher: HookDispatcher = {
        state: (initial: unknown): [unknown, (value: unknown) => void] => {
          const slotIndex = next();
          const old = base?.slots[slotIndex];
          if (old && old.kind !== "state") throw new Error("HOOK_ORDER_CHANGED");
          const slot = old as StateSlot | undefined ?? this.newStateSlot(surface, "state", typeof initial === "function" ? (initial as () => unknown)() : initial);
          const watermark = slot.pending.at(-1)?.id ?? 0;
          let value = slot.value;
          for (const update of slot.pending) if (update.id <= watermark) value = typeof update.value === "function" ? (update.value as (v: unknown) => unknown)(value) : update.value;
          frame.slots.push({ kind: "state", slot, value, watermark });
          return [value, slot.dispatch];
        },
        reducer: <S, A>(reducer: (state: S, action: A) => S, initial: S): [S, (action: A) => void] => {
          const slotIndex = next();
          const old = base?.slots[slotIndex];
          if (old && old.kind !== "reducer") throw new Error("HOOK_ORDER_CHANGED");
          const slot = old as StateSlot | undefined ?? this.newStateSlot(surface, "reducer", initial);
          const watermark = slot.pending.at(-1)?.id ?? 0;
          let value = slot.value as S;
          for (const update of slot.pending) if (update.id <= watermark) value = reducer(value, update.value as A);
          frame.slots.push({ kind: "reducer", slot, value, watermark });
          slot.reducer = reducer as (state: unknown, action: unknown) => unknown;
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
          frame.contexts.set(requested.id, { context: requested as Context<any>, value });
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
        text: span.text, color: span.color, fontSize: span.fontSize, fontWeight: span.fontWeight,
        fontStyle: span.fontStyle, textDecorationLine: span.textDecorationLine,
        clickable: allSpansClickable || typeof span.onClick === "function",
      })));
    }
    if (element.tag === "Button") outputProps.title = String(props.title ?? "");
    if (typeof props.touchAction === "string") outputProps.touchAction = props.touchAction;
    if (element.tag === "TextInput") {
      outputProps.value = String(props.value ?? "");
      outputProps.inputRevision = surface.inputRevisions.get(id) ?? 0;
      outputProps.placeholder = String(props.placeholder ?? "");
    }
    if (element.tag === "Image" || element.tag === "Video") {
      outputProps.src = String(props.src ?? "");
      if (typeof props.resizeMode === "string") outputProps.resizeMode = props.resizeMode;
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
    for (const key of ["translateX", "translateY", "scaleX", "scaleY", "rotate", "backgroundColor", "color", "opacity", "fontSize", "borderWidth", "borderColor", "borderRadius", "overflow", "visibility", "fontWeight", "fontStyle", "textAlign", "textDecorationLine"] as const) {
      const value = style[key];
      if (value !== undefined) outputProps[key] = value;
    }
    for (const key of ["testID", "accessibilityLabel", "numberOfLines", "ellipsizeMode", "editable", "secureTextEntry", "maxLength", "keyboardType", "returnKeyType", "autoCapitalize", "autoCorrect", "placeholderTextColor", "scrollEnabled", "showsVerticalScrollIndicator"]) {
      const value = props[key];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") outputProps[key] = value;
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
    const children = element.tag === "Text" || element.tag === "RichText" || element.tag === "Button" || element.tag === "TextInput" || element.tag === "Image" || element.tag === "Video"
      ? [] : this.visitChildren(surface, draft, element.children, hostPath, context, depth + 1);
    return [{ id, path: hostPath, kind: element.tag, props: outputProps, style, children, frame: { x: 0, y: 0, width: 0, height: 0 }, events, nativeName: element.tag === "Native" ? String(props.name) : undefined, ref: props.ref as HostNode["ref"] }];
  }

  private newStateSlot(surface: Surface, kind: "state" | "reducer", value: unknown): StateSlot {
    const slot: StateSlot = { kind, value, pending: [], active: true, dispatch: () => {} };
    slot.dispatch = (next: unknown) => {
      if (!slot.active || this.disposed) return;
      if (this.rendering) throw new Error("STATE_UPDATE_DURING_RENDER");
      const id = surface.nextUpdateId++;
      if (!isU32(id)) throw new Error("UPDATE_ID_OVERFLOW");
      slot.pending.push({ id, value: next });
      surface.dirty = true;
      this.onWake?.();
    };
    return slot;
  }
  private newServiceSlot(surface: Surface): ServiceSlot {
    const route = async (method: "push" | "replace", page: string): Promise<void> => {
      if (!/^[a-z][a-z0-9_-]*$/.test(page)) throw new Error("INVALID_ROUTE");
      await this.invokeModule(surface, slot, "router", method, JSON.stringify({ page }));
    };
    const pop = async (): Promise<void> => { await this.invokeModule(surface, slot, "router", "pop", "{}"); };
    const slot: ServiceSlot = { kind: "services", active: true, facade: {
      timers: { setTimeout: (callback, delay = 0) => timeoutInScope(surface.timerScope, callback, delay), clearTimeout },
      invoke: async <T>(module: string, method: string, args?: unknown): Promise<T> => {
        if (module === "__view" || module === "http" || module === "timer" || module === "router") throw new Error("RESERVED_MODULE");
        return JSON.parse(await this.invokeModule(surface, slot, module, method, JSON.stringify(args ?? null))) as T;
      },
      router: {
        push: (page: string) => route("push", page),
        replace: (page: string) => route("replace", page),
        pop,
        back: pop,
        current: async () => JSON.parse(await this.invokeModule(surface, slot, "router", "current", "{}")) as string,
      },
      http: { getText: (url: string) => this.invokeModule(surface, slot, "http", "getText", url) },
      sleep: async (milliseconds: number) => {
        if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error("Invalid sleep duration");
        await this.invokeModule(surface, slot, "timer", "sleep", String(milliseconds));
      },
    } };
    return slot;
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

  private renderNodes(tree: HostNode[]): RenderNode[] {
    return tree.map(node => ({ id: node.id, kind: node.kind, nativeName: node.nativeName,
      props: node.props, style: node.style, frame: node.frame,
      events: EVENT_NAMES.filter(event => this.hasEvent(node, event)), children: this.renderNodes(node.children) }));
  }
  private layout(surface: Surface, draft: Draft): void {
    if (draft.measureRound >= MAX_MEASURE_ROUNDS) {
      surface.pending = null;
      this.emit(surface, { type: "Diagnostic", code: "LAYOUT_NOT_CONVERGED", message: "Text measurement exceeded " + MAX_MEASURE_ROUNDS + " rounds" });
      return;
    }
    draft.measureRound++;
    draft.corePending = true;
    draft.measures.clear();
    const request: RenderRequest = { abi: CORE_ABI_VERSION, surfaceId: surface.id, generation: surface.generation,
      revision: draft.revision, round: draft.measureRound, width: surface.width, height: surface.height,
      tree: this.renderNodes(draft.tree), previous: this.renderNodes(surface.tree), nextRequestId: surface.nextRequestId,
      measureCache: [...surface.measureCache].map(([key, value]) => ({key, ...value})) };
    if (this.renderCore) this.acceptCoreResult(this.renderCore(request));
    else this.coreRequests.push(request);
  }
  acceptCoreResult(result: RenderResult): void {
    if (result.abi !== CORE_ABI_VERSION) throw new Error("CORE_ABI_MISMATCH");
    const surface = this.surfaces.get(result.surfaceId);
    const draft = surface?.pending;
    if (!surface || surface.generation !== result.generation || !draft || !draft.corePending || draft.revision !== result.revision || draft.measureRound !== result.round) return;
    draft.corePending = false;
    surface.nextRequestId = Math.max(surface.nextRequestId, result.nextRequestId);
    const frames = new Map(result.frames.map(item => [item.nodeId, item.frame]));
    for (const host of this.flatten(draft.tree)) {
      const frame = frames.get(host.id);
      if (!frame) throw new Error("CORE_MISSING_FRAME");
      host.frame = frame;
    }
    for (const query of result.measures) {
      draft.measures.set(query.requestId, query);
      this.emit(surface, { type: "MeasureRequest", requestId: query.requestId, nodeId: query.nodeId, kind: query.kind, text: query.text, fontSize: query.fontSize, maxWidth: query.maxWidth, props: query.props });
    }
    if (draft.measures.size === 0) {
      draft.readyForAck = true;
      this.emit(surface, { type: "Commit", revision: draft.revision, commands: result.commands });
    }
  }

  private acceptMeasure(surface: Surface, result: Extract<InputPayload, { type: "MeasureResult" }>): void {
    const draft = surface.pending;
    const query = draft?.measures.get(result.requestId);
    if (!draft || !query || query.nodeId !== result.nodeId || !finiteDimension(result.width) || !finiteDimension(result.height)) return;
    surface.measureCache.set(query.key, { width: result.width, height: result.height, baseline: result.baseline });
    draft.measures.delete(result.requestId);
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
    if (!draft || !draft.readyForAck || revision !== draft.revision) return;
    const oldFrames = surface.frames;
    const nextPaths = new Set(this.flatten(draft.tree).map(node => node.path));
    for (const node of this.flatten(surface.tree)) {
      if (!nextPaths.has(node.path)) surface.nodeIds.delete(node.path);
    }
    const removed = [...oldFrames.values()].filter(frame => !draft.frames.has(frame.path)).sort((a, b) => b.depth - a.depth);
    const changed = [...draft.frames.values()].sort((a, b) => b.depth - a.depth);
    for (const frame of removed) this.cleanupFrame(surface, frame);
    for (const frame of changed) {
      for (const hook of frame.slots) if (hook.kind === "effect" && hook.changed && hook.slot.cleanup) {
        this.runCleanup(surface, hook.slot.cleanup); hook.slot.cleanup = undefined;
      }
    }
    const committed = new Map<string, ComponentFrame>();
    for (const frame of draft.frames.values()) {
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
        path: frame.path, component: frame.component, props: frame.props,
        rendered: frame.rendered, contexts: frame.contexts, slots, depth: frame.depth,
      });
    }
    surface.frames = committed;
    const oldNodes = new Map(this.flatten(surface.tree).map(node => [node.id, node]));
    surface.tree = draft.tree;
    surface.revision = revision;
    surface.pending = null;
    const nextNodes = new Map(this.flatten(surface.tree).map(node => [node.id, node]));
    for (const old of oldNodes.values()) {
      const next = nextNodes.get(old.id);
      if (!next || old.ref !== next.ref) this.assignRef(surface, old.ref, null);
      if (!next) this.retireHandle(surface, old.id);
    }
    for (const node of nextNodes.values()) {
      if (node.ref && oldNodes.get(node.id)?.ref !== node.ref) this.assignRef(surface, node.ref, this.nodeHandle(surface, node.id));
    }
    for (const node of this.flatten(surface.tree)) {
      const old = oldNodes.get(node.id);
      if (node.events.layout && (!old || !old.events.layout || !sameFrame(old.frame, node.frame))) {
        try {
          const result = withTimerScope(surface.timerScope, () => node.events.layout!({ ...node.frame }));
          if (result instanceof Promise) result.catch(error => this.emit(surface, { type: "Diagnostic", code: "EVENT_REJECTION", message: String(error) }));
        } catch (error) { this.emit(surface, { type: "Diagnostic", code: "EVENT_ERROR", message: String(error) }); }
      }
    }
    for (const frame of changed) {
      for (const hook of frame.slots) if (hook.kind === "effect" && hook.changed) {
        try {
          const cleanup = withTimerScope(surface.timerScope, hook.setup);
          hook.slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
        } catch (error) { this.emit(surface, { type: "Diagnostic", code: "EFFECT_ERROR", message: String(error) }); }
      }
    }
    const events = surface.deferredEvents;
    surface.deferredEvents = [];
    for (const event of events) {
      if (event.type === "InputChange") this.invokeEvent(surface, event);
      else if (event.type === "Tap" || event.type === "NativeEvent") surface.deferredEvents.push(event);
    }
    if ([...committed.values()].some(frame => frame.slots.some(slot => (slot.kind === "state" || slot.kind === "reducer") && slot.pending.length > 0))) surface.dirty = true;
  }

  private assignRef(surface: Surface, ref: HostNode["ref"], handle: import("@anseronui/ui").NodeHandle | null): void {
    try { withTimerScope(surface.timerScope, () => { if (typeof ref === "function") ref(handle); else if (ref) ref.current = handle; }); }
    catch (error) { this.emit(surface, { type: "Diagnostic", code: "REF_ERROR", message: String(error) }); }
  }
  private nodeHandle(surface: Surface, nodeId: number): import("@anseronui/ui").NodeHandle {
    const existing = surface.handles.get(nodeId);
    if (existing) return existing.handle;
    const owner = this.newServiceSlot(surface);
    const invoke = async (method: string, args?: unknown): Promise<any> => {
      if (!owner.active || !this.flatten(surface.tree).some(node => node.id === nodeId)) throw new Error("NODE_UNMOUNTED");
      const result = await this.invokeModule(surface, owner, "__view", method, JSON.stringify({ nodeId, args: args ?? null }));
      return JSON.parse(result);
    };
    const handle: import("@anseronui/ui").NodeHandle = { nodeId, invoke,
      animate: (style, options = {}) => { validateAnimationStyle(style); validateAnimationOptions(options); return invoke("animate", { style, options }); },
      cancelAnimation: () => invoke("cancelAnimation"),
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
    catch (error) { this.emit(surface, { type: "Diagnostic", code: "EFFECT_CLEANUP_ERROR", message: String(error) }); }
  }
  private cleanupFrame(surface: Surface, frame: ComponentFrame): void {
    for (const slot of frame.slots) {
      if (slot.kind === "state" || slot.kind === "reducer") slot.active = false;
      if (slot.kind === "effect" && slot.cleanup) this.runCleanup(surface, slot.cleanup);
      if (slot.kind === "services") {
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
    unregisterTimerScope(surface.timerScope);
    for (const node of this.flatten(surface.tree)) { this.assignRef(surface, node.ref, null); this.retireHandle(surface, node.id); }
    for (const frame of [...surface.frames.values()].sort((a, b) => b.depth - a.depth)) this.cleanupFrame(surface, frame);
    surface.frames.clear(); surface.tree = []; surface.pending = null;
    surface.nodeIds.clear(); surface.measureCache.clear(); surface.modules.clear(); surface.deferredEvents = [];
  }
}
