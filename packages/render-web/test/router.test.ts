import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from '../src/router.js';

describe('route parameter entries', () => {
  afterEach(() => vi.useRealTimers());
  it('snapshots nested params, isolates same-page entries and restores params after back', () => {
    vi.useFakeTimers(); const navigate = vi.fn(); const router = new BrowserRouter(navigate);
    const initial = { nested: { text: '首页' }, values: [1, true, null] };
    router.load('home', initial); initial.nested.text = 'mutated'; vi.runAllTimers();
    expect(router.params.nested).toEqual({ text: '首页' });
    router.push('details', { id: 'first' }); vi.runAllTimers();
    router.push('details', { id: 'second' }); vi.runAllTimers();
    expect(router.routeStack).toEqual(['home', 'details', 'details']);
    const copy = router.params; copy.id = 'changed'; expect(router.params.id).toBe('second');
    expect(router.pop()).toBe(true); vi.runAllTimers(); expect(router.params.id).toBe('first');
    router.replace('details', { id: 'replacement' }); vi.runAllTimers();
    expect(router.params).toEqual({ id: 'replacement' }); expect(router.routeStack).toHaveLength(2);
    router.pop(); vi.runAllTimers(); expect(router.params.nested).toEqual({ text: '首页' });
    expect(router.pop()).toBe(false); expect(navigate).toHaveBeenLastCalledWith('home');
  });
  it('defaults to empty params and settles routing module calls before navigation', () => {
    vi.useFakeTimers(); const navigate = vi.fn(); const router = new BrowserRouter(navigate); const signal = new AbortController().signal;
    router.load('home', { old: true }); vi.runAllTimers(); navigate.mockClear();
    expect(router.handler('push', { page: 'details' }, signal)).toBeNull(); expect(navigate).not.toHaveBeenCalled();
    expect(router.handler('current', {}, signal)).toBe('details'); expect(router.handler('getParams', {}, signal)).toEqual({});
    vi.runAllTimers(); expect(navigate).toHaveBeenCalledWith('details');
    router.load('home'); expect(router.params).toEqual({});
    expect(() => router.handler('push', { page: 'details', params: [] }, signal)).toThrow('INVALID_ROUTE_PARAMS');
    expect(() => router.push('bad/page')).toThrow('INVALID_ROUTE');
    expect(() => router.push('details', { text: 'x'.repeat(48000) })).toThrow('ROUTE_PARAMS_TOO_LARGE');
    expect(router.routeStack).toEqual(['home']);
  });
});

describe('entry ownership', () => {
  afterEach(() => vi.useRealTimers());
  it('keeps covered entry params readable and rejects navigation from covered or removed pages', () => {
    vi.useFakeTimers(); const router = new BrowserRouter(() => {}); const signal = new AbortController().signal;
    router.load('home', { id: 'original' }); vi.runAllTimers(); const rootID = router.entryId!; const root = router.handlerFor(rootID);
    router.push('details', { id: 'second' }); vi.runAllTimers(); const detailID = router.entryId!; const detail = router.handlerFor(detailID);
    expect(root('getParams', {}, signal)).toEqual({ id: 'original' });
    expect(root('current', {}, signal)).toBe('home');
    expect(() => root('push', { page: 'details' }, signal)).toThrow('INACTIVE_ROUTE');
    router.pop(); vi.runAllTimers(); expect(router.entryId).toBe(rootID);
    expect(() => detail('getParams', {}, signal)).toThrow('SURFACE_DISPOSED');
    router.push('home'); vi.runAllTimers(); expect(router.entryId).not.toBe(rootID);
  });
});
