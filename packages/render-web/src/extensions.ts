/** Register factories per host; each mounted node owns its extension instance. */
export interface NativeViewInstance {
  element: HTMLElement;
  /** Optional container for TSX children. Without it, the native component is a leaf. */
  content?: HTMLElement;
  setProps(props: Record<string, unknown>): void;
  invoke?(method: string, args: unknown): unknown | Promise<unknown>;
  dispose?(): void;
}
export type NativeViewFactory = (context: { document: Document; emit(name: string, data?: unknown): void }) => NativeViewInstance;
export type NativeModuleHandler = (method: string, args: unknown, signal: AbortSignal) => unknown | Promise<unknown>;
export interface PlatformExtensions {
  modules?: Record<string, NativeModuleHandler>;
  components?: Record<string, NativeViewFactory>;
  /** Handles the built-in router module. The app host owns the page stack. */
  router?: NativeModuleHandler;
}
