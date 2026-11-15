import { expect, it } from 'vitest';
import { VariableHeightLayout } from '../src/virtual-layout.js';

it('indexes 5000 variable heights and matches a linear oracle after measurements', () => {
  const layout = new VariableHeightLayout();
  const keys = Array.from({ length: 5000 }, (_, i) => 'row-' + i);
  layout.reset(keys, 48);
  const heights = keys.map((_, i) => 15 + i * 37 % 213);
  for (let i = 0; i < keys.length; i++) layout.measure(keys[i], heights[i], layout.generation);
  let sum = 0;
  for (let i = 0; i < keys.length; i++) {
    expect(layout.offset(i)).toBe(sum);
    expect(layout.at(sum)).toBe(i);
    expect(layout.at(sum + heights[i] - 0.01)).toBe(i);
    sum += heights[i];
  }
  expect(layout.totalHeight).toBe(sum);
  expect(layout.at(sum + 1000)).toBe(4999);
  expect(layout.range(sum, 400, 100).end).toBe(5000);
});
it('retains keyed measurements through prepend/reorder, prunes removals and rejects stale layout callbacks', () => {
  const layout = new VariableHeightLayout(); layout.reset(['a', 'b', 'c'], 40);
  const old = layout.generation;
  layout.measure('b', 110, old);
  layout.reset(['new', 'c', 'b', 'a'], 40);
  expect(layout.height(2)).toBe(110);
  expect(layout.offset(3)).toBe(190);
  expect(layout.measure('b', 999, old)).toBe(false);
  layout.reset(['a'], 40); layout.reset(['a', 'b'], 40);
  expect(layout.height(1)).toBe(40);
  layout.measure('b', 90, layout.generation); layout.reset(['a', 'b'], 50, true);
  expect(layout.height(1)).toBe(50);
  expect(() => layout.reset(['a', 'a'], 40)).toThrow('DUPLICATE_LIST_KEY');
  expect(() => layout.reset(['a'], 0)).toThrow('INVALID_ESTIMATED');
});

it('skips collapsed zero-height rows and handles an empty list', () => {
  const layout = new VariableHeightLayout(); layout.reset(['a', 'b', 'c'], 40);
  layout.measure('a', 0, layout.generation); layout.measure('b', 0, layout.generation);
  expect(layout.totalHeight).toBe(40); expect(layout.at(0)).toBe(2);
  expect(layout.offset(2)).toBe(0);
  layout.reset([], 40); expect(layout.totalHeight).toBe(0);
  expect(layout.range(200, 400, 80)).toEqual({ start: 0, end: 0 });
});
