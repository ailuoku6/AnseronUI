import { afterEach, expect, it, vi } from 'vitest';
import { clearTimeout, forgetTimeout, registerTimerScope, setTimeout, timeoutInScope, unregisterTimerScope, withTimerScope } from '../src/timers.js';
import type { TimerScope } from '../src/timers.js';

const scopes: TimerScope[] = [];
afterEach(() => { for (const scope of scopes.splice(0)) unregisterTimerScope(scope); });

it('routes scoped timers, clamps delays and clears ownership', () => {
  const scope = { active: true, schedule: vi.fn(), cancel: vi.fn() };
  scopes.push(scope); registerTimerScope(scope);
  let called = 0;
  const id = withTimerScope(scope, () => setTimeout(() => { called++; }, -10));
  expect(scope.schedule).toHaveBeenCalledWith(id, expect.any(Function), 0);
  clearTimeout(id);
  expect(scope.cancel).toHaveBeenCalledWith(id);
  expect(called).toBe(0);
  const scoped = timeoutInScope(scope, () => {}, Infinity);
  expect(scope.schedule).toHaveBeenLastCalledWith(scoped, expect.any(Function), 0);
  forgetTimeout(scoped); clearTimeout(scoped);
  expect(scope.cancel).toHaveBeenCalledTimes(1);
  const large = timeoutInScope(scope, () => {}, 3e9);
  expect(scope.schedule).toHaveBeenLastCalledWith(large, expect.any(Function), 2147483647);
  const fractional = timeoutInScope(scope, () => {}, 12.9);
  expect(scope.schedule).toHaveBeenLastCalledWith(fractional, expect.any(Function), 12);
});

it('enforces scope, callback and lifecycle errors', () => {
  expect(() => setTimeout(() => {})).toThrow('TIMER_SCOPE_REQUIRED');
  const inactive = { active: false, schedule: vi.fn(), cancel: vi.fn() };
  expect(() => timeoutInScope(inactive, () => {})).toThrow('SURFACE_DISPOSED');
  const scope = { active: true, schedule: vi.fn(), cancel: vi.fn() }; scopes.push(scope);
  expect(() => timeoutInScope(scope, null as never)).toThrow('TIMER_CALLBACK_REQUIRED');
  registerTimerScope(scope); unregisterTimerScope(scope);
  expect(scope.active).toBe(false);
  expect(() => withTimerScope(scope, () => timeoutInScope(scope, () => {}))).toThrow('SURFACE_DISPOSED');
  clearTimeout(undefined); clearTimeout(null);
});

it('requires explicit ownership for multiple surfaces and restores nested scope after an error', () => {
  const first = { active: true, schedule: vi.fn(), cancel: vi.fn() };
  const second = { active: true, schedule: vi.fn(), cancel: vi.fn() };
  for (const scope of [first, second]) { scopes.push(scope); registerTimerScope(scope); }
  expect(() => setTimeout(() => {})).toThrow('TIMER_SCOPE_REQUIRED');
  withTimerScope(first, () => {
    expect(() => withTimerScope(second, () => { setTimeout(() => {}, 2); throw new Error('nested'); })).toThrow('nested');
    setTimeout(() => {}, 1);
  });
  expect(second.schedule).toHaveBeenCalledWith(expect.any(Number), expect.any(Function), 2);
  expect(first.schedule).toHaveBeenCalledWith(expect.any(Number), expect.any(Function), 1);
  unregisterTimerScope(first);
  expect(first.cancel).toHaveBeenCalledTimes(1); expect(second.cancel).not.toHaveBeenCalled();
});

it('removes a timer after scheduling fails so disposal does not cancel an unknown handle', () => {
  const scope = { active: true, schedule: vi.fn(() => { throw new Error('host unavailable'); }), cancel: vi.fn() };
  scopes.push(scope);
  expect(() => timeoutInScope(scope, () => {})).toThrow('host unavailable');
  unregisterTimerScope(scope); expect(scope.cancel).not.toHaveBeenCalled();
});
