import { VariableHeightLayout } from "./virtual-layout.js";
import type { NativeServices, HttpRequest, HttpResponse, SubscribeNative } from "./native-services.js";
export * from "./native-services.js";
import type { Timers } from "./timers.js";
export { setTimeout, clearTimeout } from "./timers.js";
export type { Timers } from "./timers.js";
export type Key = string | number;
export type NormalizedChild = UIElement | string | number;
export type ChildValue = NormalizedChild | boolean | null | undefined;
export type Child = ChildValue | (ChildValue | ChildValue[])[];
export type Component<P = {}> = (props: P) => UIElement | null;
export type HostTag = "View" | "Text" | "RichText" | "TextInput" | "ScrollView" | "Image" | "Video" | "Native";

export interface AnimationOptions {
  /** Milliseconds. Default 300. */
  duration?: number;
  delay?: number;
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
  /** Full cycles, or -1 to repeat until cancelled. Default 1. */
  iterations?: number;
  /** Each cycle goes to the target and returns to its starting values. */
  autoreverse?: boolean;
}
export interface AnimationStyle {
  opacity?: number;
  translateX?: number; translateY?: number;
  scaleX?: number; scaleY?: number;
  /** Degrees, clockwise. Transforms use the node's center. */
  rotate?: number;
  borderRadius?: number;
  /** Animation colors use #RRGGBB. */
  backgroundColor?: string;
}
export interface AnimationResult { finished: boolean }

export interface Style extends AnimationStyle {
  width?: number; height?: number;
  minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number;
  flexDirection?: "row" | "column";
  flexGrow?: number; flexShrink?: number; flexBasis?: number;
  flexWrap?: "nowrap" | "wrap";
  gap?: number; rowGap?: number; columnGap?: number;
  padding?: number; paddingHorizontal?: number; paddingVertical?: number;
  paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  margin?: number; marginHorizontal?: number; marginVertical?: number;
  marginTop?: number; marginRight?: number; marginBottom?: number; marginLeft?: number;
  alignItems?: "start" | "center" | "end" | "stretch";
  alignSelf?: "auto" | "start" | "center" | "end" | "stretch";
  justifyContent?: "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly";
  position?: "relative" | "absolute";
  top?: number; right?: number; bottom?: number; left?: number;
  backgroundColor?: string; color?: string; opacity?: number;
  /** System dark appearance overrides. Missing values fall back to the ordinary color. */
  dmBackgroundColor?: string; dmColor?: string; dmBorderColor?: string;
  placeholderTextColor?: string; dmPlaceholderTextColor?: string;
  /** Outer box shadow, in layout units. Defaults: black, opacity 0, radius 0, offset 0/0. */
  shadowColor?: string; dmShadowColor?: string; shadowOpacity?: number;
  shadowRadius?: number; shadowOffsetX?: number; shadowOffsetY?: number;
  /** View backdrop blur, independent of glassEffect. Layout units; omitted/0 disables it outside glass fallback. Native materials approximate the radius. */
  backgroundBlurRadius?: number;
  /** Native Liquid Glass on iOS 26+/macOS 26+; other hosts use a translucent fallback. */
  glassEffect?: boolean;
  glassEffectStyle?: "regular" | "clear";
  glassEffectTintColor?: string;
  /** Native press feedback on iOS 26+ and macOS 27+. Ignored when disabled. */
  glassEffectInteractive?: boolean;
  /** Group nearby glass effects so they can merge. */
  glassEffectContainer?: boolean;
  glassEffectSpacing?: number;
  borderColor?: string; borderWidth?: number; borderRadius?: number;
  overflow?: "visible" | "hidden";
  visibility?: "visible" | "hidden";
  fontSize?: number;
  /** Absolute line box height in layout units; omitted uses the platform font metrics. */
  lineHeight?: number; fontWeight?: "normal" | "bold"; fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  textDecorationLine?: "none" | "underline" | "line-through";
}

/** Frame relative to the parent, in layout units; excludes visual transforms and scrolling. */
export interface LayoutEvent { x: number; y: number; width: number; height: number }
export interface ScrollEvent { x: number; y: number; contentWidth: number; contentHeight: number; scrollAdjustment?: number }
/** x/y are relative to the initial hit target; pageX/pageY are relative to the render root. */
export interface TouchPoint { x: number; y: number; pageX: number; pageY: number; pointerId: number }
export interface TouchEvent extends TouchPoint {
  touches: TouchPoint[];
  readonly target: number;
  readonly currentTarget: number;
  readonly eventPhase: "capture" | "target" | "bubble";
  /** Call synchronously to stop traversal to other nodes for this event. */
  stopPropagation(): void;
}
export type AccessibilityRole = "button" | "text" | "image" | "checkbox" | "search" | "none";
export interface AccessibilityInfo {
  /** Reader actions; defaults to the bound onClick/onLongPress handlers. */
  clickable: boolean;
  longClickable: boolean;
}
export interface CommonProps {
  key?: Key; style?: Style; children?: Child;
  ref?: RefTarget<NodeHandle>;
  /** Animate this node's changed visual styles and computed frame; initial mount is immediate. */
  animation?: AnimationOptions;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityHint?: string;
  accessibilityValue?: string;
  /** Expose this node to the reader using platform grouping. false excludes only this node. */
  accessible?: boolean;
  /** Exclude this node and its descendants from the accessibility tree. */
  accessibilityHidden?: boolean;
  accessibilityChecked?: boolean;
  accessibilitySelected?: boolean;
  accessibilityInfo?: AccessibilityInfo;
  onClick?: () => void;
  onLongPress?: () => void;
  /** Synchronous system back callback. Return true to consume the press. */
  onBackPress?: () => boolean;
  onTouchDown?: (event: TouchEvent) => void;
  onTouchMove?: (event: TouchEvent) => void;
  onTouchUp?: (event: TouchEvent) => void;
  onTouchCancel?: (event: TouchEvent) => void;
  onTouchDownCapture?: (event: TouchEvent) => void;
  onTouchMoveCapture?: (event: TouchEvent) => void;
  onTouchUpCapture?: (event: TouchEvent) => void;
  onTouchCancelCapture?: (event: TouchEvent) => void;
  /** Native scrolling policy, intersected with ancestors up to the nearest ScrollView at pointer down. */
  touchAction?: "auto" | "none" | "pan-x" | "pan-y";
  /** Runs after the renderer acknowledges an initial or changed frame. */
  onLayout?: (frame: LayoutEvent) => void;
}
export interface ViewProps extends CommonProps { disabled?: boolean }
export interface TextProps extends CommonProps {
  numberOfLines?: number;
  ellipsizeMode?: "tail" | "clip";
}
export interface RichTextSpan {
  text: string; color?: string; dmColor?: string; fontSize?: number; fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic"; textDecorationLine?: "none" | "underline" | "line-through";
  onClick?: () => void;
}
export interface RichTextProps extends CommonProps {
  spans: RichTextSpan[]; numberOfLines?: number; onSpanClick?: (index: number) => void;
}
export interface ButtonProps extends CommonProps { title: string; disabled?: boolean }
export interface TextInputProps extends CommonProps {
  value: string; onChangeText: (value: string) => void; placeholder?: string;
  editable?: boolean; secureTextEntry?: boolean; maxLength?: number;
  keyboardType?: "default" | "email-address" | "numeric" | "decimal-pad" | "phone-pad" | "url";
  returnKeyType?: "default" | "done" | "go" | "next" | "search" | "send";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean; placeholderTextColor?: string; dmPlaceholderTextColor?: string;
  onFocus?: () => void; onBlur?: () => void;
  onSubmitEditing?: (value: string) => void;
}
export interface ScrollViewProps extends CommonProps {
  /** Cumulative vertical anchor adjustment, applied with the content commit. Used by VirtualList. */
  scrollAnchorOffset?: number;
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  /** Vertical offset is retained as the first argument for compatibility. */
  onScroll?: (offset: number, event: ScrollEvent) => void;
  onScrollEnd?: (event: ScrollEvent) => void;
}
export type MediaResizeMode = "cover" | "contain" | "stretch";
export interface ImageProps extends CommonProps {
  src: string;
  /** Dark appearance source; falls back to src when omitted. */
  dmSrc?: string;
  resizeMode?: MediaResizeMode;
  placeholderSrc?: string;
  onLoad?: (source: string) => void;
  onError?: (source: string, errorCode: number) => void;
}
export interface VideoProps extends CommonProps {
  src: string;
  resizeMode?: MediaResizeMode;
  controls?: boolean;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  rate?: number;
  playControl?: "play" | "pause" | "stop";
  onPlaybackStateChange?: (state: "playing" | "paused" | "ended" | "error") => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onFirstFrame?: () => void;
  onError?: (source: string, errorCode: number) => void;
}

/** Values crossing the platform boundary must be JSON serializable. */
export interface NativeComponentEvent<T = unknown> { name: string; data: T }
export interface NativeComponentProps<P = object> extends CommonProps {
  name: string;
  nativeProps?: P;
  onNativeEvent?: (event: NativeComponentEvent) => void;
}
export function NativeComponent<P = object>(props: NativeComponentProps<P>): HostElement { return host("Native", props); }
export function createNativeComponent<P = object>(name: string): Component<Omit<NativeComponentProps<P>, "name">> {
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(name)) throw new Error("INVALID_NATIVE_NAME");
  return props => NativeComponent({ ...props, name });
}
export type RefTarget<T> = Ref<T | null> | ((value: T | null) => void);
export interface NodeHandle {
  readonly nodeId: number;
  invoke<T = unknown>(method: string, args?: unknown): Promise<T>;
  /** Host-side visual override; does not change layout or TSX state. Replacing/cancelling resolves finished:false. */
  animate(style: AnimationStyle, options?: AnimationOptions): Promise<AnimationResult>;
  /** Freeze at the current displayed values. */
  cancelAnimation(): Promise<void>;
  /** Requests reader focus; does not open the input keyboard. */
  accessibilityFocus(): Promise<void>;
  /** Resolves when the host accepts the request, not when speech finishes. */
  accessibilityAnnounce(message: string): Promise<void>;
  focus(): Promise<void>;
  blur(): Promise<void>;
  scrollTo(x: number, y: number, animated?: boolean): Promise<void>;
  measure(): Promise<LayoutEvent>;
}
export function createRef<T>(): Ref<T | null> { return new RefCell(null) as Ref<T | null>; }

export interface HostElement { kind: "host"; tag: HostTag; key: Key | null; props: object; children: NormalizedChild[] }
export interface ComponentElement { kind: "component"; component: Component<any>; key: Key | null; props: object }
export interface FragmentElement { kind: "fragment"; key: Key | null; children: NormalizedChild[] }
export interface ProviderElement { kind: "provider"; contextId: number; value: unknown; key: Key | null; children: NormalizedChild[] }
export type UIElement = HostElement | ComponentElement | FragmentElement | ProviderElement;

function host(tag: HostTag, props: CommonProps): HostElement {
  return { kind: "host", tag, key: props.key ?? null, props, children: normalizeChildren(props.children) };
}
export function View(props: ViewProps): HostElement { return host("View", props); }
export function Text(props: TextProps): HostElement { return host("Text", props); }
export function RichText(props: RichTextProps): HostElement { return host("RichText", props); }
/** Shared button chrome and interaction. Hosts render only View + Text. */
export function Button(props: ButtonProps): HostElement {
  const [pressed, setPressed] = useState(false);
  const disabled = props.disabled === true;
  const { fontSize = 16, lineHeight, fontWeight, fontStyle, color = "#007aff", dmColor,
    textAlign = "center", textDecorationLine, ...box } = props.style ?? {};
  const paddingVertical = box.paddingVertical ?? box.padding ?? 6;
  const paddingHorizontal = box.paddingHorizontal ?? box.padding ?? 12;
  useEffect(() => { if (disabled) setPressed(false); }, [disabled]);
  return View({ ...props, accessibilityRole: "button", accessibilityLabel: props.accessibilityLabel ?? props.title,
    style: { minHeight: 32, paddingVertical, paddingHorizontal,
      flexDirection: "row", alignItems: "center", justifyContent: "center", ...box,
      opacity: (box.opacity ?? 1) * (disabled ? 0.4 : pressed ? 0.6 : 1) },
    onClick: disabled ? undefined : props.onClick,
    onLongPress: disabled ? undefined : props.onLongPress,
    onTouchDown: disabled ? undefined : event => { setPressed(true); props.onTouchDown?.(event); },
    onTouchUp: disabled ? undefined : event => { setPressed(false); props.onTouchUp?.(event); },
    onTouchCancel: disabled ? undefined : event => { setPressed(false); props.onTouchCancel?.(event); },
    children: Text({ numberOfLines: 1, ellipsizeMode: "tail",
      style: { flexShrink: 1, fontSize, lineHeight, fontWeight, fontStyle, color, dmColor, textAlign, textDecorationLine },
      children: props.title }),
  });
}
export function TextInput(props: TextInputProps): HostElement { return host("TextInput", props); }
export function ScrollView(props: ScrollViewProps): HostElement { return host("ScrollView", props); }
export function Image(props: ImageProps): HostElement { return host("Image", props); }
export function Video(props: VideoProps): HostElement { return host("Video", props); }
export function Fragment(props: { key?: Key; children?: Child }): FragmentElement {
  return { kind: "fragment", key: props.key ?? null, children: normalizeChildren(props.children) };
}
export function normalizeChildren(value: Child): NormalizedChild[] {
  const result: NormalizedChild[] = [];
  function append(child: ChildValue): void {
    if (child === null || child === undefined || typeof child === "boolean") return;
    result.push(child);
  }
  if (Array.isArray(value)) for (const item of value) {
    if (Array.isArray(item)) for (const nested of item) append(nested);
    else append(item);
  }
  else append(value);
  return result;
}

export interface Page<P = {}> { name: string; component: Component<P> }
export function definePage<P>(name: string, component: Component<P>): Page<P> {
  if (!name || !/^[a-z][a-z0-9_-]*$/.test(name)) throw new Error("Invalid page name");
  return { name, component };
}

export type Updater<T> = T | ((previous: T) => T);
export type Dispatch<T> = (next: Updater<T>) => void;
export interface Ref<T> { current: T }
/** Shared storage identity across AOT generic ref instantiations. */
export class RefCell {
  current: unknown;
  constructor(initial: unknown) { this.current = initial; }
}
export type EffectSetup = () => void | (() => void);
export interface Services extends NativeServices {
  page: { isVisible(): boolean; subscribe(listener: (visible: boolean) => void): () => void };
  subscribe: SubscribeNative;
  timers: Timers;
  /** Named platform extension; results and arguments cross as JSON. */
  invoke<T = unknown>(module: string, method: string, args?: unknown): Promise<T>;
  /** Navigation stack for AnseronUI pages mounted by the host container. */
  router: Router;
  http: { getText(url: string): Promise<string>; request(options: HttpRequest): Promise<HttpResponse> };
  sleep(milliseconds: number): Promise<void>;
}
/** Route data crosses native hosts as JSON. Each navigation entry owns a snapshot. */
export type RouteValue = string | number | boolean | null | RouteValue[] | { [key: string]: RouteValue };
export type RouteParams = { [key: string]: RouteValue };
export interface Router {
  /** Pushes a registered page onto the host navigation stack. */
  push(page: string, params?: RouteParams): Promise<void>;
  /** Replaces the current page without growing the stack. */
  replace(page: string, params?: RouteParams): Promise<void>;
  /** Pops the current page. Rejects when the stack is already at its root. */
  pop(): Promise<void>;
  /** Alias for pop(), matching common native navigation terminology. */
  back(): Promise<void>;
  /** Returns the page currently displayed by the host. */
  current(): Promise<string>;
  /** Reads a fresh snapshot of this navigation entry's parameters; defaults to {}. */
  getParams<T extends RouteParams = RouteParams>(): Promise<T>;
}
export interface Context<T> {
  readonly id: number;
  readonly defaultValue: T;
  readonly Provider: Component<{ value: T; children?: Child }>;
}

export interface HookDispatcher {
  state(initial: unknown): [unknown, (next: unknown) => void];
  reducer<S, A>(reducer: (state: S, action: A) => S, initial: S): [S, (action: A) => void];
  ref<T>(initial: T): Ref<T>;
  effect(setup: EffectSetup, deps?: readonly unknown[]): void;
  memo<T>(factory: () => T, deps: readonly unknown[]): T;
  context<T>(context: Context<T>): T;
  services(): Services;
}

let activeDispatcher: HookDispatcher | null = null;
export function setHookDispatcher(dispatcher: HookDispatcher | null): void { activeDispatcher = dispatcher; }
function dispatcher(): HookDispatcher {
  if (!activeDispatcher) throw new Error("HOOK_OUTSIDE_RENDER");
  return activeDispatcher;
}
export function useState<T>(initial: T | (() => T)): [T, Dispatch<T>] { return dispatcher().state(initial) as [T, Dispatch<T>]; }
export function useReducer<S, A>(reducer: (state: S, action: A) => S, initial: S): [S, (action: A) => void] { return dispatcher().reducer(reducer, initial); }
export function useRef<T>(initial: T): Ref<T> { return dispatcher().ref(initial); }
export function useEffect(setup: EffectSetup, deps?: readonly unknown[]): void { dispatcher().effect(setup, deps); }
export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T { return dispatcher().memo(factory, deps); }
export function useCallback<T extends Function>(callback: T, deps: readonly unknown[]): T { return useMemo(() => callback, deps); }
let nextContextId = 1;
export function createContext<T>(defaultValue: T): Context<T> {
  const id = nextContextId++;
  const Provider = (props: { value: T; children?: Child }): ProviderElement => ({
    kind: "provider", contextId: id, value: props.value, key: null, children: normalizeChildren(props.children),
  });
  return { id, defaultValue, Provider };
}
export function useContext<T>(context: Context<T>): T { return dispatcher().context(context); }
export function useServices(): Services { return dispatcher().services(); }
/** Captures a surface-specific timer binding, also safe after await. */
export function useTimers(): Timers { return dispatcher().services().timers; }
export function useRouter(): Router { return dispatcher().services().router; }

/** Function components accept a ref prop explicitly and expose a public handle after commit. */
export function useImperativeHandle<T>(ref: RefTarget<T> | undefined, create: () => T, deps?: readonly unknown[]): void {
  useEffect(() => {
    const value = create();
    if (typeof ref === "function") ref(value); else if (ref) ref.current = value;
    return () => { if (typeof ref === "function") ref(null); else if (ref) ref.current = null; };
  }, deps === undefined ? undefined : [ref, ...deps]);
}

/** Work started here is cleaned up when covered/backgrounded and restarted on return. */
export function usePageEffect(setup: EffectSetup, deps?: readonly unknown[]): void {
  const services = useServices();
  useEffect(() => {
    let cleanup: void | (() => void);
    const change = (visible: boolean) => { if (cleanup) { const stop = cleanup; cleanup = undefined; stop(); } if (visible) cleanup = setup(); };
    const stop = services.page.subscribe(change);
    change(services.page.isVisible());
    return () => { stop(); if (cleanup) cleanup(); };
  }, deps);
}
export function usePageVisibility(): boolean {
  const services = useServices();
  const [visible, setVisible] = useState(services.page.isVisible());
  useEffect(() => { const stop = services.page.subscribe(setVisible); setVisible(services.page.isVisible()); return stop; }, []);
  return visible;
}

export interface VirtualListHandle {
  scrollToOffset(offset: number): Promise<void>;
  /** Uses estimates for unmeasured rows, then refines alignment as rows are measured. */
  scrollToIndex(index: number): Promise<void>;
}
export interface VirtualListProps<T> {
  data: readonly T[];
  keyExtractor(item: T, index: number): Key;
  renderItem(item: T, index: number): UIElement | null;
  estimatedItemHeight?: number;
  /** Additional mounted area above/below the viewport, in layout units. */
  overscan?: number;
  style?: Style;
  testID?: string;
  ref?: RefTarget<VirtualListHandle>;
  /** Change when row layout changes without replacing data (for example font size). */
  layoutVersion?: Key;
  onScroll?: (offset: number, event: ScrollEvent) => void;
  onError?: (error: Error) => void;
}
/** Vertical, measured variable-height list. Unmounted rows must keep durable state in the data model. */
export function VirtualList<T>(props: VirtualListProps<T>): UIElement {
  const state = useRef(new VirtualListState());
  const current = state.current;
  const scroll = useRef<NodeHandle | null>(null);
  const [, redraw] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const estimate = props.estimatedItemHeight ?? 48;
  const overscan = props.overscan ?? estimate * 4;
  if (!Number.isFinite(overscan) || overscan < 0) throw new Error('INVALID_LIST_OVERSCAN');
  const report = (error: unknown) => { if (props.onError) props.onError(error instanceof Error ? error : new Error(String(error))); };
  if (current.data !== props.data || current.version !== props.layoutVersion || current.width !== viewport.width || current.estimate !== estimate) {
    const previousOffset = current.offset;
    const targetKey = current.target >= 0 ? current.layout.key(current.target) : '';
    const anchor = current.layout.key(current.layout.at(current.offset));
    const inset = current.offset - current.layout.offset(current.layout.index(anchor));
    current.layout.reset(props.data.map((item, index) => String(props.keyExtractor(item, index))), estimate,
      current.width !== viewport.width || current.version !== props.layoutVersion);
    current.data = props.data; current.version = props.layoutVersion; current.width = viewport.width; current.estimate = estimate;
    const index = current.layout.index(anchor);
    current.target = targetKey ? current.layout.index(targetKey) : -1;
    current.offset = Math.max(0, Math.min(index >= 0 ? current.layout.offset(index) + inset : current.offset, current.layout.totalHeight - viewport.height));
    if (current.target >= 0) current.correction = true;
    else current.anchorAdjustment += current.offset - previousOffset;
    current.windowStart = -1;
  }
  const generation = current.layout.generation;
  // Keep a stable window until its runway is nearly exhausted. Predict in the
  // travel direction using observed velocity and commit latency, with bounded
  // row count so fast flings cannot mount the entire dataset.
  const lead = Math.min(viewport.height * 5, Math.abs(current.velocity) * current.renderLatency * 2);
  // Keep a warm runway on both sides even at rest: the first fling event
  // arrives after native scrolling has already started, and reversals cannot
  // wait for another measurement/commit round trip.
  const warm = Math.max(overscan, viewport.height * 2);
  const before = warm + (current.velocity < 0 ? lead : 0);
  const after = warm + (current.velocity > 0 ? lead : 0);
  let start = current.layout.at(Math.max(0, current.offset - before));
  let end = Math.min(current.layout.count, current.layout.at(current.offset + viewport.height + after) + 1);
  if (current.layout.count === 0 || viewport.height <= 0) { start = 0; end = 0; }
  const visibleStart = current.layout.at(current.offset);
  const visibleEnd = Math.min(current.layout.count, current.layout.at(current.offset + viewport.height) + 1);
  const extra = Math.max(0, 32 - (visibleEnd - visibleStart));
  const backward = current.velocity < 0 ? Math.ceil(extra * 0.65) : current.velocity > 0 ? Math.floor(extra * 0.35) : Math.floor(extra / 2);
  start = Math.max(start, visibleStart - backward);
  end = Math.min(end, visibleEnd + extra - backward);
  const runway = Math.max(overscan / 2, Math.min(viewport.height * 2, Math.abs(current.velocity) * current.renderLatency));
  if (current.windowStart >= 0 &&
      (current.windowStart === 0 || current.offset >= current.layout.offset(current.windowStart) + runway) &&
      (current.windowEnd === current.layout.count || current.offset + viewport.height <= current.layout.offset(current.windowEnd) - runway)) {
    // Parent timers and row measurements still update props/frames, but must
    // not discard the warm window or start unrelated cold-row work mid-fling.
    start = current.windowStart; end = current.windowEnd;
  }
  current.windowStart = start; current.windowEnd = end;
  const renderedAt = Date.now();
  useEffect(() => { current.renderLatency = Math.max(200, Math.min(600, (Date.now() - renderedAt) * 2.5)); });
  // Runs after the new content extent is committed; scrolling earlier could clamp to the old extent.
  useEffect(() => {
    if (!current.correction || !scroll.current) return;
    current.correction = false;
    const target = Math.max(0, Math.min(current.offset, current.layout.totalHeight - viewport.height));
    current.offset = target;
    current.expectedOffset = target;
    void scroll.current.scrollTo(0, target, false).catch(error => report(error));
  });
  useImperativeHandle(props.ref, () => ({
    scrollToOffset: async (offset: number) => {
      if (!Number.isFinite(offset)) throw new Error('INVALID_LIST_OFFSET');
      current.target = -1; current.offset = Math.max(0, Math.min(offset, current.layout.totalHeight - viewport.height));
      current.correction = true; redraw(value => value + 1);
    },
    scrollToIndex: async (index: number) => {
      if (!Number.isInteger(index) || index < 0 || index >= props.data.length) throw new Error('INVALID_LIST_INDEX');
      current.target = index; current.offset = current.layout.offset(index); current.correction = true; redraw(value => value + 1);
    },
  }), [props.data, viewport.height]);
  const rows: UIElement[] = [];
  for (let index = start; index < end; index++) {
    const key = current.layout.key(index);
    rows.push(View({ key, style: { position: 'absolute', top: current.layout.offset(index), left: 0, width: viewport.width, flexDirection: 'column', flexShrink: 0 },
      onLayout: frame => {
        const first = current.layout.at(current.offset);
        const anchor = current.layout.key(first);
        const inset = current.offset - current.layout.offset(first);
        if (!current.layout.measure(key, frame.height, generation)) return;
        const next = current.target >= 0 ? current.layout.offset(current.target) : current.layout.offset(current.layout.index(anchor)) + inset;
        if (Math.abs(next - current.offset) >= 0.5) {
          if (current.target >= 0) current.correction = true;
          else current.anchorAdjustment += Math.max(0, next) - current.offset;
          current.offset = Math.max(0, next);
        }
        redraw(value => value + 1);
      }, children: props.renderItem(props.data[index], index) }));
  }
  return ScrollView({ ref: scroll, testID: props.testID, scrollAnchorOffset: current.anchorAdjustment, style: { flexGrow: 1, flexBasis: 0, height: 0, minHeight: 0, minWidth: 0, flexDirection: 'column', ...props.style },
    onLayout: frame => { if (frame.width !== viewport.width || frame.height !== viewport.height) setViewport({ width: frame.width, height: frame.height }); },
    onScroll: (offset, event) => {
      const programmed = current.expectedOffset !== undefined && Math.abs(current.expectedOffset - offset) < 1;
      current.expectedOffset = undefined;
      const now = Date.now();
      // Remove layout compensation from velocity, including coalesced events.
      const travelOffset = offset - (event.scrollAdjustment ?? current.anchorAdjustment);
      const delta = travelOffset - current.lastScrollOffset;
      const elapsed = now - current.lastScroll;
      if (programmed || elapsed >= 1000) current.velocity = 0;
      else if (elapsed > 0) current.velocity = Math.max(-40, Math.min(40, delta / elapsed));
      if (elapsed > 0) { current.lastScroll = now; current.lastScrollOffset = travelOffset; }
      current.offset = Math.max(0, offset);
      if (!programmed) current.target = -1;
      current.correction = false;
      const runway = Math.max(overscan / 2, Math.min(viewport.height * 2, Math.abs(current.velocity) * current.renderLatency));
      const top = current.layout.offset(current.windowStart);
      const bottom = current.layout.offset(current.windowEnd);
      if (current.windowStart < 0 || current.windowStart > 0 && offset < top + runway ||
          current.windowEnd < current.layout.count && offset + viewport.height > bottom - runway) redraw(value => value + 1);
      props.onScroll?.(offset, event);
    },
    children: View({ style: { width: viewport.width, height: current.layout.totalHeight, flexShrink: 0, flexDirection: 'column' }, children: rows }),
  });
}

class VirtualListState {
  layout = new VariableHeightLayout();
  data: unknown = null;
  version: Key | undefined;
  width = -1;
  estimate = 0;
  offset = 0;
  correction = false;
  target = -1;
  expectedOffset: number | undefined;
  anchorAdjustment = 0;
  windowStart = -1;
  windowEnd = 0;
  velocity = 0;
  lastScroll = 0;
  lastScrollOffset = 0;
  renderLatency = 200;
}
