/** The reference wire contract. IDs and counters are nonzero u32 values. */
export const PROTOCOL_MAJOR = 1;
export const PROTOCOL_MINOR = 3;
export const MAX_MESSAGE_BYTES = 1024 * 1024;
export const MAX_COMMANDS = 4096;

export type NodeKind = "View" | "Text" | "RichText" | "Button" | "TextInput" | "ScrollView" | "Image" | "Video" | "Native";
export type NativeEventKind = "nativeComponent" | "longPress" | "backPress" | "focus" | "blur" | "submit" | "scroll" | "scrollEnd" | "layout" | "touchDown" | "touchMove" | "touchUp" | "touchCancel" | "spanClick" | "loadSuccess" | "loadFailure" | "playStateDidChanged" | "playTimeDidChanged" | "firstFrameDidDisplay";
export type EventKind = "tap" | "changeText" | NativeEventKind;
export type NativeEvent = { type: "NativeEvent"; nodeId: number; revision: number; event: NativeEventKind;
  targetId?: number;
  value?: string; x?: number; y?: number; contentWidth?: number; contentHeight?: number;
  source?: string; state?: string; duration?: number; errorCode?: number;
  pageX?: number; pageY?: number; pointerId?: number; touches?: { x: number; y: number; pageX: number; pageY: number; pointerId: number }[] };
export type Frame = { x: number; y: number; width: number; height: number };
export type Scalar = string | number | boolean | null;
export type RenderProps = { [name: string]: Scalar };

export type RenderCommand =
  | { type: "CreateNode"; nodeId: number; kind: NodeKind; nativeName?: string }
  | { type: "InsertChild"; parentId: number; nodeId: number; index: number }
  | { type: "MoveChild"; parentId: number; nodeId: number; index: number }
  | { type: "RemoveNode"; nodeId: number }
  | { type: "SetProps"; nodeId: number; props: RenderProps }
  | { type: "SetFrame"; nodeId: number; frame: Frame }
  | { type: "BindEvent"; nodeId: number; event: EventKind; enabled: boolean };

export type InputPayload =
  | NativeEvent
  | { type: "Handshake"; requiredNodes: NodeKind[] }
  | { type: "CreateSurface"; page: string; width: number; height: number }
  | { type: "Resize"; width: number; height: number }
  | { type: "DestroySurface" }
  | { type: "BackPress" }
  | { type: "Tap"; nodeId: number; revision: number }
  | { type: "InputChange"; nodeId: number; revision: number; value: string; inputRevision: number }
  | { type: "MeasureResult"; requestId: number; nodeId: number; width: number; height: number; baseline: number }
  | { type: "CommitAck"; revision: number }
  | { type: "CommitFailed"; revision: number; reason: string }
  | { type: "ModuleResult"; requestId: number; ok: boolean; value: string };

export type OutputPayload =
  | { type: "Ready"; supportedNodes: NodeKind[] }
  | { type: "Commit"; revision: number; commands: RenderCommand[] }
  | { type: "MeasureRequest"; requestId: number; nodeId: number; kind: "Text" | "RichText" | "Button" | "TextInput"; text: string; fontSize: number; maxWidth: number; props?: RenderProps }
  | { type: "InvokeModule"; requestId: number; module: string; method: string; argument: string }
  | { type: "CancelRequest"; requestId: number }
  | { type: "BackPressResult"; consumed: boolean }
  | { type: "SurfaceDisposed" }
  | { type: "Diagnostic"; code: string; message: string };

export interface Envelope<T extends InputPayload | OutputPayload> {
  protocolMajor: number;
  protocolMinor: number;
  bundleBuildId: string;
  runtimeEpoch: number;
  surfaceId: number;
  surfaceGeneration: number;
  sequence: number;
  ackSequence: number;
  payload: T;
}

export function isU32(value: unknown, allowZero = false): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= (allowZero ? 0 : 1) && value <= 0xffffffff;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validString(value: unknown, maximum = 65536): value is string {
  return typeof value === "string" && value.length <= maximum;
}
function validSize(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function validFrame(value: unknown): boolean {
  return record(value) && Number.isFinite(value.x) && Number.isFinite(value.y) && validSize(value.width) && validSize(value.height);
}
function validKind(value: unknown): value is NodeKind {
  return value === "View" || value === "Text" || value === "RichText" || value === "Button" || value === "TextInput" || value === "ScrollView" || value === "Image" || value === "Video" || value === "Native";
}
function validEvent(value: unknown): value is EventKind {
  return value === "tap" || value === "changeText" || validNativeEvent(value);
}
function validNativeEvent(value: unknown): value is NativeEventKind {
  return value === "nativeComponent" || value === "longPress" || value === "backPress" || value === "focus" || value === "blur" || value === "submit" || value === "scroll" || value === "scrollEnd" || value === "layout" || value === "touchDown" || value === "touchMove" || value === "touchUp" || value === "touchCancel" || value === "spanClick" || value === "loadSuccess" || value === "loadFailure" || value === "playStateDidChanged" || value === "playTimeDidChanged" || value === "firstFrameDidDisplay";
}
export function validateAnimationOptions(value: unknown): void {
  if (!record(value)) throw new Error("INVALID_ANIMATION_OPTIONS");
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (key === "duration" || key === "delay") {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 600000) throw new Error("INVALID_ANIMATION_TIME");
    } else if (key === "iterations") {
      if (typeof v !== "number" || !Number.isInteger(v) || (v !== -1 && (v < 1 || v > 10000))) throw new Error("INVALID_ANIMATION_ITERATIONS");
    } else if (key === "easing") {
      if (!["linear", "easeIn", "easeOut", "easeInOut", "spring"].includes(String(v))) throw new Error("INVALID_ANIMATION_EASING");
    } else if (key === "autoreverse") {
      if (typeof v !== "boolean") throw new Error("INVALID_ANIMATION_AUTOREVERSE");
    } else throw new Error("INVALID_ANIMATION_OPTION");
  }
  if (value.duration === 0 && value.iterations === -1) throw new Error("INVALID_ANIMATION_INFINITE_ZERO_DURATION");
}
export function validateAnimationStyle(value: unknown): void {
  if (!record(value) || Object.keys(value).length === 0) throw new Error("INVALID_ANIMATION_STYLE");
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (key === "backgroundColor") {
      if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error("INVALID_ANIMATION_COLOR");
    } else {
      if (!["opacity", "translateX", "translateY", "scaleX", "scaleY", "rotate", "borderRadius"].includes(key) || typeof v !== "number" || !Number.isFinite(v)) throw new Error("INVALID_ANIMATION_STYLE");
      if ((key === "opacity" && (v < 0 || v > 1)) || (key === "borderRadius" && v < 0)) throw new Error("INVALID_ANIMATION_RANGE");
    }
  }
}
export function validProps(value: unknown): boolean {
  if (!record(value)) return false;
  const strings = ["text", "title", "value", "placeholder", "backgroundColor", "color", "borderColor", "placeholderTextColor", "testID", "accessibilityLabel", "src", "placeholderSrc", "resizeMode", "playControl", "spans", "nativeProps"];
  const booleans = ["disabled", "editable", "secureTextEntry", "autoCorrect", "scrollEnabled", "showsVerticalScrollIndicator", "controls", "autoplay", "loop", "muted"];
  const enums: Record<string, readonly string[]> = {
    fontWeight: ["normal", "bold"], fontStyle: ["normal", "italic"], textAlign: ["left", "center", "right"],
    textDecorationLine: ["none", "underline", "line-through"], overflow: ["visible", "hidden"], visibility: ["visible", "hidden"],
    ellipsizeMode: ["tail", "clip"], keyboardType: ["default", "email-address", "numeric", "decimal-pad", "phone-pad", "url"],
    returnKeyType: ["default", "done", "go", "next", "search", "send"], autoCapitalize: ["none", "sentences", "words", "characters"],
    resizeMode: ["cover", "contain", "stretch"], playControl: ["play", "pause", "stop"], touchAction: ["auto", "none", "pan-x", "pan-y"]
  };
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (key === "animation") { try { if (typeof item !== "string") return false; validateAnimationOptions(JSON.parse(item)); } catch { return false; } }
    else if (["translateX", "translateY", "scaleX", "scaleY", "rotate"].includes(key)) { if (typeof item !== "number" || !Number.isFinite(item)) return false; }
    else if (strings.includes(key)) { if (!validString(item)) return false; }
    else if (booleans.includes(key)) { if (typeof item !== "boolean") return false; }
    else if (key === "opacity") { if (!validSize(item) || item > 1) return false; }
    else if (["fontSize", "borderWidth", "borderRadius", "rate"].includes(key)) { if (!validSize(item) || (key === "rate" && item === 0)) return false; }
    else if (["inputRevision", "numberOfLines", "maxLength"].includes(key)) { if (!isU32(item, true)) return false; }
    else if (enums[key]) { if (typeof item !== "string" || !enums[key].includes(item)) return false; }
    else return false;
  }
  return true;
}
function validCommand(value: unknown): boolean {
  if (!record(value) || !isU32(value.nodeId)) return false;
  switch (value.type) {
    case "CreateNode": return validKind(value.kind) && (value.kind !== "Native" || (validString(value.nativeName, 128) && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(value.nativeName)));
    case "InsertChild":
    case "MoveChild": return isU32(value.parentId, true) && isU32(value.index, true);
    case "RemoveNode": return true;
    case "SetProps": return validProps(value.props);
    case "SetFrame": return validFrame(value.frame);
    case "BindEvent": return validEvent(value.event) && typeof value.enabled === "boolean";
    default: return false;
  }
}
function validPayload(value: Record<string, unknown>): boolean {
  switch (value.type) {
    case "Handshake": return Array.isArray(value.requiredNodes) && value.requiredNodes.length <= 32 && value.requiredNodes.every(validKind);
    case "CreateSurface": return validString(value.page, 128) && value.page.length > 0 && validSize(value.width) && validSize(value.height);
    case "Resize": return validSize(value.width) && validSize(value.height);
    case "DestroySurface":
    case "BackPress":
    case "SurfaceDisposed": return true;
    case "NativeEvent":
      if (!isU32(value.nodeId) || !isU32(value.revision) || !validNativeEvent(value.event)) return false;
      if (value.event === "nativeComponent") return validString(value.value);
      if (value.event === "submit") return validString(value.value);
      if (value.event === "loadSuccess" || value.event === "loadFailure") return validString(value.source) && (value.event !== "loadFailure" || isU32(value.errorCode));
      if (value.event === "playStateDidChanged") return ["playing", "paused", "ended", "error"].includes(String(value.state));
      if (value.event === "playTimeDidChanged") return validSize(value.x) && validSize(value.duration);
      if (["touchDown", "touchMove", "touchUp", "touchCancel"].includes(String(value.event))) {
        if (![value.x, value.y, value.pageX, value.pageY].every(Number.isFinite) || !isU32(value.pointerId, true) || (value.targetId !== undefined && !isU32(value.targetId)) || !Array.isArray(value.touches) || value.touches.length > 32) return false;
        return value.touches.every(point => record(point) && [point.x, point.y, point.pageX, point.pageY].every(Number.isFinite) && isU32(point.pointerId, true));
      }
      if (value.event === "spanClick") return validString(value.value, 10) && isU32(Number(value.value), true);
      if (value.event === "scroll" || value.event === "scrollEnd" || value.event === "layout") return Number.isFinite(value.x) && Number.isFinite(value.y) && validSize(value.contentWidth) && validSize(value.contentHeight);
      return true;
    case "Tap": return isU32(value.nodeId) && isU32(value.revision);
    case "InputChange": return isU32(value.nodeId) && isU32(value.revision) && isU32(value.inputRevision) && validString(value.value);
    case "MeasureResult": return isU32(value.requestId) && isU32(value.nodeId) && validSize(value.width) && validSize(value.height) && validSize(value.baseline);
    case "CommitAck": return isU32(value.revision);
    case "CommitFailed": return isU32(value.revision) && validString(value.reason, 4096);
    case "ModuleResult": return isU32(value.requestId) && typeof value.ok === "boolean" && validString(value.value);
    case "Ready": return Array.isArray(value.supportedNodes) && value.supportedNodes.length <= 32 && value.supportedNodes.every(validKind);
    case "Commit": return isU32(value.revision) && Array.isArray(value.commands) && value.commands.length <= MAX_COMMANDS && value.commands.every(validCommand);
    case "MeasureRequest": return isU32(value.requestId) && isU32(value.nodeId) && (value.kind === "Text" || value.kind === "RichText" || value.kind === "Button" || value.kind === "TextInput") && validString(value.text) && validSize(value.fontSize) && validSize(value.maxWidth) && (value.props === undefined || validProps(value.props));
    case "InvokeModule": return isU32(value.requestId) && (validString(value.module, 128) && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value.module)) && validString(value.method, 128) && validString(value.argument);
    case "CancelRequest": return isU32(value.requestId);
    case "BackPressResult": return typeof value.consumed === "boolean";
    case "Diagnostic": return validString(value.code, 128) && validString(value.message, 4096);
    default: return false;
  }
}

/** Reject malformed envelopes before any surface mutation. */
export function validateEnvelope<T extends InputPayload | OutputPayload>(value: unknown): asserts value is Envelope<T> {
  if (!record(value)) throw new Error("PROTOCOL_ENVELOPE");
  if (value.protocolMajor !== PROTOCOL_MAJOR || !isU32(value.protocolMinor, true)) throw new Error("PROTOCOL_VERSION");
  if (typeof value.bundleBuildId !== "string" || value.bundleBuildId.length === 0 || value.bundleBuildId.length > 128) throw new Error("PROTOCOL_BUILD_ID");
  for (const field of ["runtimeEpoch", "surfaceId", "surfaceGeneration", "sequence"] as const) {
    if (!isU32(value[field])) throw new Error("PROTOCOL_" + field);
  }
  if (!isU32(value.ackSequence, true)) throw new Error("PROTOCOL_ackSequence");
  if (!record(value.payload) || !validPayload(value.payload)) throw new Error("PROTOCOL_PAYLOAD");
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function encodeEnvelope<T extends InputPayload | OutputPayload>(envelope: Envelope<T>): Uint8Array {
  validateEnvelope<T>(envelope);
  const bytes = encoder.encode(JSON.stringify(envelope));
  if (bytes.length > MAX_MESSAGE_BYTES) throw new Error("PROTOCOL_MESSAGE_TOO_LARGE");
  return bytes;
}

export function decodeEnvelope<T extends InputPayload | OutputPayload>(bytes: Uint8Array): Envelope<T> {
  if (bytes.length > MAX_MESSAGE_BYTES) throw new Error("PROTOCOL_MESSAGE_TOO_LARGE");
  const value: unknown = JSON.parse(decoder.decode(bytes));
  validateEnvelope<T>(value);
  return value;
}
