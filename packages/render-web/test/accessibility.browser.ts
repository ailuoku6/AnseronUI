import { DOMRenderer } from '../src/renderer.js';
import type { RenderCommand, RenderProps } from '@anseronui/protocol';

export async function verifyAccessibility(): Promise<void> {
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
  const root = document.createElement('div'); document.body.append(root);
  const events: { type: string; event?: string }[] = [];
  const renderer = new DOMRenderer(root, event => events.push(event));
  let revision = 0;
  const apply = (commands: RenderCommand[]) => renderer.apply(++revision, commands);
  const props = (value: RenderProps) => apply([{ type: 'SetProps', nodeId: 1, props: value }]);
  try {
    apply([{ type: 'CreateNode', nodeId: 1, kind: 'View' }, { type: 'SetProps', nodeId: 1, props: {
      accessibilityRole: 'checkbox', accessibilityLabel: '通知', accessibilityChecked: true,
      accessibilityHint: '切换通知', accessibilityValue: '开启', accessibilitySelected: true,
    } }, { type: 'InsertChild', nodeId: 1, parentId: 0, index: 0 },
    { type: 'BindEvent', nodeId: 1, event: 'tap', enabled: true },
    { type: 'BindEvent', nodeId: 1, event: 'longPress', enabled: true },
    { type: 'CreateNode', nodeId: 2, kind: 'TextInput' }, { type: 'SetProps', nodeId: 2, props: { value: '输入内容', accessibilityLabel: '姓名' } },
    { type: 'InsertChild', nodeId: 2, parentId: 1, index: 0 }]);
    const node = renderer.getNode(1)!, input = renderer.getNode(2)! as HTMLInputElement;
    assert(node.getAttribute('role') === 'checkbox' && node.getAttribute('aria-checked') === 'true', 'checkbox role and state');
    assert(node.getAttribute('aria-description') === '开启，切换通知', 'hint and value');
    node.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    assert(events.filter(e => e.type === 'Tap').length === 1 && events.filter(e => e.event === 'longPress').length === 1, 'reader keyboard actions reach callbacks');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    assert(events.filter(e => e.type === 'Tap').length === 1, 'parent reader key handler preserves input typing');
    props({ accessibilityRole: 'button', accessibilityClickable: false, accessibilityLongClickable: false });
    node.click();
    assert(events.filter(e => e.type === 'Tap').length === 1, 'explicit reader click suppression');
    props({ accessibilityRole: 'button', disabled: true });
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert(events.filter(e => e.type === 'Tap').length === 1, 'disabled activation suppressed');
    props({ accessibilityRole: 'none' });
    assert(node.getAttribute('role') === 'presentation' && !node.hasAttribute('aria-hidden'), 'none retains descendants');
    assert(input.getAttribute('aria-label') === '姓名' && input.value === '输入内容', 'child input remains accessible');
    props({ accessibilityHidden: true });
    let rejected = false;
    try { await renderer.invoke(2, 'accessibilityFocus', null); } catch { rejected = true; }
    assert(rejected, 'hidden ancestor rejects reader focus');
    props({ accessibilityRole: 'text', accessibilityLabel: '结果' });
    assert(node.getAttribute('role') === 'group', 'named text exposes its author label as a group');
    await renderer.invoke(1, 'accessibilityFocus', null);
    assert(document.activeElement === node && document.activeElement !== input, 'reader focus does not focus the child input');
    props({});
    assert(!node.hasAttribute('aria-label') && !node.hasAttribute('aria-description') && !node.hasAttribute('aria-valuetext')
      && !node.hasAttribute('aria-checked') && !node.hasAttribute('aria-pressed') && !node.hasAttribute('aria-current') && !node.hasAttribute('aria-hidden') && !node.hasAttribute('role'), 'removed props reset all ARIA overrides');
    await renderer.invoke(1, 'accessibilityAnnounce', { message: '保存成功' });
    await new Promise(resolve => setTimeout(resolve, 70));
    assert(root.querySelector('[role="status"]')?.textContent === '保存成功', 'announcement live region');
    await renderer.invoke(1, 'accessibilityAnnounce', { message: '保存成功' });
    assert(root.querySelector('[role="status"]')?.textContent === '', 'repeated announcements clear before republishing');
    renderer.clear();
    await new Promise(resolve => setTimeout(resolve, 70));
    assert(!root.children.length, 'clear removes announcements and pending speech');
    let unmounted = false;
    try { await renderer.invoke(1, 'accessibilityFocus', null); } catch { unmounted = true; }
    assert(unmounted, 'removed reader ref rejects');
  } finally { renderer.dispose(); root.remove(); }
}
