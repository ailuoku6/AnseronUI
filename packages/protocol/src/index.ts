/** The reference wire contract. IDs and counters are nonzero u32 values. */
export const PROTOCOL_MAJOR = 2;
export const PROTOCOL_MINOR = 0;
export const MAX_MESSAGE_BYTES = 1024 * 1024;
export const MAX_COMMANDS = 4096;
export const MAX_TRANSACTION_COMMANDS = 65536;
export const MAX_TRANSACTION_BYTES = 16 * 1024 * 1024;

export const RENDER_CAPABILITIES = ["patchProps", "detachChild", "commitChunks", "resetSurface", "inputRevision"];
export interface RenderLimits { messageBytes: number; transactionBytes: number; commandsPerMessage: number; commandsPerTransaction: number }
export const RENDER_LIMITS: RenderLimits = { messageBytes: MAX_MESSAGE_BYTES, transactionBytes: MAX_TRANSACTION_BYTES, commandsPerMessage: MAX_COMMANDS, commandsPerTransaction: MAX_TRANSACTION_COMMANDS };
export type NodeKind = "View" | "Text" | "RichText" | "TextInput" | "ScrollView" | "Image" | "Video" | "Native";
export type NativeEventKind = "nativeComponent" | "longPress" | "backPress" | "focus" | "blur" | "submit" | "scroll" | "scrollEnd" | "layout" | "touchDown" | "touchMove" | "touchUp" | "touchCancel" | "spanClick" | "loadSuccess" | "loadFailure" | "playStateDidChanged" | "playTimeDidChanged" | "firstFrameDidDisplay";
export type EventKind = "tap" | "changeText" | NativeEventKind;
export type NativeEvent = { type: "NativeEvent"; nodeId: number; revision: number; event: NativeEventKind;
  targetId?: number;
  value?: string; x?: number; y?: number; contentWidth?: number; contentHeight?: number; scrollAdjustment?: number;
  source?: string; state?: string; duration?: number; errorCode?: number;
  pageX?: number; pageY?: number; pointerId?: number; touches?: { x: number; y: number; pageX: number; pageY: number; pointerId: number }[] };
export type Frame = { x: number; y: number; width: number; height: number };
export type Scalar = string | number | boolean | null;
export type RenderProps = { [name: string]: Scalar };

export type RenderCommand =
  | { type: "CreateNode"; nodeId: number; kind: NodeKind; nativeName?: string }
  | { type: "InsertChild"; parentId: number; nodeId: number; index: number }
  | { type: "MoveChild"; parentId: number; nodeId: number; index: number }
  | { type: "DetachChild"; nodeId: number }
  | { type: "PatchProps"; nodeId: number; set: RenderProps; unset: string[] }
  | { type: "RemoveNode"; nodeId: number }
  | { type: "SetProps"; nodeId: number; props: RenderProps }
  | { type: "SetFrame"; nodeId: number; frame: Frame }
  | { type: "BindEvent"; nodeId: number; event: EventKind; enabled: boolean };

export type InputPayload =
  | NativeEvent
  | { type: "Handshake"; requiredNodes: NodeKind[]; capabilities?: string[]; limits?: RenderLimits }
  | { type: "CreateSurface"; page: string; width: number; height: number; visible?: boolean }
  | { type: "Resize"; width: number; height: number }
  | { type: "SurfaceVisibility"; visible: boolean }
  | { type: "InspectRuntime"; enabled?: boolean; reset?: boolean }
  | { type: "DestroySurface" }
  | { type: "BackPress" }
  | { type: "Tap"; nodeId: number; revision: number }
  | { type: "InputChange"; nodeId: number; revision: number; value: string; inputRevision: number }
  | { type: "MeasureResult"; requestId: number; nodeId: number; width: number; height: number; baseline: number }
  | { type: "ResetAck"; resetToken: number }
  | { type: "EnvironmentChanged"; version: number }
  | { type: "CommitAck"; revision: number }
  | { type: "CommitFailed"; revision: number; reason: string }
  | { type: "ModuleResult"; requestId: number; ok: boolean; value: string };

export type OutputPayload =
  | { type: "RuntimeStats"; values: Record<string, number> }
  | { type: "Ready"; supportedNodes: NodeKind[]; capabilities?: string[]; limits?: RenderLimits }
  | { type: "Commit"; revision: number; baseRevision?: number; transactionId?: number; commands: RenderCommand[] }
  | { type: "CommitBegin"; revision: number; baseRevision: number; transactionId: number; chunkCount: number; commandCount: number; totalBytes: number }
  | { type: "CommitChunk"; transactionId: number; index: number; data: string }
  | { type: "CommitEnd"; transactionId: number }
  | { type: "ResetSurface"; resetToken: number; rejectedThroughTransactionId: number }
  | { type: "MeasureRequest"; requestId: number; nodeId: number; kind: "Text" | "RichText" | "TextInput"; text: string; fontSize: number; maxWidth: number; props?: RenderProps }
  | { type: "InvokeModule"; requestId: number; module: string; method: string; argument: string; purpose?: "renderWatchdog" }
  | { type: "CancelRequest"; requestId: number }
  | { type: "BackPressResult"; consumed: boolean }
  | { type: "SurfaceDisposed" }
  | { type: "Diagnostic"; code: string; message: string; stack?: string; errorName?: string; buildId?: string };

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
export function validKind(value: unknown): value is NodeKind {
  return value === "View" || value === "Text" || value === "RichText" || value === "TextInput" || value === "ScrollView" || value === "Image" || value === "Video" || value === "Native";
}
export function validEvent(value: unknown): value is EventKind {
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
  const strings = ["text", "value", "placeholder", "backgroundColor", "color", "borderColor", "placeholderTextColor", "shadowColor", "dmBackgroundColor", "dmColor", "dmBorderColor", "dmPlaceholderTextColor", "dmShadowColor", "glassEffectTintColor", "testID", "accessibilityLabel", "accessibilityHint", "accessibilityValue", "src", "dmSrc", "placeholderSrc", "resizeMode", "playControl", "spans", "nativeProps"];
  const booleans = ["accessible", "accessibilityHidden", "accessibilityChecked", "accessibilitySelected", "accessibilityClickable", "accessibilityLongClickable", "disabled", "editable", "secureTextEntry", "autoCorrect", "scrollEnabled", "showsVerticalScrollIndicator", "controls", "autoplay", "loop", "muted", "glassEffect", "glassEffectInteractive", "glassEffectContainer"];
  const enums: Record<string, readonly string[]> = {
    accessibilityRole: ["button", "text", "image", "checkbox", "search", "none"],
    fontWeight: ["normal", "bold"], fontStyle: ["normal", "italic"], textAlign: ["left", "center", "right"],
    textDecorationLine: ["none", "underline", "line-through"], overflow: ["visible", "hidden"], visibility: ["visible", "hidden"],
    ellipsizeMode: ["tail", "clip"], keyboardType: ["default", "email-address", "numeric", "decimal-pad", "phone-pad", "url"],
    returnKeyType: ["default", "done", "go", "next", "search", "send"], autoCapitalize: ["none", "sentences", "words", "characters"],
    resizeMode: ["cover", "contain", "stretch"], playControl: ["play", "pause", "stop"], touchAction: ["auto", "none", "pan-x", "pan-y"],
    glassEffectStyle: ["regular", "clear"]
  };
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (key === "animation") { try { if (typeof item !== "string") return false; validateAnimationOptions(JSON.parse(item)); } catch { return false; } }
    else if (["translateX", "translateY", "scaleX", "scaleY", "rotate", "shadowOffsetX", "shadowOffsetY", "scrollAnchorOffset"].includes(key)) { if (typeof item !== "number" || !Number.isFinite(item)) return false; }
    else if (strings.includes(key)) { if (!validString(item)) return false; }
    else if (booleans.includes(key)) { if (typeof item !== "boolean") return false; }
    else if (key === "opacity" || key === "shadowOpacity") { if (!validSize(item) || item > 1) return false; }
    else if (["fontSize", "lineHeight", "borderWidth", "borderRadius", "shadowRadius", "backgroundBlurRadius", "glassEffectSpacing", "rate"].includes(key)) { if (!validSize(item) || (key === "rate" && item === 0)) return false; }
    else if (["inputRevision", "numberOfLines", "maxLength"].includes(key)) { if (!isU32(item, true)) return false; }
    else if (enums[key]) { if (typeof item !== "string" || !enums[key].includes(item)) return false; }
    else return false;
  }
  return true;
}
/** Style and render fields share one validator. Layout-only fields never leak
 * into renderer property patches. Negative offsets/margins remain valid. */
export function validStyle(value: unknown): boolean {
  if (!record(value)) return false;
  const enums: Record<string, readonly string[]> = {
    flexDirection: ["row", "column"], flexWrap: ["nowrap", "wrap"],
    alignItems: ["start", "center", "end", "stretch"], alignSelf: ["auto", "start", "center", "end", "stretch"],
    justifyContent: ["start", "center", "end", "space-between", "space-around", "space-evenly"], position: ["relative", "absolute"]
  };
  const sizes = ["width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight", "flexGrow", "flexShrink", "flexBasis", "gap", "rowGap", "columnGap", "padding", "paddingHorizontal", "paddingVertical", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
  const offsets = ["top", "right", "bottom", "left", "margin", "marginHorizontal", "marginVertical", "marginTop", "marginRight", "marginBottom", "marginLeft"];
  const visual = ["backgroundColor", "color", "opacity", "dmBackgroundColor", "dmColor", "dmBorderColor", "placeholderTextColor", "dmPlaceholderTextColor", "shadowColor", "dmShadowColor", "shadowOpacity", "shadowRadius", "shadowOffsetX", "shadowOffsetY", "backgroundBlurRadius", "glassEffect", "glassEffectStyle", "glassEffectTintColor", "glassEffectInteractive", "glassEffectContainer", "glassEffectSpacing", "borderColor", "borderWidth", "borderRadius", "overflow", "visibility", "fontSize", "lineHeight", "fontWeight", "fontStyle", "textAlign", "textDecorationLine", "translateX", "translateY", "scaleX", "scaleY", "rotate"];
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (item === undefined) continue;
    if (enums[key]) { if (typeof item !== "string" || !enums[key].includes(item)) return false; }
    else if (sizes.includes(key)) { if (!validSize(item)) return false; }
    else if (offsets.includes(key)) { if (typeof item !== "number" || !Number.isFinite(item)) return false; }
    else if (!visual.includes(key) || !validProps({ [key]: item })) return false;
  }
  return true;
}
export function knownStyle(key: string): boolean {
  return [0, "row", "nowrap", "start", "auto", "relative", "", true, "regular", "normal", "left", "none", "visible"].some(value => validStyle({ [key]: value }));
}
export function knownProp(key: string): boolean {
  // The validator is the schema authority; null is never a deletion sentinel.
  return ["", 0, 1, true, "normal", "none", "default", "visible", "left", "cover", "play", "button", "auto", "regular"].some(value => validProps({ [key]: value }));
}
export function validInputPair(set: RenderProps, unset: string[]): boolean {
  return (Object.prototype.hasOwnProperty.call(set, "value") === Object.prototype.hasOwnProperty.call(set, "inputRevision")) && (unset.includes("value") === unset.includes("inputRevision"));
}
export function patchProps(base: RenderProps, set: RenderProps, unset: string[]): RenderProps {
  if (!validProps(set) || !validInputPair(set, unset) || new Set(unset).size !== unset.length || unset.some(key => !knownProp(key) || key in set)) throw new Error("INVALID_PROP_PATCH");
  const next = { ...base, ...set };
  for (const key of unset) delete next[key];
  return next;
}
export function propPatch(base: RenderProps, next: RenderProps): { set: RenderProps; unset: string[] } {
  const set: RenderProps = {}, unset: string[] = [];
  for (const key of Object.keys(next)) if (!Object.is(base[key], next[key])) set[key] = next[key];
  for (const key of Object.keys(base)) if (!(key in next)) unset.push(key);
  if ("value" in set || "inputRevision" in set) { set.value = next.value; set.inputRevision = next.inputRevision; }
  return { set, unset };
}
export function validCommand(value: unknown): boolean {
  if (!record(value) || !isU32(value.nodeId)) return false;
  switch (value.type) {
    case "CreateNode": return validKind(value.kind) && (value.kind !== "Native" || (validString(value.nativeName, 128) && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(value.nativeName)));
    case "InsertChild":
    case "MoveChild": return isU32(value.parentId, true) && isU32(value.index, true);
    case "RemoveNode":
    case "DetachChild": return true;
    case "PatchProps": return validProps(value.set) && Array.isArray(value.unset) && value.unset.every(key => typeof key === "string" && knownProp(key) && !(key in (value.set as object))) && new Set(value.unset).size === value.unset.length && validInputPair(value.set as RenderProps, value.unset as string[]);
    case "SetProps": return validProps(value.props);
    case "SetFrame": return validFrame(value.frame);
    case "BindEvent": return validEvent(value.event) && typeof value.enabled === "boolean";
    default: return false;
  }
}
function validNegotiation(value: Record<string, unknown>): boolean {
  return (value.capabilities === undefined || Array.isArray(value.capabilities) && value.capabilities.length <= 32 && value.capabilities.every(item => validString(item, 128))) &&
    (value.limits === undefined || record(value.limits) && ["messageBytes", "transactionBytes", "commandsPerMessage", "commandsPerTransaction"].every(key => isU32((value.limits as Record<string, unknown>)[key])));
}
function validPayload(value: Record<string, unknown>): boolean {
  switch (value.type) {
    case "Handshake": return Array.isArray(value.requiredNodes) && value.requiredNodes.length <= 32 && value.requiredNodes.every(validKind) && validNegotiation(value);
    case "CreateSurface": return validString(value.page, 128) && value.page.length > 0 && validSize(value.width) && validSize(value.height) && (value.visible === undefined || typeof value.visible === "boolean");
    case "InspectRuntime": return (value.enabled === undefined || typeof value.enabled === "boolean") && (value.reset === undefined || typeof value.reset === "boolean");
    case "RuntimeStats": return record(value.values) && Object.keys(value.values).length <= 64 && Object.values(value.values).every(validSize);
    case "SurfaceVisibility": return typeof value.visible === "boolean";
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
      if (value.event === "scroll" || value.event === "scrollEnd" || value.event === "layout") return Number.isFinite(value.x) && Number.isFinite(value.y) && validSize(value.contentWidth) && validSize(value.contentHeight) && (value.scrollAdjustment === undefined || Number.isFinite(value.scrollAdjustment));
      return true;
    case "Tap": return isU32(value.nodeId) && isU32(value.revision);
    case "InputChange": return isU32(value.nodeId) && isU32(value.revision) && isU32(value.inputRevision) && validString(value.value);
    case "MeasureResult": return isU32(value.requestId) && isU32(value.nodeId) && validSize(value.width) && validSize(value.height) && validSize(value.baseline);
    case "ResetAck": return isU32(value.resetToken);
    case "EnvironmentChanged": return isU32(value.version);
    case "ResetSurface": return isU32(value.resetToken) && isU32(value.rejectedThroughTransactionId, true);
    case "CommitBegin": return isU32(value.revision) && isU32(value.baseRevision, true) && isU32(value.transactionId) && isU32(value.chunkCount) && value.chunkCount <= MAX_TRANSACTION_COMMANDS && isU32(value.commandCount, true) && value.commandCount <= MAX_TRANSACTION_COMMANDS && isU32(value.totalBytes) && value.totalBytes <= MAX_TRANSACTION_BYTES;
    case "CommitChunk": return isU32(value.transactionId) && isU32(value.index, true) && validString(value.data, MAX_MESSAGE_BYTES);
    case "CommitEnd": return isU32(value.transactionId);
    case "CommitAck": return isU32(value.revision);
    case "CommitFailed": return isU32(value.revision) && validString(value.reason, 4096);
    case "ModuleResult": return isU32(value.requestId) && typeof value.ok === "boolean" && validString(value.value);
    case "Ready": return Array.isArray(value.supportedNodes) && value.supportedNodes.length <= 32 && value.supportedNodes.every(validKind) && validNegotiation(value);
    case "Commit": return isU32(value.revision) && Array.isArray(value.commands) && value.commands.length <= MAX_COMMANDS && value.commands.every(validCommand);
    case "MeasureRequest": return isU32(value.requestId) && isU32(value.nodeId) && (value.kind === "Text" || value.kind === "RichText" || value.kind === "TextInput") && validString(value.text) && validSize(value.fontSize) && validSize(value.maxWidth) && (value.props === undefined || validProps(value.props));
    case "InvokeModule": return isU32(value.requestId) && (validString(value.module, 128) && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value.module)) && validString(value.method, 128) && validString(value.argument);
    case "CancelRequest": return isU32(value.requestId);
    case "BackPressResult": return typeof value.consumed === "boolean";
    case "Diagnostic": return validString(value.code, 128) && validString(value.message, 4096) && (value.stack === undefined || validString(value.stack, 32768)) && (value.errorName === undefined || validString(value.errorName, 256)) && (value.buildId === undefined || validString(value.buildId, 256));
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

/** UTF-8 length without platform APIs; identical in JavaScript, native and Wasm. */
export function utf8Length(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes++; else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}
export function splitCommit(revision: number, baseRevision: number, commands: RenderCommand[]): OutputPayload[] {
  if (commands.length > MAX_TRANSACTION_COMMANDS) throw new Error("COMMIT_COMMAND_LIMIT");
  const totalBytes = utf8Length(JSON.stringify(commands));
  if (totalBytes > MAX_TRANSACTION_BYTES) throw new Error("COMMIT_BYTE_LIMIT");
  // Reserve space for the envelope and metadata before choosing a wire message.
  if (commands.length <= MAX_COMMANDS && totalBytes < MAX_MESSAGE_BYTES - 1024) return [{ type: "Commit", revision, baseRevision, transactionId: revision, commands }];
  const chunks: RenderCommand[][] = []; let chunk: RenderCommand[] = [], bytes = 2;
  for (const command of commands) {
    const size = utf8Length(JSON.stringify(JSON.stringify(command))) + 1;
    if (size > MAX_MESSAGE_BYTES - 2048) throw new Error("COMMIT_COMMAND_TOO_LARGE");
    if (chunk.length && (chunk.length === MAX_COMMANDS || bytes + size > MAX_MESSAGE_BYTES - 1024)) { chunks.push(chunk); chunk = []; bytes = 2; }
    chunk.push(command); bytes += size;
  }
  if (chunk.length) chunks.push(chunk);
  const result: OutputPayload[] = [{ type: "CommitBegin", revision, baseRevision, transactionId: revision, chunkCount: chunks.length, commandCount: commands.length, totalBytes }];
  for (let index = 0; index < chunks.length; index++) result.push({ type: "CommitChunk", transactionId: revision, index, data: JSON.stringify(chunks[index]) });
  result.push({ type: "CommitEnd", transactionId: revision }); return result;
}
/** Buffers a complete transaction before renderer preflight. One buffer per
 * surface/generation, bounded before allocation. Never applies a partial batch. */
export class CommitAssembler {
  private begin: Extract<OutputPayload, { type: "CommitBegin" }> | null = null;
  private chunks = new Map<number, RenderCommand[]>();
  private bytes = 0;
  private count = 0;
  private through = 0;
  private last: Extract<OutputPayload, { type: "Commit" }> | null = null;
  reset(through = 0): void { this.begin = null; this.chunks.clear(); this.bytes = 0; this.count = 0; this.through = Math.max(this.through, through); this.last = null; }
  accept(payload: OutputPayload): OutputPayload | null {
    if (payload.type === "CommitBegin") {
      if (!validPayload(payload) || payload.transactionId <= this.through) throw new Error("INVALID_COMMIT_BEGIN");
      if (this.begin) { if (JSON.stringify(this.begin) !== JSON.stringify(payload)) throw new Error("CONFLICTING_COMMIT_BEGIN"); return null; }
      this.begin = payload; this.chunks.clear(); this.bytes = 0; this.count = 0; return null;
    }
    if (payload.type === "CommitChunk") {
      if (!this.begin || this.begin.transactionId !== payload.transactionId || payload.index >= this.begin.chunkCount || !validPayload(payload)) throw new Error("INVALID_COMMIT_CHUNK");
      const commands = JSON.parse(payload.data) as RenderCommand[];
      if (!Array.isArray(commands) || commands.length > MAX_COMMANDS || !commands.every(validCommand)) throw new Error("INVALID_COMMIT_COMMANDS");
      const previous = this.chunks.get(payload.index);
      if (previous) { if (JSON.stringify(previous) !== payload.data) throw new Error("CONFLICTING_COMMIT_CHUNK"); return null; }
      this.count += commands.length; this.bytes += utf8Length(payload.data) - 2 + (commands.length ? 1 : 0);
      if (this.count > this.begin.commandCount || this.bytes > this.begin.totalBytes) throw new Error("COMMIT_BUFFER_LIMIT");
      this.chunks.set(payload.index, commands); return null;
    }
    if (payload.type === "CommitEnd") {
      if (!this.begin && this.last?.revision === payload.transactionId) return this.last;
      const begin = this.begin;
      if (!begin || begin.transactionId !== payload.transactionId || this.chunks.size !== begin.chunkCount || this.count !== begin.commandCount) throw new Error("INCOMPLETE_COMMIT");
      const commands: RenderCommand[] = []; for (let i = 0; i < begin.chunkCount; i++) commands.push(...this.chunks.get(i)!);
      if (utf8Length(JSON.stringify(commands)) !== begin.totalBytes) throw new Error("COMMIT_BYTE_MISMATCH");
      const result: Extract<OutputPayload, { type: "Commit" }> = { type: "Commit", revision: begin.revision, baseRevision: begin.baseRevision, transactionId: begin.transactionId, commands };
      if (this.last?.revision === result.revision && JSON.stringify(this.last) !== JSON.stringify(result)) throw new Error("CONFLICTING_COMMIT");
      this.begin = null; this.chunks.clear(); this.last = result; return result;
    }
    if (payload.type === "Commit") {
      if (!validPayload(payload) || payload.revision <= this.through) throw new Error("INVALID_COMMIT");
      if (this.last?.revision === payload.revision && JSON.stringify(this.last) !== JSON.stringify(payload)) throw new Error("CONFLICTING_COMMIT");
      this.last = payload;
    }
    return payload;
  }
}
