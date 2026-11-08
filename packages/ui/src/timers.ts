/** Timers use the platform host; no Node event loop is embedded in the bundle. */
export interface TimerScope {
  active: boolean;
  schedule(id: number, callback: () => void, milliseconds: number): void;
  cancel(id: number): void;
}
const scopes: TimerScope[] = [];
const owners = new Map<number, TimerScope>();
let current: TimerScope | null = null;
let nextId = 1;

export function registerTimerScope(scope: TimerScope): void { scopes.push(scope); }
export function forgetTimeout(id: number): void { owners.delete(id); }
export function unregisterTimerScope(scope: TimerScope): void {
  scope.active = false;
  for (const [id, owner] of owners) if (owner === scope) { owners.delete(id); scope.cancel(id); }
  const index = scopes.indexOf(scope);
  if (index >= 0) scopes.splice(index, 1);
}
export function withTimerScope<T>(scope: TimerScope, callback: () => T): T {
  const previous = current;
  current = scope;
  try { return callback(); } finally { current = previous; }
}
export function timeoutInScope(scope: TimerScope, callback: () => void, delay = 0): number {
  if (!scope.active) throw new Error("SURFACE_DISPOSED");
  if (typeof callback !== "function") throw new Error("TIMER_CALLBACK_REQUIRED");
  if (nextId > 0xffffffff) throw new Error("TIMER_ID_OVERFLOW");
  const id = nextId++;
  const milliseconds = !Number.isFinite(delay) || delay < 0 ? 0 : Math.min(2147483647, Math.floor(delay));
  owners.set(id, scope);
  try { scope.schedule(id, callback, milliseconds); }
  catch (error) { owners.delete(id); throw error; }
  return id;
}
/** Returns a numeric handle. String callbacks and Node Timeout objects are not supported. */
export function setTimeout(callback: () => void, delay = 0): number {
  const scope = current ?? (scopes.length === 1 ? scopes[0] : null);
  if (!scope) throw new Error("TIMER_SCOPE_REQUIRED: use useTimers() when multiple surfaces are active");
  return timeoutInScope(scope, callback, delay);
}
export function clearTimeout(id: number | undefined | null): void {
  if (id === undefined || id === null) return;
  const scope = owners.get(id);
  if (!scope) return;
  owners.delete(id);
  scope.cancel(id);
}
export interface Timers {
  setTimeout(callback: () => void, delay?: number): number;
  clearTimeout(id: number | undefined | null): void;
}
