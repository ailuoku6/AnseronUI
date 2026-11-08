import { validateAnimationOptions, validateAnimationStyle } from '@anseronui/protocol';
import type { AnimationOptions, AnimationStyle, AnimationResult } from '@anseronui/ui';

export type Values = Record<string, number>;
export const visualDefaults: Values = { opacity: 1, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0, borderRadius: 0, r: 0, g: 0, b: 0, a: 0 };
export function curve(t: number, easing = 'easeInOut'): number {
  if (easing === 'linear') return t;
  if (easing === 'easeIn') return t*t*t;
  if (easing === 'easeOut') return 1-Math.pow(1-t,3);
  if (easing === 'spring') return t === 1 ? 1 : (1-Math.exp(-6*t)*Math.cos(10*t))/(1-Math.exp(-6)*Math.cos(10));
  return t*t*(3-2*t);
}
/** A node owns one timeline. The declared model and displayed values are separate,
 * so unrelated commits cannot reset imperative overrides or restart an animation. */
export class NodeAnimation {
  current: Values = { ...visualDefaults };
  private target: Values = { ...visualDefaults };
  private declared: Values = {};
  private staged: Values = {};
  private mounted = false;
  options?: AnimationOptions;
  private frame = 0;
  private completion?: (result: AnimationResult) => void;
  constructor(private paint: (values: Values) => void,
    private clock = { now: () => performance.now(), request: (callback: FrameRequestCallback) => requestAnimationFrame(callback), cancel: (id: number) => cancelAnimationFrame(id) }) {}
  stage(values: Values): void {
    for (const key of Object.keys(values)) if (values[key] !== this.declared[key]) { this.declared[key] = values[key]; this.staged[key] = values[key]; }
  }
  commit(): void {
    if (Object.keys(this.staged).length) {
      const next = { ...this.target, ...this.staged }; this.staged = {};
      if (this.mounted && this.options) this.start(next, this.options);
      else { this.cancel(); this.target = next; this.current = { ...next }; this.paint(this.current); }
    } else this.paint(this.current);
    this.mounted = true;
  }
  animate(style: AnimationStyle, options: AnimationOptions = {}): Promise<AnimationResult> {
    validateAnimationStyle(style); validateAnimationOptions(options);
    const values: Values = {};
    for (const [key, value] of Object.entries(style)) if (key !== 'backgroundColor') values[key] = value as number;
    if (style.backgroundColor) Object.assign(values, colorValues(style.backgroundColor));
    return new Promise(resolve => this.start({ ...this.target, ...values }, options, resolve));
  }
  cancel(): void {
    if (this.frame) this.clock.cancel(this.frame);
    this.frame = 0;
    const complete = this.completion; this.completion = undefined;
    this.target = { ...this.current };
    complete?.({ finished: false });
  }
  private start(next: Values, options: AnimationOptions, complete?: (result: AnimationResult) => void): void {
    this.cancel(); this.target = next; this.completion = complete;
    const from = { ...this.current }, start = this.clock.now() + (options.delay ?? 0), duration = options.duration ?? 300;
    const legs = options.autoreverse ? 2 : 1, iterations = options.iterations ?? 1;
    const tick = (now: number) => {
      this.frame = 0;
      if (now < start) { this.frame = this.clock.request(tick); return; }
      const elapsed = now-start;
      const done = duration === 0 || (iterations !== -1 && elapsed >= duration*legs*iterations);
      const progress = duration === 0 ? 1 : elapsed/duration;
      const leg = Math.floor(progress);
      let t = done ? (options.autoreverse ? 0 : 1) : progress-leg;
      if (!done && options.autoreverse && leg % 2 === 1) t = 1-t;
      const amount = curve(t, options.easing);
      for (const key of Object.keys(next)) this.current[key] = (from[key] ?? next[key]) + (next[key]-(from[key] ?? next[key]))*amount;
      this.paint(this.current);
      if (done) {
        this.target = { ...this.current }; const callback = this.completion; this.completion = undefined; callback?.({ finished: true });
      } else this.frame = this.clock.request(tick);
    };
    // Always use the platform frame clock, including zero duration, to preserve ordering.
    this.frame = this.clock.request(tick);
  }
}
export function colorValues(color: string): Values {
  if (!color || color === 'transparent') return {r:0,g:0,b:0,a:0};
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    const rgb = parseInt(color.slice(1),16); return {r:(rgb>>16)&255,g:(rgb>>8)&255,b:rgb&255,a:1};
  }
  // CSS parser handles static named/rgb colors; animation targets use #RRGGBB.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d')!; context.clearRect(0,0,1,1); context.fillStyle = color || 'transparent'; context.fillRect(0,0,1,1);
  const [r,g,b,a] = context.getImageData(0,0,1,1).data; return {r,g,b,a:a/255};
}
export function paintElement(element: HTMLElement, v: Values): void {
  if (v.x !== undefined) { element.style.left=v.x+'px'; element.style.top=v.y+'px'; element.style.width=Math.max(0,v.width)+'px'; element.style.height=Math.max(0,v.height)+'px'; }
  element.style.opacity=String(Math.max(0,Math.min(1,v.opacity)));
  element.style.transform=`translate(${v.translateX}px, ${v.translateY}px) rotate(${v.rotate}deg) scale(${v.scaleX}, ${v.scaleY})`;
  element.style.borderRadius=Math.max(0,v.borderRadius)+'px';
  element.style.backgroundColor=`rgba(${Math.round(v.r)},${Math.round(v.g)},${Math.round(v.b)},${Math.max(0,Math.min(1,v.a))})`;
}
