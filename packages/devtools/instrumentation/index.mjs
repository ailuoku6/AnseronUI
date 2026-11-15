import { readFileSync } from 'node:fs';

export function debugBuildOptions(target, env = process.env) {
  // A normal platform build is a Debug build.  Keep the opt-out explicit so a
  // direct `build-core` invocation cannot silently produce an uninstrumented
  // inspector session simply because the caller did not export an env var.
  const enabled = env.ANSERONUI_RELEASE_BUILD !== '1' && env.ANSERONUI_DEBUG_BUILD !== '0';
  const platform = ({'ios-simulator':'ios','ios-device':'ios','macos-arm64':'macos',native:'macos',wasm:'web'})[target] ?? target;
  const endpoint = env.ANSERONUI_DEVTOOLS_ENDPOINT ?? 'http://127.0.0.1:8091/__anseronui_devtools/ingest';
  if (enabled && !/^https?:\/\//.test(endpoint)) throw new Error('ANSERONUI_DEVTOOLS_ENDPOINT must be an HTTP(S) URL');
  return { enabled, platform, endpoint: enabled ? endpoint : '' };
}
function once(source, anchor, replacement, rewrite) {
  if (source.split(anchor).length !== 2) throw new Error('DevTools injection anchor changed: ' + anchor);
  return rewrite(source, anchor, replacement);
}
export function instrumentSource(path, source, options) {
  if (!options.enabled) return source;
  const rewrite = options.rewrite ?? ((text, search, replacement, all = false) => all ? text.replaceAll(search, replacement) : text.replace(search, replacement));
  const patch = (text, anchor, replacement) => once(text, anchor, replacement, rewrite);
  // Debug business code has no platform-independent console transport. Route
  // its calls through the shared Core sink; Release source is returned above
  // before this rewrite and therefore keeps the original calls untouched.
  const rewritable = !path.startsWith('packages/') || path.endsWith('packages/core/src/business-runtime.ts');
  if (rewritable && !path.endsWith('packages/core/src/devtools-log.ts')) {
    source = rewrite(source, /\bconsole\.(log|info|debug|warn|error)\s*\(\s*\)/g, '__anseronuiDevtoolsLog("$1")');
    source = rewrite(source, /\bconsole\.(log|info|debug|warn|error)\s*\(/g, '__anseronuiDevtoolsLog("$1", ');
  }
  if (path.endsWith('packages/ui/src/index.ts')) {
    source = patch(source, 'export interface Page<P = {}> {', 'export interface Page<P = {}> { devtoolsName?: string;');
    source = patch(source, 'component: Component<P>): Page<P>', 'component: Component<P>, devtoolsName?: string): Page<P>');
    source = patch(source, 'return { name, component };', 'return { name, component, devtoolsName };');
    source = patch(source, 'export interface ComponentElement {', 'export interface ComponentElement { devtoolsName?: string;');
  }
  if (path.endsWith('packages/ui/src/jsx-runtime.ts')) {
    source = patch(source, 'key?: Key): UIElement', 'key?: Key, devtoolsName?: string): UIElement');
    source = patch(source, 'kind: "component", component: type', 'kind: "component", devtoolsName, component: type');
  }
  if (path.endsWith('packages/core/src/business-runtime.ts')) {
    source = rewrite(source, /^/, 'import { __anseronuiDevtoolsClearLogSink, __anseronuiDevtoolsLog, __anseronuiDevtoolsSetActiveSurface, __anseronuiDevtoolsSetLogSink } from "./devtools-log.js";\n');
    source = patch(source, 'private handle(input: Envelope<InputPayload>): void {', 'private handle(input: Envelope<InputPayload>): void {\n    __anseronuiDevtoolsSetActiveSurface(input.surfaceId);');
    source = patch(source, 'type ComponentFrame = {', 'type ComponentFrame = { devtoolsName?: string;');
    source = patch(source, 'type DraftFrame = {', 'type DraftFrame = { devtoolsName?: string;');
    source = rewrite(source, 'path: framePath, component: element.component', 'path: framePath, devtoolsName: element.devtoolsName, component: element.component', true);
    source = patch(source, 'path: frame.path, component: frame.component, props: frame.props,', 'path: frame.path, devtoolsName: frame.devtoolsName, component: frame.component, props: frame.props,');
    source = patch(source, 'surface.revision = revision;', 'surface.revision = revision;\n    this.devtoolsStart(surface);');
    source = patch(source, 'private disposeSurface(surface: Surface): void {', 'private disposeSurface(surface: Surface): void {\n    this.devtoolsStop(surface);');
    source = patch(source, 'this.emit(surface, { type: "InvokeModule", requestId, module, method, argument });', 'this.devtoolsTrace(surface, requestId, module, method, argument, owner);\n    this.emit(surface, { type: "InvokeModule", requestId, module, method, argument });');
    source = patch(source, 'const timer = surface.timers.get(payload.requestId);', 'this.devtoolsResult(surface, payload.requestId, payload.ok, payload.value);\n      const timer = surface.timers.get(payload.requestId);');
    source = patch(source, 'payload: OutputPayload): void {', 'payload: OutputPayload): void {\n    if (payload.type === "Diagnostic") this.devtoolsDiagnostic(surface.id, payload.code, payload.message, payload.stack);');
    let methods = readFileSync(new URL('./runtime.inc', import.meta.url), 'utf8');
    methods = methods.replaceAll("'__PLATFORM__'", JSON.stringify(options.platform)).replaceAll("'__PLATFORM__-'", JSON.stringify(options.platform + '-')).replaceAll("'__ENDPOINT__'", JSON.stringify(options.endpoint));
    source = patch(source, 'export class BusinessRuntime {', 'export class BusinessRuntime {\n' + methods);
  }
  return source;
}
