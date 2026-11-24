import { RENDER_CAPABILITIES, RENDER_LIMITS } from "@anseronui/protocol";
import { cleanupAll } from './cleanup.js';
import { BrowserNativeServices } from "./native-services.js";
import type { PlatformExtensions } from "./extensions.js";
import { ReferenceRuntime } from "@anseronui/core";
import { PROTOCOL_MAJOR, PROTOCOL_MINOR, CommitAssembler, decodeEnvelope, encodeEnvelope, validateEnvelope } from "@anseronui/protocol";
import type { Envelope, InputPayload, OutputPayload, RenderProps } from "@anseronui/protocol";
import type { Page } from "@anseronui/ui";
import { DOMRenderer } from "./renderer.js";

export type TextMeasure = (kind: "Text" | "RichText" | "TextInput", text: string, fontSize: number, maxWidth: number, props?: RenderProps) => Promise<{ width: number; height: number; baseline: number }> | { width: number; height: number; baseline: number };

export interface BrowserRuntimeAdapter {
  readonly bundleBuildId: string;
  readonly runtimeEpoch: number;
  post(input: Envelope<InputPayload>): void;
  step(maxMessages?: number): Envelope<OutputPayload>[];
  hasPendingWork(): boolean;
  dispose(): void;
}

/** Bytes boundary shared by a future Wasm reactor loader and native binding tests. */
export interface ByteRuntimeTransport {
  post(input: Uint8Array): void;
  step(maxMessages: number): readonly Uint8Array[];
  hasPendingWork(): boolean;
  dispose(): void;
}

export class BrowserBytesAdapter implements BrowserRuntimeAdapter {
  constructor(readonly bundleBuildId: string, readonly runtimeEpoch: number, private readonly transport: ByteRuntimeTransport) {}
  post(input: Envelope<InputPayload>): void { this.transport.post(encodeEnvelope(input)); }
  step(maxMessages = 64): Envelope<OutputPayload>[] { return this.transport.step(maxMessages).map(bytes => decodeEnvelope<OutputPayload>(bytes)); }
  hasPendingWork(): boolean { return this.transport.hasPendingWork(); }
  dispose(): void { this.transport.dispose(); }
}

/** Browser text engine adapter; uses real DOM wrapping instead of character-count estimates. */
export function measureBrowserText(root: HTMLElement): TextMeasure {
  return (kind, text, fontSize, maxWidth, props = {}) => {
    const probe = root.ownerDocument.createElement(kind === "Text" || kind === "RichText" ? "div" : "input");
    probe.style.position = "fixed";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "pre-wrap";
    probe.style.overflowWrap = "break-word";
    probe.style.fontSize = fontSize + "px";
    probe.style.lineHeight = props.lineHeight === undefined ? "normal" : props.lineHeight + "px";
    probe.style.fontWeight = String(props.fontWeight ?? "normal");
    probe.style.fontStyle = String(props.fontStyle ?? "normal");
    probe.style.width = "max-content";
    probe.style.maxWidth = maxWidth + "px";
    if (kind === "TextInput") (probe as HTMLInputElement).value = text || " ";
    else probe.textContent = text || " ";
    if (kind === "RichText") {
      const spans = JSON.parse(String(props.spans ?? "[]")) as { text: string; fontSize?: number; fontWeight?: string; fontStyle?: string }[];
      probe.replaceChildren(...spans.map(item => {
        const span = root.ownerDocument.createElement("span"); span.textContent = item.text;
        if (item.fontSize !== undefined) span.style.fontSize = item.fontSize + "px";
        if (item.fontWeight) span.style.fontWeight = item.fontWeight;
        if (item.fontStyle) span.style.fontStyle = item.fontStyle;
        return span;
      }));
    }
    if (props.numberOfLines) {
      probe.style.display = "-webkit-box"; probe.style.webkitBoxOrient = "vertical";
      probe.style.webkitLineClamp = String(props.numberOfLines); probe.style.overflow = "hidden";
    }
    root.ownerDocument.body.appendChild(probe);
    const bounds = probe.getBoundingClientRect();
    // Flexily stores integer frames; round upward with one pixel of text slack so
    // a fractional glyph width cannot wrap after the measured frame is rounded.
    const result = { width: Math.min(maxWidth, Math.ceil(bounds.width) + 1), height: Math.ceil(bounds.height), baseline: fontSize };
    probe.remove();
    return result;
  };
}

/** Drives an adapter through the versioned protocol and DOM renderer. */
export class BrowserHost<R extends BrowserRuntimeAdapter = BrowserRuntimeAdapter> {
  private readonly nativeServices: BrowserNativeServices;
  readonly runtime: R;
  readonly renderer: DOMRenderer;
  readonly diagnostics: { code: string; message: string; stack?: string; errorName?: string; buildId?: string }[] = [];
  private assembler = new CommitAssembler();
  private sequence = 0;
  private outputSequence = 0;
  private ready = false;
  private visible = true;
  private mounted = false;
  private profiling = false;
  private profileWaiter: { resolve: (stats: Record<string, number>) => void; reject: (error: unknown) => void } | null = null;
  private hostStats: Record<string, number> = {};
  private metric(name: string, value: number): void { if (this.profiling) this.hostStats[name] = (this.hostStats[name] ?? 0) + value; }
  getPerformanceStats(): Record<string, number> { return { ...this.hostStats }; }
  async inspectRuntime(enabled = true, reset = false): Promise<Record<string, number>> {
    if (!this.mounted || this.disposed) throw new Error('SURFACE_NOT_MOUNTED');
    if (this.profileWaiter) throw new Error('INSPECTION_PENDING');
    this.profiling = enabled; if (reset) this.hostStats = {};
    const result = new Promise<Record<string, number>>((resolve, reject) => { this.profileWaiter = { resolve, reject }; });
    try { this.send({ type: 'InspectRuntime', enabled, reset }); }
    catch (error) { this.rejectInspection(error); return result; }
    void this.flush().catch(error => this.rejectInspection(error));
    return result;
  }
  private rejectInspection(error: unknown): void { const waiter = this.profileWaiter; this.profileWaiter = null; waiter?.reject(error); }
  private flushing: Promise<void> | null = null;
  private disposed = false;
  private environmentVersion = 0;
  private environmentCleanups: (() => void)[] = [];
  private requests = new Map<number, () => void>();
  private readonly surfaceId = 1;
  private readonly generation = 1;
  private readonly measure: TextMeasure;
  private backWaiter: ((consumed: boolean) => void) | null = null;

  constructor(root: HTMLElement, runtime: R, measure?: TextMeasure, private readonly extensions: PlatformExtensions = {}) {
    this.runtime = runtime;
    const changed = (): void => { if (this.mounted && !this.disposed) void this.environmentChanged(); };
    const fonts = root.ownerDocument.fonts;
    fonts?.addEventListener('loadingdone', changed);
    const appearance = root.ownerDocument.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    appearance?.addEventListener('change', changed);
    this.environmentCleanups = [() => fonts?.removeEventListener('loadingdone', changed), () => appearance?.removeEventListener('change', changed)];
    this.nativeServices = new BrowserNativeServices(root, extensions.subscriptions, extensions.services);
    this.measure = measure ?? measureBrowserText(root);
    this.renderer = new DOMRenderer(root, event => {
      if (this.disposed) return;
      this.send(event);
      queueMicrotask(() => { void this.flush(); });
    }, extensions.components);
  }

  async mount(page: string, width: number, height: number): Promise<void> {
    this.send({ type: "Handshake", capabilities: RENDER_CAPABILITIES, limits: RENDER_LIMITS, requiredNodes: ["View", "Text", "RichText", "TextInput", "ScrollView", "Image", "Video"] });
    await this.flush();
    if (!this.ready) throw new Error(this.diagnostics[0]?.message ?? "Handshake did not complete");
    this.send({ type: "CreateSurface", page, width, height, visible: this.visible });
    this.mounted = true;
    await this.flush();
    if (this.diagnostics.length > 0) {
      const first = this.diagnostics[0];
      throw new Error(first.code + ": " + first.message);
    }
  }
  async setVisibility(visible: boolean): Promise<void> {
    if (this.disposed || this.visible === visible) return;
    this.visible = visible;
    this.renderer.setPageActive(visible);
    if (this.mounted) { this.send({ type: "SurfaceVisibility", visible }); await this.flush(); }
  }
  async environmentChanged(): Promise<void> { this.send({ type: "EnvironmentChanged", version: ++this.environmentVersion }); await this.flush(); }
  async resize(width: number, height: number): Promise<void> { this.send({ type: "Resize", width, height }); await this.flush(); }
  /** Asks Core synchronously from the browser event turn; resolves true when TSX consumed it. */
  async handleBackPress(): Promise<boolean> {
    if (this.disposed) return false;
    const result = new Promise<boolean>(resolve => { this.backWaiter = resolve; });
    this.send({ type: "BackPress" });
    await this.flush();
    return result;
  }
  async destroy(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try { this.send({ type: "DestroySurface" }); await this.flush(); }
    finally {
      const profile = this.profileWaiter, back = this.backWaiter; this.profileWaiter = null; this.backWaiter = null;
      const cancellations = Array.from(this.requests.values()); this.requests.clear();
      cleanupAll([...this.environmentCleanups, () => profile?.reject(new Error('SURFACE_DISPOSED')), () => back?.(false), ...cancellations, () => this.nativeServices.dispose(), () => this.renderer.dispose(), () => this.runtime.dispose()]);
    }
  }

  private send(payload: InputPayload): void {
    const envelope: Envelope<InputPayload> = {
      protocolMajor: PROTOCOL_MAJOR, protocolMinor: PROTOCOL_MINOR,
      bundleBuildId: this.runtime.bundleBuildId, runtimeEpoch: this.runtime.runtimeEpoch,
      surfaceId: this.surfaceId, surfaceGeneration: this.generation,
      sequence: this.sequence + 1, ackSequence: this.outputSequence, payload,
    };
    if (this.profiling) this.metric('inputBytes', new TextEncoder().encode(JSON.stringify(envelope)).length);
    this.runtime.post(envelope);
    this.sequence++;
  }
  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.drive();
    try { await this.flushing; }
    finally {
      this.flushing = null;
      if (!this.disposed && this.runtime.hasPendingWork()) queueMicrotask(() => { void this.flush(); });
    }
  }
  private async drive(): Promise<void> {
    for (let cycle = 0; cycle < 4096; cycle++) {
      // AOT adapters can consume one input per step. Yield regularly while draining
      // a full measurement window so host timers and paint get a turn as well.
      if (cycle > 0 && cycle % 32 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
      const started = this.profiling ? performance.now() : 0;
      const messages = this.runtime.step();
      this.metric('adapterStepMs', this.profiling ? performance.now() - started : 0);
      if (messages.length === 0) { if (this.runtime.hasPendingWork()) continue; return; }
      for (const message of messages) {
        validateEnvelope<OutputPayload>(message);
        if (message.bundleBuildId !== this.runtime.bundleBuildId || message.runtimeEpoch !== this.runtime.runtimeEpoch ||
          message.surfaceId !== this.surfaceId || message.surfaceGeneration !== this.generation ||
          message.sequence !== this.outputSequence + 1 || message.ackSequence > this.sequence) throw new Error("Invalid Core output envelope");
        this.outputSequence = message.sequence;
        if (this.profiling) this.metric('outputBytes', new TextEncoder().encode(JSON.stringify(message)).length);
        const assembled = this.assembler.accept(message.payload); if (assembled) await this.handle(assembled);
      }
    }
    throw new Error("Browser host did not settle within 4096 steps");
  }
  private async handle(payload: OutputPayload): Promise<void> {
    if (payload.type === "ResetSurface") {
      this.renderer.clear(); this.assembler.reset(payload.rejectedThroughTransactionId); this.send({ type: "ResetAck", resetToken: payload.resetToken });
    } else if (payload.type === "Ready") {
      this.ready = true;
    } else if (payload.type === "MeasureRequest") {
      const started = this.profiling ? performance.now() : 0;
      const result = await this.measure(payload.kind, payload.text, payload.fontSize, payload.maxWidth, payload.props);
      this.metric('hostMeasureMs', this.profiling ? performance.now() - started : 0);
      this.send({ type: "MeasureResult", requestId: payload.requestId, nodeId: payload.nodeId, ...result });
    } else if (payload.type === "Commit") {
      try {
        const started = this.profiling ? performance.now() : 0;
        this.renderer.apply(payload.revision, payload.commands);
        this.metric('rendererApplyMs', this.profiling ? performance.now() - started : 0); this.metric('hostCommits', 1);
        this.send({ type: "CommitAck", revision: payload.revision });
      } catch (error) {
        this.renderer.clear();
        this.send({ type: "CommitFailed", revision: payload.revision, reason: String(error) });
      }
    } else if (payload.type === "InvokeModule") {
      if (payload.module === "http" && payload.method === "getText") {
        const controller = new AbortController();
        this.requests.set(payload.requestId, () => controller.abort());
        void fetch(payload.argument, { signal: controller.signal }).then(async response => {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.text();
        }).then(value => this.completeModule(payload.requestId, true, value), error => this.completeModule(payload.requestId, false, String(error)));
      } else if (payload.module === "timer" && payload.method === "sleep") {
        const delay = Number(payload.argument);
        const timer = setTimeout(() => this.completeModule(payload.requestId, true, ""), delay);
        this.requests.set(payload.requestId, () => clearTimeout(timer));
      } else {
        const controller = new AbortController();
        this.requests.set(payload.requestId, () => controller.abort());
        void Promise.resolve().then(async () => {
          const args = JSON.parse(payload.argument);
          if (controller.signal.aborted) return null;
          if (payload.module === "__view") return this.renderer.invoke(args.nodeId, payload.method, args.args);
          if (payload.module === "router") {
            const handler = this.extensions.router;
            if (!handler) throw new Error("ROUTER_UNAVAILABLE");
            return handler(payload.method, args, controller.signal);
          }
          const modules = this.extensions.modules ?? {};
          const handler = Object.prototype.hasOwnProperty.call(modules, payload.module) ? modules[payload.module] : undefined;
          if (handler && !this.nativeServices.available(payload.module, payload.method)) return handler(payload.method, args, controller.signal);
          return this.nativeServices.call(payload.module, payload.method, args, controller.signal);
        }).then(value => this.completeModule(payload.requestId, true, JSON.stringify(value ?? null)))
          .catch(error => this.completeModule(payload.requestId, false, String(error)));
      }
    } else if (payload.type === "CancelRequest") {
      this.requests.get(payload.requestId)?.();
      this.requests.delete(payload.requestId);
    } else if (payload.type === "BackPressResult") {
      const waiter = this.backWaiter; this.backWaiter = null; waiter?.(payload.consumed);
    } else if (payload.type === "RuntimeStats") {
      const waiter = this.profileWaiter; this.profileWaiter = null; waiter?.resolve(payload.values);
    } else if (payload.type === "Diagnostic") {
      this.diagnostics.push({ code: payload.code, message: payload.message, stack: payload.stack, errorName: payload.errorName, buildId: payload.buildId });
      if (this.diagnostics.length > 200) this.diagnostics.shift();
      try { this.extensions.onDiagnosticDetails?.(payload); } catch { /* Collection cannot interrupt rendering. */ }
    }
  }
  private completeModule(requestId: number, ok: boolean, value: string): void {
    if (!this.requests.has(requestId) || this.disposed) return;
    this.requests.delete(requestId);
    if (value.length > 65536) { ok = false; value = "MODULE_RESULT_TOO_LARGE"; }
    this.send({ type: "ModuleResult", requestId, ok, value });
    queueMicrotask(() => { void this.flush(); });
  }
}

/** Development host using the JS reference Core; it does not load Wasm. */
export class BrowserReferenceHost extends BrowserHost<ReferenceRuntime> {
  constructor(root: HTMLElement, page: Page<any>, measure?: TextMeasure, extensions: PlatformExtensions = {}) {
    let host: BrowserReferenceHost | null = null;
    const runtime = new ReferenceRuntime({ bundleBuildId: "reference-browser", pages: [page],
      onWake: () => queueMicrotask(() => { void host?.flush(); }) });
    super(root, runtime, measure, extensions);
    host = this;
  }
}
