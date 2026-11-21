import { cleanup } from './Cleanup';
import native from 'libanseronui.so';
import { displaySync } from '@kit.ArkGraphics2D';
export type VisualValues = Record<string, number | string>;
export interface Options { duration?: number; delay?: number; iterations?: number; autoreverse?: boolean; easing?: string; }
export interface Request { style: VisualValues; options?: Options; }
interface Result { finished: boolean; }
class Animation {
  start: VisualValues;
  target: VisualValues;
  options: Options;
  started: number = Date.now();
  complete: (value: Result) => void;
  constructor(start: VisualValues, target: VisualValues, options: Options, complete: (value: Result) => void) {
    this.start = start; this.target = target; this.options = options; this.complete = complete;
  }
}
/** One platform frame clock per surface; never enter Core during a frame. */
export class HarmonyAnimation {
  snapshot(node: number): VisualValues { const all = native.invokeView(this.surface, node, 'getVisual', '{}') as VisualValues; const value: VisualValues = {}; for (const key of ['opacity','translateX','translateY','scaleX','scaleY','rotate','borderRadius','backgroundColor','x','y','width','height']) value[key] = all[key] ?? (key === 'scaleX' || key === 'scaleY' || key === 'opacity' ? 1 : key === 'backgroundColor' ? '#000000' : 0); return value; }
  private surface: number;
  private entries: Map<number, Animation> = new Map();
  private clock: displaySync.DisplaySync = displaySync.create();
  private running: boolean = false;
  private pausedAt: number | null = null;
  constructor(surface: number) { this.surface = surface; this.clock.on('frame', () => this.frame()); }
  setVisible(visible: boolean): void {
    if (!visible && this.pausedAt === null) {
      this.pausedAt = Date.now();
      if (this.running) this.clock.stop();
      this.running = false;
    } else if (visible && this.pausedAt !== null) {
      const pause = Date.now() - this.pausedAt;
      this.entries.forEach(animation => { animation.started += pause; });
      this.pausedAt = null;
      if (this.entries.size > 0) { this.running = true; this.clock.start(); }
    }
  }
  cancel(node: number): void {
    const previous = this.entries.get(node); this.entries.delete(node);
    if (previous) previous.complete({ finished: false });
    if (this.entries.size === 0 && this.running) { this.clock.stop(); this.running = false; }
  }
  dispose(): void {
    const animations = Array.from(this.entries.values()); this.entries.clear();
    animations.forEach(animation => cleanup(() => animation.complete({ finished: false })));
    if (this.running) cleanup(() => this.clock.stop());
    cleanup(() => this.clock.off('frame')); this.running = false;
  }
  animate(node: number, request: Request, initial?: VisualValues): Promise<Result> {
    this.cancel(node);
    const options = request.options ?? {};
    const duration = options.duration ?? 300, delay = options.delay ?? 0, iterations = options.iterations ?? 1;
    if (!Number.isFinite(duration) || duration < 0 || duration > 600000 || !Number.isFinite(delay) || delay < 0 || delay > 600000 ||
      !Number.isInteger(iterations) || (iterations !== -1 && (iterations < 1 || iterations > 10000)) || (duration === 0 && iterations === -1)) throw new Error('INVALID_ARGUMENT: animation options');
    if (!['linear','easeIn','easeOut','easeInOut','spring'].includes(options.easing ?? 'easeInOut')) throw new Error('INVALID_ARGUMENT: animation easing');
    const start = initial ?? this.snapshot(node);
    const target = request.style;
    if (Object.keys(target).length === 0) throw new Error('INVALID_ARGUMENT: empty animation');
    for (const key of Object.keys(target)) {
      if (!['opacity','translateX','translateY','scaleX','scaleY','rotate','borderRadius','backgroundColor','x','y','width','height'].includes(key)) throw new Error('INVALID_ARGUMENT: animation style');
      if (key === 'backgroundColor') { if (!/^#[0-9a-fA-F]{6}$/.test(String(target[key]))) throw new Error('INVALID_ARGUMENT: animation color'); }
      else if (!Number.isFinite(Number(target[key]))) throw new Error('INVALID_ARGUMENT: animation number');
      if (start[key] === undefined) start[key] = key === 'scaleX' || key === 'scaleY' || key === 'opacity' ? 1 : key === 'backgroundColor' ? '#000000' : 0;
    }
    return new Promise<Result>(resolve => {
      const animation = new Animation(start, target, options, resolve);
      animation.started = this.pausedAt ?? Date.now();
      this.entries.set(node, animation);
      native.invokeView(this.surface, node, 'setVisual', JSON.stringify(start));
      if (!this.running && this.pausedAt === null) { this.running = true; this.clock.start(); }
      this.frame();
    });
  }
  private frame(): void {
    if (this.pausedAt !== null) return;
    const time = Date.now();
    this.entries.forEach((animation: Animation, node: number) => {
      const options = animation.options;
      const elapsed = time - animation.started - (options.delay ?? 0);
      if (elapsed < 0) return;
      const duration = options.duration ?? 300, iterations = options.iterations ?? 1;
      const period = duration * (options.autoreverse ? 2 : 1);
      const done = duration === 0 || (iterations !== -1 && elapsed >= period * iterations);
      let progress = done ? options.autoreverse ? 0 : 1 : (elapsed % period) / duration;
      if (progress > 1) progress = 2 - progress;
      switch (options.easing ?? 'easeInOut') {
        case 'linear': break;
        case 'easeIn': progress *= progress; break;
        case 'easeOut': progress = 1 - (1 - progress) * (1 - progress); break;
        case 'spring': progress = progress === 1 ? 1 : 1 - Math.exp(-7 * progress) * Math.cos(10 * progress); break;
        default: progress = progress * progress * (3 - 2 * progress);
      }
      const value: VisualValues = {};
      for (const key of Object.keys(animation.target)) {
        if (key === 'backgroundColor') {
          const a = parseInt(String(animation.start[key]).substring(1), 16), b = parseInt(String(animation.target[key]).substring(1), 16);
          let color = 0;
          for (const shift of [16,8,0]) color |= Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * Math.max(0,Math.min(progress,1))) << shift;
          value[key] = '#' + color.toString(16).padStart(6,'0');
        } else value[key] = Number(animation.start[key]) + (Number(animation.target[key]) - Number(animation.start[key])) * progress;
      }
      try { native.invokeView(this.surface, node, 'setVisual', JSON.stringify(value)); }
      catch (_error) { this.cancel(node); return; }
      if (done) { this.entries.delete(node); animation.complete({ finished: true }); }
    });
    if (this.entries.size === 0 && this.running) { this.clock.stop(); this.running = false; }
  }
}
