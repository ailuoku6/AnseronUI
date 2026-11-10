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
export type HostTag = "View" | "Text" | "RichText" | "Button" | "TextInput" | "ScrollView" | "Image" | "Video" | "Native";

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
  borderColor?: string; borderWidth?: number; borderRadius?: number;
  overflow?: "visible" | "hidden";
  visibility?: "visible" | "hidden";
  fontSize?: number; fontWeight?: "normal" | "bold"; fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  textDecorationLine?: "none" | "underline" | "line-through";
}

export interface LayoutEvent { x: number; y: number; width: number; height: number }
export interface ScrollEvent { x: number; y: number; contentWidth: number; contentHeight: number }
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
export interface CommonProps {
  key?: Key; style?: Style; children?: Child;
  ref?: RefTarget<NodeHandle>;
  /** Animate this node's changed visual styles and computed frame; initial mount is immediate. */
  animation?: AnimationOptions;
  testID?: string; accessibilityLabel?: string;
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
export interface ViewProps extends CommonProps {}
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
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  /** Vertical offset is retained as the first argument for compatibility. */
  onScroll?: (offset: number, event: ScrollEvent) => void;
  onScrollEnd?: (event: ScrollEvent) => void;
}
export type MediaResizeMode = "cover" | "contain" | "stretch";
export interface ImageProps extends CommonProps {
  src: string;
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
export function Button(props: ButtonProps): HostElement { return host("Button", props); }
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
