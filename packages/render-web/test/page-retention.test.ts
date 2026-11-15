import { expect, it } from 'vitest';
import { BrowserPageStack } from '../src/page-stack.js';
class ElementStub {
  className = ''; clientWidth = 320; clientHeight = 480;
  children: ElementStub[] = [];
  constructor(readonly ownerDocument: DocumentStub) {}
  replaceChildren(...nodes: ElementStub[]) { this.children = nodes; }
  remove() {}
}
class DocumentStub extends EventTarget { hidden = false; createElement() { return new ElementStub(this); } }
it('preserves covered hosts, combines document/container visibility and recreates evicted entries with original params', async () => {
  const doc = new DocumentStub(); const root = new ElementStub(doc);
  const created: { page: string; events: boolean[]; destroyed: number; router: Function }[] = [];
  const stack = new BrowserPageStack(root as unknown as HTMLElement, async (_root, page, router) => {
    const record = { page, events: [] as boolean[], destroyed: 0, router }; created.push(record);
    return { resize: async () => {}, handleBackPress: async () => false, setVisibility: async (value: boolean) => { record.events.push(value); }, destroy: async () => { record.destroyed++; } };
  });
  try {
    stack.router.load('home', { id: 'original' }); await stack.whenIdle();
    stack.router.push('details'); await stack.whenIdle();
    expect(created[0].events.at(-1)).toBe(false); expect(created[0].destroyed).toBe(0);
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); await stack.whenIdle();
    expect(created[1].events.at(-1)).toBe(false);
    doc.hidden = false; await stack.setVisibility(true); expect(created[1].events.at(-1)).toBe(true);
    await stack.trimMemory(); expect(created[0].destroyed).toBe(1); expect(stack.router.routeStack).toEqual(['home', 'details']);
    stack.router.pop(); await stack.whenIdle(); expect(created).toHaveLength(3);
    expect(created[2].router('getParams', {}, new AbortController().signal)).toEqual({ id: 'original' });
    await stack.setMaxRetainedPages(1); stack.router.push('more'); await stack.whenIdle(); expect(created[2].destroyed).toBe(1);
    await expect(stack.setMaxRetainedPages(0)).rejects.toThrow('INVALID_PAGE_RETENTION_LIMIT');
  } finally { await stack.destroy(); }
  expect(created.every(value => value.destroyed === 1)).toBe(true);
});

it('still destroys all retained pages after visibility transitions fail', async () => {
  const doc = new DocumentStub(); const root = new ElementStub(doc);
  const destroyed: string[] = []; let fail = false;
  const stack = new BrowserPageStack(root as unknown as HTMLElement, async (_root, page) => ({
    resize: async () => {}, handleBackPress: async () => false,
    setVisibility: async () => { if (fail) throw new Error('host visibility failed'); },
    destroy: async () => { destroyed.push(page); },
  }));
  stack.router.load('home'); await stack.whenIdle();
  stack.router.push('details'); await stack.whenIdle();
  fail = true;
  await expect(stack.setVisibility(false)).rejects.toThrow('host visibility failed');
  await expect(stack.destroy()).rejects.toThrow('host visibility failed');
  expect(destroyed).toEqual(['home', 'details']);
});
