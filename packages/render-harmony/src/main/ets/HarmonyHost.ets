// ANSERONUI_DEVTOOLS_BEGIN
import { image } from '@kit.ImageKit';
// ANSERONUI_DEVTOOLS_END
import accessibility from '@ohos.accessibility';
import { cleanup } from './Cleanup';
import { HarmonyMedia } from './HarmonyMedia';
import { HarmonyEvents } from './HarmonyEvents';
import { window } from '@kit.ArkUI';
import { inputMethod } from '@kit.IMEKit';
import { connection } from '@kit.NetworkKit';
import { abilityAccessCtrl, Permissions, bundleManager } from '@kit.AbilityKit';
import { HarmonyAnimation, Request as AnimationRequest, Options as AnimationOptions, VisualValues } from './HarmonyAnimation';
import native from 'libanseronui.so';
import { NodeContent, UIContext } from '@kit.ArkUI';
import { common, Configuration } from '@kit.AbilityKit';
import promptAction from '@ohos.promptAction';
import { http } from '@kit.NetworkKit';
import { preferences } from '@kit.ArkData';
import { pasteboard } from '@kit.BasicServicesKit';
import { deviceInfo } from '@kit.BasicServicesKit';
import { i18n } from '@kit.LocalizationKit';
import { HarmonyServices, StandardArgs } from './HarmonyServices';
import type { MeasureOptions } from '@ohos.measure';
import { notificationManager } from '@kit.NotificationKit';
import { HarmonyLinking } from './HarmonyLinking';
import { HarmonyApplicationServices, ApplicationArgs } from './HarmonyApplicationServices';
import { HarmonyRadioServices, RadioArgs } from './HarmonyRadioServices';
import { serviceError } from './HarmonyErrors';
import { systemDateTime } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';

// ANSERONUI_DEVTOOLS_BEGIN
interface DevtoolsCaptureRect { x:number; y:number; width:number; height:number; }
interface DevtoolsCaptureArgs { id: number; offset: number; sample: number; rect?: DevtoolsCaptureRect; }
class DevtoolsCaptureResult {
  chunk: string = ''; next: number = 0; ox: number = 0; oy: number = 0; ow: number = 0; oh: number = 0;
}
// ANSERONUI_DEVTOOLS_END

export interface Payload {
  type: string;
  revision?: number;
  requestId?: number;
  nodeId?: number;
  event?: string;
  targetId?: number;
  pointerId?: number;
  kind?: string;
  text?: string;
  fontSize?: number;
  maxWidth?: number;
  props?: TextProps;
  module?: string;
  method?: string;
  argument?: string;
  consumed?: boolean;
  code?: string;
  message?: string;
  stack?: string;
  errorName?: string;
  buildId?: string;
  commands?: Object[];
  transactionId?: number; baseRevision?: number; chunkCount?: number; commandCount?: number; totalBytes?: number; index?: number; data?: string;
  resetToken?: number; rejectedThroughTransactionId?: number;
  values?: Record<string, number>;
}
export interface DiagnosticDetails { code: string; message: string; stack?: string; errorName?: string; buildId?: string }

interface RenderCommand { type: string; nodeId: number; props?: RenderProperties; set?: RenderProperties; unset?: string[]; }
interface RenderProperties { animation?: string; }
interface TextProps { fontWeight?: string; fontStyle?: string; numberOfLines?: number; lineHeight?: number; }
interface Envelope {
  protocolMajor: number; protocolMinor: number; bundleBuildId: string;
  runtimeEpoch: number; surfaceId: number; surfaceGeneration: number;
  sequence: number; ackSequence: number; payload: Payload;
}
interface RenderLimits { messageBytes: number; transactionBytes: number; commandsPerMessage: number; commandsPerTransaction: number; }
interface Handshake { type: string; requiredNodes: string[]; capabilities: string[]; limits: RenderLimits; }
interface CreateSurface { type: string; page: string; width: number; height: number; visible: boolean; }
interface EnvironmentChanged { type: string; version: number; }
interface Resize { type: string; width: number; height: number; }
interface Visibility { type: string; visible: boolean; }
interface Inspection { type: string; enabled: boolean; reset: boolean; }
interface Ack { type: string; revision: number; reason?: string; }
interface Result { type: string; requestId: number; ok: boolean; value: string; }
interface Measurement { type: string; requestId: number; nodeId: number; width: number; height: number; baseline: number; }
interface AccessibilityArgs { message?: string; }
export interface ServiceArgs {
  milliseconds?: number; url?: string; method?: string; body?: string; timeout?: number; headers?: Record<string, string>;
  namespace?: string; key?: string; value?: string; text?: string;
  title?: string; message?: string; options?: string[]; module?: string;
  page?: string; params?: Object; nodeId?: number; args?: Object;
  id?: string; permission?: string;
}
export interface HarmonyExtension {
  supports(module: string, method: string): boolean;
  invoke(module: string, method: string, args: string): Promise<Object | null>;
  dispose(): void;
}

/** All host callbacks execute on the UI thread. Core entry stays on a fixed native worker. */
export class HarmonyHost {
  readonly content: NodeContent = new NodeContent();
  private worker: number = 0;
  private animations: HarmonyAnimation | null = null;
  private media: HarmonyMedia | null = null;
  private events: HarmonyEvents = new HarmonyEvents();
  private services: HarmonyServices | null = null;
  private applicationServices: HarmonyApplicationServices | null = null;
  private radio: HarmonyRadioServices | null = null;
  private systemWindow: window.Window | null = null;
  private avoidListener: (value: window.AvoidAreaOptions) => void = () => { this.events.emit('window', this.metrics()); };
  private netConnection: connection.NetConnection | null = null;
  private active: boolean = true;
  private dark: boolean = false;
  private environmentVersion: number = 0;
  private keyboardListener: (height: number) => void = (height: number) => { this.events.emit('keyboard', new KeyboardValue(height > 0, this.ui.px2vp(height))); };
  private configListener: (configuration: Configuration) => void = (configuration: Configuration) => { this.setAppearance(configuration.colorMode === 0); this.environmentChanged(); };

  private transitions: Map<number, AnimationOptions> = new Map();
  // ANSERONUI_DEVTOOLS_BEGIN
  readonly devtoolsRootId: string = 'anseronui-shot-' + Date.now() + '-' + Math.random();
  private devtoolsImage: string = '';
  private devtoolsRect: DevtoolsCaptureResult = new DevtoolsCaptureResult();
  private async devtoolsCapture(args: DevtoolsCaptureArgs): Promise<DevtoolsCaptureResult> {
    const offset = args.offset ?? 0;
    if (offset === 0) {
      const pixelMap = await this.ui.getComponentSnapshot().get(this.devtoolsRootId);
      const packer = image.createImagePacker();
      try {
        const info = await pixelMap.getImageInfo();
        const ratio = info.size.width / this.width;
        const r = args.id > 0 ? args.rect : undefined;
        if (r) await pixelMap.crop({x:Math.max(0,Math.round(r.x*ratio)), y:Math.max(0,Math.round(r.y*ratio)), size:{width:Math.min(info.size.width,Math.round(r.width*ratio)),height:Math.min(info.size.height,Math.round(r.height*ratio))}});
        const scale = Math.min(1 / (args.sample ?? 1), 2048 / info.size.width, 2048 / info.size.height);
        await pixelMap.scale(scale, scale);
        const bytes = await packer.packing(pixelMap, {format:'image/png', quality:100});
        if (bytes.byteLength > 1500000) throw new Error('CAPTURE_TOO_LARGE');
        this.devtoolsImage = 'data:image/png;base64,' + new util.Base64Helper().encodeToStringSync(new Uint8Array(bytes));
        this.devtoolsRect.ox = r?.x ?? 0; this.devtoolsRect.oy = r?.y ?? 0;
        this.devtoolsRect.ow = r?.width ?? this.width; this.devtoolsRect.oh = r?.height ?? this.height;
      } finally { await pixelMap.release(); await packer.release(); }
    }
    if (offset < 0 || offset >= this.devtoolsImage.length) throw new Error('INVALID_CAPTURE_OFFSET');
    const result = new DevtoolsCaptureResult();
    result.ox=this.devtoolsRect.ox; result.oy=this.devtoolsRect.oy; result.ow=this.devtoolsRect.ow; result.oh=this.devtoolsRect.oh;
    result.chunk = this.devtoolsImage.slice(offset,offset+24000);
    result.next = offset+24000<this.devtoolsImage.length ? offset+24000 : 0;
    return result;
  }
  // ANSERONUI_DEVTOOLS_END
  private renderer: number = 0;
  private sequence: number = 0;
  private outputSequence: number = 0;
  private closed: boolean = false;
  private ready: boolean = false;
  private visible: boolean = true;
  private width: number = 0;
  private height: number = 0;
  private stopLinking: (() => void) | null = null;
  private destroying: boolean = false;
  private cancellations: Map<number, () => void> = new Map();
  private backWaiter: ((consumed: boolean) => void) | null = null;
  private backDeadline: number = -1;
  onFailure: (reason: string) => void = () => {};
  onReady: () => void = () => {};
  onRuntimeStats: (values: Record<string, number>) => void = () => {};
  private profiling: boolean = false;
  private hostMetrics: Record<string, number> = {};
  private encoder: util.TextEncoder = new util.TextEncoder();
  onDiagnosticDetails: (diagnostic: DiagnosticDetails) => void = () => {};
  onDiagnostic: (code: string, message: string) => void = (code: string, message: string) => console.warn('AnseronUI ' + code + ': ' + message);
  router: (method: string, args: ServiceArgs) => Object | null = () => { throw new Error('UNSUPPORTED: router'); };
  extensions: HarmonyExtension[] = [];
  private context: common.UIAbilityContext;
  private ui: UIContext;
  readonly buildId: string;
  readonly page: string;
  constructor(context: common.UIAbilityContext, ui: UIContext, buildId: string, page: string) { this.context = context; this.ui = ui; this.buildId = buildId; this.page = page; }
  private clock(): number { return this.profiling ? systemDateTime.getUptime(systemDateTime.TimeType.STARTUP, true) / 1000000 : 0; }
  private metric(name: string, value: number): void { if (this.profiling) this.hostMetrics[name] = (this.hostMetrics[name] ?? 0) + value; }
  inspectRuntime(enabled: boolean = true, reset: boolean = false): void {
    if (!this.worker || this.closed) return;
    this.profiling = enabled; if (reset) this.hostMetrics = {};
    native.profile(this.worker, enabled, reset);
    const request: Inspection = { type: 'InspectRuntime', enabled, reset }; this.send(request);
  }

  start(width: number, height: number): void {
    if (this.worker !== 0 || this.closed || width < 0 || height < 0) throw new Error('INVALID_START');
    this.width = width; this.height = height;
    this.media = new HarmonyMedia(this.ui, (node: number, event: Object) => { if (!this.closed && this.renderer) native.mediaEvent(this.renderer,node,JSON.stringify(event)); });
    this.services = new HarmonyServices(this.context, (module: string, value: Object) => this.events.emit(module, value));
    this.applicationServices = new HarmonyApplicationServices(this.context);
    this.radio = new HarmonyRadioServices(this.context, value => this.events.emit('bluetooth', value));
    this.events.onChange = (module: string, enabled: boolean) => { if (module === 'location') this.services?.watchLocation(enabled); };
    this.stopLinking = HarmonyLinking.listen(url => this.events.emit('linking', url));
    this.media.visible(this.visible);
    this.ui.runScopedTask(() => { this.renderer = native.mount(this.content, (event: Object) => this.send(event), this.media!, this.ui.vp2px(1)); });
    native.visibility(this.renderer, this.visible);
    native.appearance(this.renderer, this.context.config.colorMode === 0);
    void this.startEnvironment();
    this.worker = native.open((bytes: string) => this.receive(bytes));
    const handshake: Handshake = { type: 'Handshake', capabilities: ['patchProps', 'detachChild', 'commitChunks', 'resetSurface', 'inputRevision'], limits: { messageBytes:1048576, transactionBytes:16777216, commandsPerMessage:4096, commandsPerTransaction:65536 }, requiredNodes: ['View', 'Text', 'RichText', 'TextInput', 'ScrollView', 'Image', 'Video', 'Native'] };
    this.send(handshake);
  }
  private send(payload: Object): void {
    if (this.closed || this.worker === 0) return;
    if (this.sequence >= 0xffffffff) { this.fail('INPUT_SEQUENCE_EXHAUSTED'); return; }
    const envelope: Envelope = { protocolMajor: 2, protocolMinor: 0, bundleBuildId: this.buildId,
      runtimeEpoch: 1, surfaceId: 1, surfaceGeneration: 1, sequence: this.sequence + 1,
      ackSequence: this.outputSequence, payload: payload as Payload };
    const encodeStart = this.clock();
    const bytes = JSON.stringify(envelope);
    this.metric('bridgeEncodeMs', this.clock() - encodeStart);
    if (this.profiling) this.metric('bridgeInputBytes', this.encoder.encodeInto(bytes).byteLength);
    if (bytes.length > 1048576) { this.fail('INPUT_MESSAGE_LIMIT'); return; }
    const event = payload as Payload;
    // Native replaces only the queued tail, atomically with the worker taking
    // inputs. Reuse that slot's sequence; never drop an already numbered input.
    const motionKey = event.type === 'NativeEvent' && event.event === 'touchMove' ?
      'touchMove:' + event.nodeId + ':' + event.targetId + ':' + event.pointerId : '';
    try {
      const started = this.clock();
      this.sequence = native.post(this.worker, bytes, motionKey, envelope.sequence);
      this.metric('adapterPostMs', this.clock() - started);
    } catch (error) { this.fail(String(error)); }
  }
  private receive(bytes: string): void {
    if (this.closed) return;
    try {
      if (bytes.startsWith('!') || bytes.length > 1048576) throw new Error(bytes);
      const decodeStart = this.clock();
      const outputs = JSON.parse(bytes) as Envelope[];
      this.metric('bridgeDecodeMs', this.clock() - decodeStart);
      if (this.profiling) this.metric('bridgeOutputBytes', this.encoder.encodeInto(bytes).byteLength);
      if (!Array.isArray(outputs) || outputs.length > 4096) throw new Error('INVALID_OUTPUT_BATCH');
      for (const envelope of outputs) {
        if (envelope.protocolMajor !== 2 || envelope.protocolMinor > 0 || envelope.bundleBuildId !== this.buildId ||
          envelope.runtimeEpoch !== 1 || envelope.surfaceId !== 1 || envelope.surfaceGeneration !== 1 ||
          envelope.sequence !== this.outputSequence + 1 || envelope.ackSequence > this.sequence) throw new Error('INVALID_OUTPUT_ENVELOPE');
        this.outputSequence = envelope.sequence;
        this.output(envelope.payload);
        if (this.closed) break;
      }
    } catch (error) { this.fail(String(error)); }
  }
  private commitHeader: Payload | null = null;
  private commitChunks: Map<number, string> = new Map();
  private commitBytes: number = 0;
  private commitCount: number = 0;
  private rejectedThrough: number = 0;
  private lastCommit: Payload | null = null;
  private utf8Length(value: string): number {
    let size = 0;
    for (let i = 0; i < value.length; i++) { const c = value.charCodeAt(i); if (c < 128) size++; else if (c < 2048) size += 2; else if (c >= 0xd800 && c <= 0xdbff && i + 1 < value.length) { size += 4; i++; } else size += 3; }
    return size;
  }
  private assemble(p: Payload): Payload | null {
    if (p.type === 'CommitBegin') {
      if (p.transactionId! <= this.rejectedThrough || p.chunkCount! < 1 || p.chunkCount! > 65536 || p.commandCount! > 65536 || p.totalBytes! > 16777216) throw new Error('INVALID_COMMIT_BEGIN');
      if (this.commitHeader) { if (JSON.stringify(this.commitHeader) !== JSON.stringify(p)) throw new Error('CONFLICTING_COMMIT_BEGIN'); return null; }
      this.commitHeader = p; this.commitChunks.clear(); this.commitBytes = 0; this.commitCount = 0; return null;
    }
    if (p.type === 'CommitChunk') {
      const header = this.commitHeader;
      if (!header || header.transactionId !== p.transactionId || p.index! < 0 || p.index! >= header.chunkCount!) throw new Error('INVALID_COMMIT_CHUNK');
      if (this.commitChunks.has(p.index!)) { if (this.commitChunks.get(p.index!) !== p.data!) throw new Error('CONFLICTING_COMMIT_CHUNK'); return null; }
      const commands = JSON.parse(p.data!) as Object[];
      if (commands.length > 4096) throw new Error('COMMAND_LIMIT');
      this.commitBytes += this.utf8Length(p.data!) - 2 + (commands.length > 0 ? 1 : 0); this.commitCount += commands.length;
      if (this.commitBytes > header.totalBytes! || this.commitCount > header.commandCount!) throw new Error('COMMIT_BUFFER_LIMIT');
      this.commitChunks.set(p.index!, p.data!); return null;
    }
    if (p.type === 'CommitEnd') {
      if (!this.commitHeader && this.lastCommit?.revision === p.transactionId) return this.lastCommit;
      const header = this.commitHeader;
      if (!header || header.transactionId !== p.transactionId || this.commitChunks.size !== header.chunkCount || this.commitCount !== header.commandCount || this.commitBytes + 1 !== header.totalBytes) throw new Error('INCOMPLETE_COMMIT');
      const chunks: string[] = []; for (let i = 0; i < header.chunkCount!; i++) { const chunk = this.commitChunks.get(i)!; chunks.push(chunk.substring(1, chunk.length - 1)); }
      const commands = JSON.parse('[' + chunks.join(',') + ']') as Object[];
      const result: Payload = { type: 'Commit', revision: header.revision, commands };
      this.commitHeader = null; this.commitChunks.clear(); this.lastCommit = result; return result;
    }
    return p;
  }
  private output(incoming: Payload): void {
    const assembled = this.assemble(incoming); if (!assembled) return; const p = assembled;
    switch (p.type) {
      case 'Ready': {
        if (this.ready) throw new Error('DUPLICATE_READY');
        this.ready = true;
        const create: CreateSurface = { type: 'CreateSurface', page: this.page, width: this.width, height: this.height, visible: this.visible };
        this.send(create); this.onReady(); break;
      }
      case 'ResetSurface': {
        this.ui.runScopedTask(() => native.commit(this.renderer, JSON.stringify(p)));
        this.animations?.dispose(); this.animations = null; this.transitions.clear();
        this.commitHeader = null; this.commitChunks.clear(); this.lastCommit = null; this.rejectedThrough = Math.max(this.rejectedThrough, p.rejectedThroughTransactionId!);
        const ack: Payload = { type: 'ResetAck', resetToken: p.resetToken }; this.send(ack); break;
      }
      case 'Commit': {
        try {
          const previous: Map<number, VisualValues> = new Map();
          const commands = p.commands as RenderCommand[];
          for (const command of commands) {
            if (command.type === 'RemoveNode') { this.animations?.cancel(command.nodeId); this.transitions.delete(command.nodeId); }
            if (command.type === 'PatchProps' && (command.set?.animation || command.unset?.includes('animation'))) { if (command.set?.animation) this.transitions.set(command.nodeId, JSON.parse(command.set.animation) as AnimationOptions); else this.transitions.delete(command.nodeId); }
            if (command.type === 'SetProps') { if (command.props?.animation) this.transitions.set(command.nodeId, JSON.parse(command.props.animation) as AnimationOptions); else this.transitions.delete(command.nodeId); }
            if ((command.type === 'SetProps' || command.type === 'PatchProps' || command.type === 'SetFrame') && this.transitions.has(command.nodeId) && !previous.has(command.nodeId)) {
              try { previous.set(command.nodeId, this.animationClock().snapshot(command.nodeId)); } catch (_error) { /* First mount is immediate. */ }
            }
          }
          const applyStart = this.clock();
          this.ui.runScopedTask(() => native.commit(this.renderer, JSON.stringify(p)));
          this.metric('rendererApplyMs', this.clock() - applyStart); this.metric('hostCommits', 1);
          previous.forEach((value: VisualValues, node: number) => { const clock = this.animationClock(); void clock.animate(node, { style: clock.snapshot(node), options: this.transitions.get(node) }, value); });
        }
        catch (error) { const failed: Ack = { type: 'CommitFailed', revision: p.revision!, reason: String(error) }; this.send(failed); break; }
        const ack: Ack = { type: 'CommitAck', revision: p.revision! }; this.send(ack); break;
      }
      case 'MeasureRequest': {
        const measureStart = this.clock();
        // Native system fonts use fp; layout units and returned sizes use vp.
        // ArkUI returns the paragraph's constraint width even when its text
        // fits on a shorter line. Core needs the intrinsic width to implement
        // alignItems:center/end; otherwise the Text fills its parent and its
        // left-aligned glyphs remain at the parent's leading edge. Measure
        // plain Text naturally first, then constrain it only when wrapping.
        // Preserve the existing input and rich-span measurement paths.
        const intrinsic = p.kind === 'Text';
        const measure = this.ui.getMeasureUtils();
        const options: MeasureOptions = { textContent: p.text ?? '',
          fontSize: p.fontSize ?? 16, fontWeight: p.props?.fontWeight ?? 'normal',
          fontStyle: p.props?.fontStyle === 'italic' ? FontStyle.Italic : FontStyle.Normal,
          maxLines: p.props?.numberOfLines, lineHeight: p.props?.lineHeight,
          constraintWidth: !intrinsic && p.maxWidth && p.maxWidth > 0 ? p.maxWidth + 'vp' : undefined };
        let size = measure.measureTextSize(options);
        if (p.kind === 'Text' && p.maxWidth !== undefined && p.maxWidth > 0 && this.ui.px2vp(Number(size.width)) > p.maxWidth) {
          size = measure.measureTextSize({ textContent: options.textContent,
            fontSize: options.fontSize, fontWeight: options.fontWeight, fontStyle: options.fontStyle,
            maxLines: options.maxLines, lineHeight: options.lineHeight, constraintWidth: p.maxWidth + 'vp' });
        }
        let width = this.ui.px2vp(Number(size.width)), height = this.ui.px2vp(Number(size.height));
        // Core quantizes logical frames. Round text outward with a vp of slack
        // so rounding cannot wrap the last word of an otherwise intrinsic line.
        if (p.kind === 'Text' || p.kind === 'RichText') width = Math.ceil(width) + 1;
        if (p.kind === 'TextInput') { width = Math.max(width, 120); height = Math.max(height, 32); }
        const result: Measurement = { type: 'MeasureResult', requestId: p.requestId!, nodeId: p.nodeId!,
          width: Math.min(width, p.maxWidth ?? width), height: height, baseline: Math.min(height, (p.fontSize ?? 16) * 0.8) };
        this.metric('hostMeasureMs', this.clock() - measureStart); this.send(result); break;
      }
      case 'InvokeModule': this.invoke(p); break;
      case 'CancelRequest': this.cancel(p.requestId!); break;
      case 'BackPressResult': {
        if (this.backWaiter) { const callback = this.backWaiter; this.backWaiter = null; clearTimeout(this.backDeadline); callback(p.consumed === true); }
        break;
      }
      case 'Diagnostic':
        try { this.onDiagnosticDetails({ code: p.code ?? 'UNKNOWN', message: p.message ?? '', stack: p.stack, errorName: p.errorName, buildId: p.buildId }); } catch (_) {}
        this.onDiagnostic(p.code ?? 'UNKNOWN', p.message ?? ''); break;
      case 'SurfaceDisposed': this.finish(); break;
      case 'RuntimeStats': {
        const values = p.values ?? {};
        const workerMetrics: Record<string, number> = native.performance(this.worker);
        for (const key of Object.keys(workerMetrics)) values[key] = workerMetrics[key];
        for (const key of Object.keys(this.hostMetrics)) values[key] = this.hostMetrics[key];
        this.onRuntimeStats(values); break;
      }
      default: throw new Error('UNKNOWN_OUTPUT: ' + p.type);
    }
  }
  private invoke(p: Payload): void {
    const id = p.requestId!;
    if (this.cancellations.size >= 1024 || this.cancellations.has(id)) throw new Error('REQUEST_LIMIT');
    let active = true;
    let cancelOperation: () => void = () => {};
    this.cancellations.set(id, () => { active = false; cancelOperation(); });
    const complete = (ok: boolean, value: Object | null): void => {
      if (!active || this.closed) return;
      active = false; this.cancellations.delete(id);
      const result: Result = { type: 'ModuleResult', requestId: id, ok: ok, value: '' };
      try { result.value = p.module === 'http' && p.method === 'getText' && ok ? value as string : ok ? JSON.stringify(value ?? null) : String(value); }
      catch (_error) { result.ok = false; result.value = 'IO_ERROR: module result is not JSON serializable'; }
      if (result.value.length > 65536) { result.ok = false; result.value = 'IO_ERROR: module result exceeds 65536 characters; use transfers for large files'; }
      this.send(result);
    };
    try {
      // ANSERONUI_DEVTOOLS_BEGIN
      if (p.module === '__devtools' && p.method === 'capture') {
        this.devtoolsCapture(JSON.parse(p.argument ?? '{}') as DevtoolsCaptureArgs).then(value => complete(true,value)).catch((error: Error) => complete(false,String(error)));
        return;
      }
      // ANSERONUI_DEVTOOLS_END
      if (p.module !== 'events' && p.module !== '__view' && !this.supports(p.module!, p.method!)) throw new Error('UNSUPPORTED: ' + p.module + '.' + p.method);
      const args: ServiceArgs = p.module === 'timer' ? { milliseconds: Number(p.argument) } : p.module === 'http' && p.method === 'getText' ? { url: p.argument } : (JSON.parse(p.argument ?? '{}') ?? {}) as ServiceArgs;
      if (p.module === 'events' && p.method === 'next') {
        cancelOperation = () => this.events.close(String(args.id ?? ''));
      }
      if (p.module === '__view') {
        if (p.method === 'animate') { const clock = this.animationClock(); cancelOperation = () => clock.cancel(args.nodeId!); clock.animate(args.nodeId!, args.args as AnimationRequest).then(value => complete(true, value)).catch((error: Error) => complete(false, String(error))); }
        else if (p.method === 'accessibilityAnnounce' || p.method === 'accessibilityFocus') {
          const values = args.args as AccessibilityArgs;
          if (p.method === 'accessibilityAnnounce' && (typeof values?.message !== 'string' || !values.message.length || values.message.length > 16384)) throw new Error('INVALID_ACCESSIBILITY_MESSAGE');
          let target = '';
          this.ui.runScopedTask(() => { target = native.invokeView(this.renderer, args.nodeId!, p.method!, JSON.stringify(args.args ?? null)) as string; });
          const event = new accessibility.EventInfo(p.method === 'accessibilityFocus' ? 'requestFocusForAccessibility' : 'announceForAccessibility', this.context.abilityInfo.bundleName, 'common');
          if (p.method === 'accessibilityFocus') event.customId = target;
          else event.textAnnouncedForAccessibility = values.message!;
          accessibility.sendAccessibilityEvent(event).then(() => complete(true, null)).catch((error: Error) => complete(false, serviceError(error)));
        }
        else if (p.method === 'cancelAnimation') { this.animations?.cancel(args.nodeId!); complete(true, null); }
        else {
          let result: Object | null = null;
          // Requests arrive through a native worker callback, outside ArkUI's scope.
          this.ui.runScopedTask(() => { result = native.invokeView(this.renderer, args.nodeId!, p.method!, JSON.stringify(args.args ?? null)); });
          Promise.resolve<Object | null>(result ?? null).then(value => complete(true, value)).catch((error: Error) => complete(false, serviceError(error)));
        }
      } else if (p.module === 'timer' && p.method === 'sleep') {
        const ms = args.milliseconds!;
        if (!Number.isFinite(ms) || ms < 0 || ms > 2147483647) throw new Error('INVALID_ARGUMENT: milliseconds');
        const timer = setTimeout(() => complete(true, null), ms);
        cancelOperation = () => clearTimeout(timer);
      } else if (p.module === 'http') {
        if (!/^https?:\/\//i.test(args.url ?? '')) throw new Error('INVALID_ARGUMENT: URL');
        if (args.timeout !== undefined && (!Number.isFinite(args.timeout) || args.timeout <= 0)) throw new Error('INVALID_ARGUMENT: timeout');
        const request = http.createHttp();
        cancelOperation = () => request.destroy();
        request.request(args.url!, { method: (args.method ?? 'GET') as http.RequestMethod,
          extraData: args.body, header: args.headers, expectDataType: http.HttpDataType.STRING,
          connectTimeout: Math.min(args.timeout ?? 30000, 120000), readTimeout: Math.min(args.timeout ?? 30000, 120000),
          usingCache: false, maxLimit: 65536 }).then(response => {
          request.destroy();
          if (p.method === 'getText') { if (response.responseCode < 200 || response.responseCode >= 300) complete(false, 'IO_ERROR: HTTP ' + response.responseCode); else complete(true, response.result as string); }
          else complete(true, new HttpResponseValue(response.responseCode, response.result as string, response.header as Record<string, Object>));
        }).catch((error: Error) => { request.destroy(); complete(false, 'IO_ERROR: ' + String(error)); });
      } else {
        const operation = this.radio?.supports(p.module!, p.method!)
          ? this.radio.invoke(p.module!, p.method!, JSON.parse(p.argument ?? '{}') as RadioArgs, action => { cancelOperation = action; })
          : this.applicationServices?.supports(p.module!, p.method!)
          ? this.applicationServices.invoke(p.module!, p.method!, args as ApplicationArgs)
          : this.services?.supports(p.module!, p.method!)
          ? this.services.invoke(p.module!, p.method!, args as StandardArgs, action => { cancelOperation = action; })
          : this.service(p.module!, p.method!, args);
        operation.then(value => complete(true, value)).catch((error: Error) => complete(false, serviceError(error)));
      }
    } catch (error) { try { cancelOperation(); } catch (_cleanupError) {} complete(false, serviceError(error as Object)); }
  }
  private animationClock(): HarmonyAnimation { if (!this.animations) { this.animations = new HarmonyAnimation(this.renderer); this.animations.setVisible(this.visible); } return this.animations; }
  private async service(module: string, method: string, args: ServiceArgs): Promise<Object | null> {
    if (module === 'events') { if (method === 'next') { if (!this.supports(args.module ?? '', 'subscribe')) throw new Error('UNSUPPORTED: events.' + args.module); return await this.events.next(String(args.id ?? ''), String(args.module ?? '')); } if (method === 'close') { this.events.close(String(args.id ?? '')); return null; } }
    if (module === 'router') return this.router(method, args);
    if (module === 'capabilities' && method === 'has') return this.supports(args.module!, args.method);
    if (module === 'storage') {
      const store = await preferences.getPreferences(this.context, { name: 'anseronui' });
      const prefix = module + ':' + encodeURIComponent(args.namespace ?? 'default') + ':';
      const key = prefix + (args.key ?? '');
      if (method === 'get') return await store.has(key) ? await store.get(key, '') as string : null;
      if (method === 'set') { await store.put(key, args.value!); await store.flush(); return null; }
      if (method === 'remove') { await store.delete(key); await store.flush(); return null; }
      const values = await store.getAll();
      const keys = Object.keys(values).filter(key => key.startsWith(prefix));
      if (method === 'keys') return keys.map(key => key.substring(prefix.length)).sort();
      if (method === 'clear') { for (const key of keys) await store.delete(key); await store.flush(); return null; }
    }
    if (module === 'clipboard') {
      const board = pasteboard.getSystemPasteboard();
      if (method === 'writeText') { await board.setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, args.text!)); return null; }
      if (method === 'readText') return (await board.getData()).getPrimaryText();
    }
    if (module === 'keyboard' && method === 'dismiss') { await inputMethod.getController().stopInputSession(); return null; }
    if (module === 'network' && method === 'getStatus') return await this.networkStatus();
    if (module === 'permissions' && (method === 'check' || method === 'request')) {
      let name: Permissions;
      if (args.permission === 'notifications') {
        if (method === 'request') { await notificationManager.requestEnableNotification(this.context); }
        return await notificationManager.isNotificationEnabled() ? 'granted' : 'denied';
      }
      switch (args.permission) { case 'location': name = 'ohos.permission.APPROXIMATELY_LOCATION'; break; case 'camera': name = 'ohos.permission.CAMERA'; break; case 'microphone': name = 'ohos.permission.MICROPHONE'; break; case 'photos': name = 'ohos.permission.READ_IMAGEVIDEO'; break; default: return 'unsupported'; }
      const manager = abilityAccessCtrl.createAtManager();
      if (method === 'request') { const result = await manager.requestPermissionsFromUser(this.context, [name]); return result.authResults[0] === 0 ? 'granted' : 'denied'; }
      return await manager.checkAccessToken(this.context.applicationInfo.accessTokenId, name) === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED ? 'granted' : 'denied';
    }
    if (module === 'dialogs' && (method === 'alert' || method === 'confirm')) {
      const result = await this.ui.getPromptAction().showDialog({ title: args.title, message: args.message,
        buttons: method === 'alert' ? [{ text: '确定', color: '#3559dc' }] : [{ text: '取消', color: '#666666' }, { text: '确定', color: '#3559dc' }] });
      return method === 'confirm' ? result.index === 1 : null;
    }
    if (module === 'dialogs' && method === 'actionSheet') {
      const options = args.options ?? []; if (options.length === 0 || options.length > 6) throw new Error('INVALID_ARGUMENT: options');
      const buttons: [promptAction.Button,promptAction.Button?,promptAction.Button?,promptAction.Button?,promptAction.Button?,promptAction.Button?] = [{ text: options[0], color: '#3559dc' }];
      if (options.length > 1) buttons[1] = { text: options[1], color: '#3559dc' };
      if (options.length > 2) buttons[2] = { text: options[2], color: '#3559dc' };
      if (options.length > 3) buttons[3] = { text: options[3], color: '#3559dc' };
      if (options.length > 4) buttons[4] = { text: options[4], color: '#3559dc' };
      if (options.length > 5) buttons[5] = { text: options[5], color: '#3559dc' };
      const result = await this.ui.getPromptAction().showActionMenu({ title: args.title, buttons }); return result.index;
    }
    if (module === 'app' && method === 'getInfo') { const info = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT); return new AppInfo(this.context.applicationInfo.name, this.context.abilityInfo.bundleName, info.versionName, String(info.versionCode)); }
    if (module === 'linking') {
      if (method === 'openURL') { if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(args.url ?? '')) throw new Error('INVALID_ARGUMENT: URL'); await this.context.openLink(args.url!); return null; }
      if (method === 'canOpenURL') return bundleManager.canOpenLink(args.url!);
      if (method === 'openSettings') { await this.context.startAbility({ action: 'ohos.settings.app.access.details', parameters: { bundleName: this.context.abilityInfo.bundleName } }); return null; }
      if (method === 'getInitialURL') return HarmonyLinking.getInitialURL();
    }
    if (module === 'device' && method === 'getInfo') return new DeviceInfo();
    if (module === 'locale' && method === 'getInfo') return new LocaleInfo();
    if (module === 'window' && method === 'getMetrics') return this.metrics();
    if (module === 'appState' && method === 'get') return this.active ? 'active' : 'background';
    if (module === 'appearance' && method === 'get') return this.dark ? 'dark' : 'light';
    for (const extension of this.extensions) if (extension.supports(module, method)) return extension.invoke(module, method, JSON.stringify(args));
    if (native.supportsModule(module, method)) return await native.invokeModule(module, method, JSON.stringify(args));
    throw new Error('UNSUPPORTED: ' + module + '.' + method);
  }
  private supports(module: string, method?: string): boolean {
    if (this.applicationServices?.supports(module, method) || this.radio?.supports(module, method)) return true;
    let methods: string[] = [];
    switch (module) {
      case 'storage': case 'secureStorage': methods = ['get', 'set', 'remove', 'keys', 'clear']; break;
      case 'timer': methods = ['sleep']; break;
      case 'http': methods = ['getText', 'request']; break;
      case 'router': methods = ['push', 'replace', 'back', 'pop', 'current', 'getParams']; break;
      case 'clipboard': methods = ['readText', 'writeText']; break;
      case 'dialogs': methods = ['alert', 'confirm', 'actionSheet']; break;
      case 'app': case 'device': case 'locale': methods = ['getInfo']; break;
      case 'window': methods = ['getMetrics', 'subscribe']; break;
      case 'appearance': case 'appState': methods = ['get', 'subscribe']; break;
      case 'linking': methods = ['openURL','canOpenURL','openSettings','getInitialURL','subscribe']; break;
      case 'share': methods = ['text','file']; break;
      case 'media': methods = ['pickPhoto']; break;
      case 'files': methods = ['pickDocument','release']; break;
      case 'transfers': methods = ['download','upload','cancel','subscribe']; break;
      case 'haptics': methods = ['impact','notification','selection']; break;
      case 'location': methods = ['getCurrentPosition','watchPosition','subscribe']; break;
      case 'keyboard': methods = ['dismiss', 'subscribe']; break;
      case 'network': methods = ['getStatus', 'subscribe']; break;
      case 'permissions': methods = ['check', 'request']; break;
      case 'capabilities': methods = ['has']; break;
    }
    if (method === undefined) return methods.length > 0 || native.supportsModule(module, '');
    return native.supportsModule(module, method) || methods.includes(method) || this.extensions.some(extension => extension.supports(module, method));
  }
  private async networkStatus(): Promise<NetworkValue> {
    const net = await connection.getDefaultNet();
    if (!net.netId) return new NetworkValue(false, 'none');
    const caps = await connection.getNetCapabilities(net);
    return new NetworkValue(caps.networkCap?.includes(connection.NetCap.NET_CAPABILITY_INTERNET) ?? false,
      caps.bearerTypes.includes(connection.NetBearType.BEARER_WIFI) ? 'wifi' : caps.bearerTypes.includes(connection.NetBearType.BEARER_CELLULAR) ? 'cellular' : caps.bearerTypes.includes(connection.NetBearType.BEARER_ETHERNET) ? 'ethernet' : 'unknown');
  }
  private async startEnvironment(): Promise<void> {
    this.dark = this.context.config.colorMode === 0;
    try {
      const current = await window.getLastWindow(this.context);
      if (this.closed) return;
      this.systemWindow = current; current.on('keyboardHeightChange', this.keyboardListener);
      current.on('avoidAreaChange', this.avoidListener);
      this.events.emit('window', this.metrics());
      const net = connection.createNetConnection();
      net.on('netAvailable', () => { void this.networkStatus().then(value => this.events.emit('network', value)).catch(() => {}); });
      net.on('netLost', () => this.events.emit('network', new NetworkValue(false,'none')));
      net.on('netCapabilitiesChange', () => { void this.networkStatus().then(value => this.events.emit('network', value)).catch(() => {}); });
      net.register(() => {}); this.netConnection = net;
    } catch (error) { this.onDiagnostic('ENVIRONMENT_UNAVAILABLE', String(error)); }
  }
  setActive(active: boolean): void { if (this.active === active) return; this.active = active; this.radio?.setActive(active && this.visible); this.events.emit('appState',active ? 'active' : 'background'); }
  private environmentChanged(): void { if (this.ready && !this.closed) { const payload: EnvironmentChanged = { type: 'EnvironmentChanged', version: ++this.environmentVersion }; this.send(payload); } }
  setAppearance(dark: boolean): void { if (this.dark === dark) return; this.dark = dark; if (this.renderer) native.appearance(this.renderer,dark); this.events.emit('appearance',dark ? 'dark' : 'light'); }
  private metrics(): WindowMetrics {
    const value = new WindowMetrics(this.width, this.height, this.ui.vp2px(1));
    if (this.systemWindow) {
      for (const type of [window.AvoidAreaType.TYPE_SYSTEM, window.AvoidAreaType.TYPE_CUTOUT, window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR]) {
        const area = this.systemWindow.getWindowAvoidArea(type);
        value.safeArea.top = Math.max(value.safeArea.top, this.ui.px2vp(area.topRect.height));
        value.safeArea.bottom = Math.max(value.safeArea.bottom, this.ui.px2vp(area.bottomRect.height));
        value.safeArea.left = Math.max(value.safeArea.left, this.ui.px2vp(area.leftRect.width));
        value.safeArea.right = Math.max(value.safeArea.right, this.ui.px2vp(area.rightRect.width));
      }
    }
    return value;
  }
  resize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) return;
    this.width = width; this.height = height;
    this.events.emit('window', this.metrics());
    if (this.ready) { const payload: Resize = { type: 'Resize', width: width, height: height }; this.send(payload); }
  }
  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    if (this.renderer) native.visibility(this.renderer, visible);
    this.media?.visible(visible);
    this.animations?.setVisible(visible);
    this.radio?.setActive(visible && this.active);

    if (this.ready) { const payload: Visibility = { type: 'SurfaceVisibility', visible: visible }; this.send(payload); }
  }
  back(callback: (consumed: boolean) => void): void {
    if (this.closed) { callback(false); return; }
    // Protocol 1.5 has no back request ID. Never overlap transactions.
    if (this.backWaiter) return;
    this.backWaiter = callback;
    this.backDeadline = setTimeout(() => { this.fail('BACK_PRESS_TIMEOUT'); callback(true); }, 1000);
    const payload: Payload = { type: 'BackPress' }; this.send(payload);
  }
  destroy(): void {
    if (this.closed || this.destroying) return;
    this.destroying = true;
    const payload: Payload = { type: 'DestroySurface' }; this.send(payload);
    // Close immediately after queued lifecycle messages have drained on the worker.
    setTimeout(() => this.finish(), 1000);
  }
  private cancel(id: number): void { const action = this.cancellations.get(id); this.cancellations.delete(id); if (action) action(); }
  private fail(reason: string): void { if (!this.closed) { console.error('AnseronUI failure: ' + reason); this.finish(); this.onFailure(reason); } }
  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    const cancellations = Array.from(this.cancellations.values()); this.cancellations.clear(); cancellations.forEach(action => cleanup(action));
    clearTimeout(this.backDeadline); this.backWaiter = null;
    const extensions = this.extensions; this.extensions = []; extensions.forEach(extension => cleanup(() => extension.dispose()));
    const stopLinking = this.stopLinking; this.stopLinking = null; if (stopLinking) cleanup(stopLinking);
    cleanup(() => this.events.dispose());
    cleanup(() => this.systemWindow?.off('keyboardHeightChange', this.keyboardListener));
    cleanup(() => this.systemWindow?.off('avoidAreaChange', this.avoidListener));
    cleanup(() => this.netConnection?.unregister(() => {}));
    this.systemWindow = null; this.netConnection = null;
    cleanup(() => this.animations?.dispose()); this.animations = null; this.transitions.clear();
    cleanup(() => this.services?.dispose()); this.services = null;
    cleanup(() => this.radio?.dispose()); this.radio = null; this.applicationServices = null;
    if (this.worker) cleanup((): void => { native.close(this.worker); });
    cleanup(() => this.media?.dispose()); this.media = null;
    if (this.renderer) cleanup((): void => { native.unmount(this.renderer); });
    this.worker = 0; this.renderer = 0;
  }
}
class HttpResponseValue {
  status: number; body: string; headers: Record<string, string> = {};
  constructor(status: number, body: string, headers: Record<string, Object>) {
    this.status = status; this.body = body;
    for (const key of Object.keys(headers)) this.headers[key] = String(headers[key]);
  }
}
class AppInfo { name: string; applicationId: string; version: string; build: string; constructor(name: string, id: string, version: string, build: string) { this.name = name; this.applicationId = id; this.version = version; this.build = build; } }
class DeviceInfo { platform: string = 'harmony'; model: string = deviceInfo.productModel; version: string = deviceInfo.osFullName; }
class LocaleInfo { language: string = i18n.System.getSystemLanguage(); region: string = i18n.System.getSystemRegion(); timezone: string = i18n.getTimeZone().getID(); }
class WindowMetrics { width: number; height: number; scale: number; safeArea: SafeArea = new SafeArea(); constructor(w: number, h: number, scale: number) { this.width = w; this.height = h; this.scale = scale; } }

class SafeArea { top: number = 0; right: number = 0; bottom: number = 0; left: number = 0; }

class KeyboardValue { visible: boolean; height: number; constructor(visible: boolean,height: number){ this.visible = visible;this.height = height; } }
class NetworkValue { connected: boolean; type: string; constructor(connected: boolean,type: string){this.connected = connected;this.type = type;} }
