import { expect, it } from 'vitest';
import { NodeAnimation, curve, visualDefaults } from '../src/animation.js';
import { validateAnimationOptions, validateAnimationStyle, validProps } from '@anseronui/protocol';

function harness() {
  let time = 0, next = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const animation = new NodeAnimation(() => {}, { now: () => time, request: callback => { pending.set(++next, callback); return next; }, cancel: id => { pending.delete(id); } });
  animation.stage({ ...visualDefaults, x: 0, y: 0, width: 50, height: 50, translateX: 0 }); animation.commit();
  return { animation, tick: (at: number) => { time = at; const work = [...pending.values()]; pending.clear(); for (const callback of work) callback(time); }, pending };
}
it('interpolates frames, delays, replaces from presentation and retains overrides on unrelated commits', async () => {
  const { animation: a, tick } = harness();
  const first = a.animate({ translateX: 100 }, { duration: 1000, delay: 100, easing: 'linear' });
  tick(50); expect(a.current.translateX).toBe(0);
  tick(600); expect(a.current.translateX).toBe(50);
  a.stage({ opacity: 1 }); a.commit(); // Unchanged declaration must not restart the timeline.
  tick(700); expect(a.current.translateX).toBe(60);
  const second = a.animate({ translateX: 150 }, { duration: 1000, easing: 'linear' });
  await expect(first).resolves.toEqual({ finished: false });
  tick(1200); expect(a.current.translateX).toBe(105);
  a.stage({ translateX: 0 }); a.commit();
  expect(a.current.translateX).toBe(105);
  tick(1700); await expect(second).resolves.toEqual({ finished: true });
  expect(a.current.translateX).toBe(150);
  a.options = {duration:1000,easing:'linear'};
  a.stage({ x:100,width:150 }); a.commit(); tick(2200);
  expect(a.current.x).toBe(50); expect(a.current.width).toBe(100);
  a.cancel(); expect(a.current.x).toBe(50);
});
it('finishes finite autoreverse, cancels infinite loops exactly once and handles zero duration', async () => {
  const { animation: a, tick, pending } = harness();
  const finite = a.animate({ rotate: 180 }, { duration:100, iterations:2, autoreverse:true, easing:'linear' });
  tick(150); expect(a.current.rotate).toBe(90);
  tick(400); await expect(finite).resolves.toEqual({finished:true}); expect(a.current.rotate).toBe(0);
  const infinite = a.animate({ scaleX:2 }, { duration:100,iterations:-1,autoreverse:true });
  tick(450); a.cancel(); a.cancel(); await expect(infinite).resolves.toEqual({finished:false}); expect(pending.size).toBe(0);
  const zero = a.animate({ opacity:0.5 }, {duration:0}); tick(500);
  await expect(zero).resolves.toEqual({finished:true}); expect(a.current.opacity).toBe(0.5);
});
it('validates options and visual target ranges at the boundary', () => {
  for (const value of [{duration:-1},{delay:Infinity},{iterations:0},{duration:0,iterations:-1},{easing:'bad'},{autoreverse:1},{extra:1}]) expect(() => validateAnimationOptions(value)).toThrow();
  for (const value of [{opacity:2},{borderRadius:-1},{width:20},{rotate:NaN},{backgroundColor:'red'},{}]) expect(() => validateAnimationStyle(value)).toThrow();
  expect(validProps({animation:'{"duration":300}',translateX:-10,scaleX:0,rotate:180})).toBe(true);
  expect(validProps({animation:'{"duration":-1}'})).toBe(false);
  expect(curve(0,'spring')).toBe(0); expect(curve(1,'spring')).toBe(1); expect(curve(0.3,'spring')).toBeGreaterThan(1);
});
