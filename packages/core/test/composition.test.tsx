import { expect, it } from 'vitest';
import { definePage } from '@anseronui/ui';
import { CompositionShowcase } from '../../../examples/components/composition-showcase.js';
import { TestHost } from './host-harness.js';

it('preserves custom Hook and HOC state through component props, element slots, render props and parent rerenders', async () => {
  const host = new TestHost(definePage('composition', CompositionShowcase));
  await host.mount('composition');
  const byID = (id: string) => [...host.nodes].find(([, node]) => node.props.testID === id)!;
  const text = (value: string) => [...host.nodes.values()].some(node => node.props.text === value);
  const tap = async (id: string) => { host.send({ type: 'Tap', nodeId: byID(id)[0], revision: host.revision }); await host.settle(); };
  expect(byID('composition-counter')[1].props.text).toBe('Hook: 2 / double: 4');
  expect(byID('composition-ready')[1].props.text).toBe('render prop: ready');
  expect(byID('composition-child')[1].props.text).toBe('children slot');
  await tap('composition-increment');
  expect(byID('composition-counter')[1].props.text).toBe('Hook: 3 / double: 6');
  await tap('composition-hoc'); expect(text('HOC: 1')).toBe(true);
  const counterID = byID('composition-counter')[0];
  await tap('composition-rerender');
  expect(text('父组件更新: 1')).toBe(true);
  expect(text('HOC: 1')).toBe(true);
  expect(byID('composition-counter')[0]).toBe(counterID);
  expect(byID('composition-counter')[1].props.text).toBe('Hook: 3 / double: 6');
  host.runtime.dispose();
});
