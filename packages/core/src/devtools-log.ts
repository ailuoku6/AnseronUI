export type DevtoolsLogLevel = "log" | "info" | "debug" | "warn" | "error";
export type DevtoolsLogSink = (level: DevtoolsLogLevel, args: unknown[]) => void;

// The active surface is selected by the Core owner before it handles a
// message. This keeps page code independent from the platform host while
// still attributing logs to the page that produced them.
const sinks = new Map<number, DevtoolsLogSink>();
let activeSurface = 0;
const pending = new Map<number, Array<{ level: DevtoolsLogLevel; args: unknown[] }>>();

export function __anseronuiDevtoolsSetLogSink(surfaceId: number, sink: DevtoolsLogSink): void {
  sinks.set(surfaceId, sink);
  activeSurface = surfaceId;
  for (const log of pending.get(surfaceId) ?? []) sink(log.level, log.args);
  pending.delete(surfaceId);
}

export function __anseronuiDevtoolsClearLogSink(surfaceId: number): void {
  sinks.delete(surfaceId);
  pending.delete(surfaceId);
  if (activeSurface === surfaceId) activeSurface = 0;
}

export function __anseronuiDevtoolsSetActiveSurface(surfaceId: number): void {
  activeSurface = surfaceId;
}

export function __anseronuiDevtoolsLog(level: DevtoolsLogLevel, ...args: unknown[]): void {
  const sink = sinks.get(activeSurface);
  if (sink) sink(level, args);
  else {
    const queue = pending.get(activeSurface) ?? [];
    if (queue.length < 200) queue.push({ level, args });
    pending.set(activeSurface, queue);
  }
  console[level](...args);
}
