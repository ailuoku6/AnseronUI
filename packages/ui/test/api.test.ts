import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Fragment, NativeComponent, RefCell, Text, View, createContext, createNativeComponent, createRef,
  definePage, normalizeChildren, setHookDispatcher, useCallback, useContext, useEffect, useImperativeHandle,
  useMemo, usePageEffect, usePageVisibility, useReducer, useRef, useRouter, useServices, useState, useTimers,
} from '../src/index.js';
import type { HookDispatcher, Services } from '../src/index.js';
import { jsx, jsxs, jsxDEV } from '../src/jsx-runtime.js';
import { template, templateNode } from '../src/template.js';

afterEach(() => setHookDispatcher(null));

describe('public UI value constructors', () => {
  it('normalizes children and builds every host and component entry point', () => {
    const text = Text({ children: ['a', null, false, 3, [undefined, 'b']] });
    expect(normalizeChildren([null, false, 'a', [1, undefined, Text({ children: 'b' })]])).toEqual([
      'a', 1, expect.objectContaining({ kind: 'host', tag: 'Text' }),
    ]);
    expect(text.children).toEqual(['a', 3, 'b']);
    expect(View({ key: 0, children: text }).key).toBe(0);
    expect(Fragment({ key: 'fragment', children: [text] })).toMatchObject({ kind: 'fragment', key: 'fragment' });
    expect(NativeComponent({ name: 'Demo.Control', nativeProps: { enabled: true } })).toMatchObject({
      kind: 'host', tag: 'Native', props: expect.objectContaining({ name: 'Demo.Control' }),
    });
    const Demo = createNativeComponent<{ enabled: boolean }>('Demo.Control');
    expect(Demo({ nativeProps: { enabled: false } })).toMatchObject({
      kind: 'host', tag: 'Native', props: expect.objectContaining({ name: 'Demo.Control', nativeProps: { enabled: false } }),
    });
    for (const name of ['', '1bad', 'bad name', 'x'.repeat(129)]) expect(() => createNativeComponent(name)).toThrow('INVALID_NATIVE_NAME');
  });

  it('validates page names and keeps ref storage identity', () => {
    const component = () => Text({ children: 'page' });
    expect(definePage('home_2', component)).toEqual({ name: 'home_2', component });
    for (const name of ['', 'Home', 'home.page', 'home page']) expect(() => definePage(name, component)).toThrow('Invalid page name');
    const ref = createRef<number>();
    expect(ref).toBeInstanceOf(RefCell);
    expect(ref.current).toBeNull();
    ref.current = 42;
    expect(ref.current).toBe(42);
  });
});

describe('JSX and compiler template runtime ABI', () => {
  it('supports jsx, jsxs, jsxDEV aliases and rejects raw text in non-text hosts', () => {
    expect(jsx(View, { children: Text({ children: 'ok' }) }, 'v')).toMatchObject({ kind: 'host', tag: 'View', key: 'v' });
    expect(jsxs(Fragment, { children: ['a', 'b'] }, 2)).toMatchObject({ kind: 'fragment', key: 2 });
    expect(jsxDEV(Text, { children: 'text' })).toMatchObject({ kind: 'host', tag: 'Text' });
    expect(() => jsx(View, { children: 'raw text' })).toThrow('RAW_TEXT_OUTSIDE_TEXT');
    expect(() => jsx({} as never, {})).toThrow('Unsupported JSX component');
  });

  it('applies static and dynamic template fields in descriptor order', () => {
    const plan = {
      siteId: 'api-test',
      nodes: [{ tag: 'View' as const, key: 'root', props: { testID: 'root' }, children: [1] },
        { tag: 'Text' as const, key: null, props: { color: 'red' }, children: [], text: 'static' }],
      fields: [{ node: 0, field: 'testID', input: 0 }, { node: 0, field: 'children', input: 1 }],
    };
    expect(template(plan, ['dynamic', 'text'])).toMatchObject({ kind: 'template', plan, values: ['dynamic', 'text'] });
    expect(templateNode(plan, 0, ['dynamic', 'text'], null)).toMatchObject({
      kind: 'host', tag: 'View', key: 'root', props: { testID: 'dynamic', children: 'text' }, children: ['text'],
    });
    expect(templateNode(plan, 1, [], null)).toMatchObject({ kind: 'host', tag: 'Text', children: ['static'] });
  });
});

describe('hook facade contract', () => {
  it('forwards every hook to the active dispatcher and preserves imperative cleanup', () => {
    const calls: Array<[string, unknown[]]> = [];
    const cleanups: Array<() => void> = [];
    const effect = vi.fn((setup: () => void | (() => void)) => { const cleanup = setup(); if (cleanup) cleanups.push(cleanup); });
    const services = {
      page: { isVisible: () => true, subscribe: vi.fn(() => () => {}) },
      timers: { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() },
      router: { push: vi.fn(), replace: vi.fn(), pop: vi.fn(), back: vi.fn(), current: vi.fn(), getParams: vi.fn() },
      subscribe: vi.fn(), invoke: vi.fn(), http: { getText: vi.fn(), request: vi.fn() }, sleep: vi.fn(),
    } as unknown as Services;
    const dispatcher = {
      state: (initial: unknown) => { calls.push(['state', [initial]]); return [typeof initial === 'function' ? (initial as () => unknown)() : initial, vi.fn()]; },
      reducer: (reducer: unknown, initial: unknown) => { calls.push(['reducer', [reducer, initial]]); return [initial, vi.fn()]; },
      ref: (initial: unknown) => { calls.push(['ref', [initial]]); return { current: initial }; },
      effect,
      memo: (factory: () => unknown, deps: readonly unknown[]) => { calls.push(['memo', [deps]]); return factory(); },
      context: (context: { defaultValue: unknown }) => { calls.push(['context', [context]]); return context.defaultValue; },
      services: () => services,
    } as unknown as HookDispatcher;
    setHookDispatcher(dispatcher);

    const reducer = (state: number, action: number) => state + action;
    expect(useState(() => 1)[0]).toBe(1);
    expect(useReducer(reducer, 2)[0]).toBe(2);
    expect(useRef('ref').current).toBe('ref');
    useEffect(() => {}, [1]);
    expect(useMemo(() => 'memo', [1])).toBe('memo');
    const callback = () => 'callback';
    expect(useCallback(callback, [1])).toBe(callback);
    const context = createContext('default');
    expect(context.Provider({ value: 'provided', children: 'child' })).toMatchObject({ kind: 'provider', contextId: context.id, value: 'provided', children: ['child'] });
    expect(useContext(context)).toBe('default');
    expect(useServices()).toBe(services);
    expect(useTimers()).toBe(services.timers);
    expect(useRouter()).toBe(services.router);
    expect(usePageVisibility()).toBe(true);
    usePageEffect(() => () => {}, []);
    const ref = createRef<{ value: number }>();
    useImperativeHandle(ref, () => ({ value: 3 }), [1]);
    expect(ref.current).toEqual({ value: 3 });
    expect(calls.map(([name]) => name)).toEqual(expect.arrayContaining(['state', 'reducer', 'ref', 'memo', 'context']));
    expect(effect).toHaveBeenCalled();
    expect(services.page.subscribe).toHaveBeenCalled();
    for (const cleanup of cleanups) cleanup();
    expect(ref.current).toBeNull();
  });

  it('fails clearly when hooks are called outside a render dispatcher', () => {
    expect(() => useState(0)).toThrow('HOOK_OUTSIDE_RENDER');
    expect(() => useContext(createContext('x'))).toThrow('HOOK_OUTSIDE_RENDER');
  });
});
