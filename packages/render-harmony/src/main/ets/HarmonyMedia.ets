import { BuilderNode, FrameNode } from '@kit.ArkUI';
import { media } from '@kit.MediaKit';
import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { SurfaceController, VideoState, videoBuilder } from './HarmonyVideoSurface';
interface VideoProperties { src?: string; controls?: boolean; autoplay?: boolean; loop?: boolean; muted?: boolean; rate?: number; resizeMode?: string; playControl?: string; }
interface MediaEvent { event: string; source?: string; state?: string; x?: number; duration?: number; errorCode?: number; }
/** AVPlayer exposes actual first-frame and millisecond playback events. */
class VideoEntry {
  private static serial: number = 0;
  builder: BuilderNode<[VideoState]>;
  state: VideoState;
  props: VideoProperties = {};
  disposed: boolean = false;
  visible: boolean = true;
  playing: boolean = false;
  wantsPlay: boolean = false;
  private player: media.AVPlayer | null = null;
  private controlling: media.AVPlayer | null = null;
  private surfaceId: string = '';
  private epoch: number = 0;
  private loading: Promise<void> = Promise.resolve();
  private releasing: Promise<void> = Promise.resolve();
  private rawPath: string = '';
  private context: common.UIAbilityContext;
  private emit: (value: MediaEvent) => void;
  constructor(ui: UIContext, emit: (value: MediaEvent) => void) {
    this.context = ui.getHostContext() as common.UIAbilityContext; this.emit = emit;
    const surface = new SurfaceController();
    this.state = new VideoState('anseronui-video-' + (++VideoEntry.serial), surface);
    this.state.toggle = () => { this.wantsPlay = !this.playing; this.applyControl(); };
    this.state.seek = time => { if (this.player && ['prepared','playing','paused','completed'].includes(this.player.state)) this.player.seek(Math.round(time)); };
    surface.created = id => { this.surfaceId = id; void this.load(); };
    surface.removed = () => { this.surfaceId = ''; this.epoch++; void this.release(); };
    this.builder = new BuilderNode<[VideoState]>(ui); this.builder.build(wrapBuilder(videoBuilder), this.state);
  }
  private event(value: MediaEvent): void { if (!this.disposed) this.emit(value); }
  private failed(error: Object): void {
    if (this.disposed) return;
    this.event({ event: 'loadFailure', source: this.props.src ?? '', errorCode: (error as BusinessError).code ?? -1 });
    this.event({ event: 'playStateDidChanged', state: 'error' });
  }
  private redraw(): void {
    if (this.disposed) return;
    this.state.playing = this.playing; this.state.controls = this.props.controls ?? true; this.builder.update(this.state);
  }
  private async release(): Promise<void> {
    const player = this.player, path = this.rawPath; this.player = null; this.rawPath = ''; this.playing = false;
    this.releasing = this.releasing.then(async () => {
      if (player) { try { await player.release(); } catch (_error) {} }
      if (path) { try { await this.context.resourceManager.closeRawFd(path); } catch (_error) {} }
    });
    await this.releasing;
  }
  private load(): Promise<void> {
    const epoch = ++this.epoch;
    // Serialize raw-file ownership: a stale open must close before reopening the same path.
    this.loading = this.loading.then(() => this.loadSource(epoch));
    return this.loading;
  }
  private async loadSource(epoch: number): Promise<void> {
    if (epoch !== this.epoch || this.disposed) return;
    const source = this.props.src ?? '';
    await this.release(); this.state.time = 0; this.state.duration = 0;
    if (this.disposed || !this.surfaceId || !source || epoch !== this.epoch) return;
    try {
      const player = await media.createAVPlayer();
      if (this.disposed || epoch !== this.epoch) { await player.release(); return; }
      this.player = player; let firstFrame = false;
      const current = (): boolean => !this.disposed && epoch === this.epoch && this.player === player;
      player.on('stateChange', (state: string) => {
        if (!current()) return;
        if (state === 'initialized') { player.surfaceId = this.surfaceId; void player.prepare().catch((error: BusinessError) => { if (current()) this.failed(error); }); }
        else if (state === 'prepared') {
          this.state.duration = Math.max(0, player.duration); this.configure();
          this.event({ event: 'loadSuccess', source }); this.applyControl(); this.redraw();
          // Android and Web expose the first decoded frame even when a video
          // starts paused. Decode a 1ms preview frame on Harmony so the
          // initial player is not an opaque black rectangle.
          if (!this.wantsPlay) player.seek(1);
        } else if (state === 'playing' || state === 'paused' || state === 'completed' || state === 'stopped') {
          this.playing = state === 'playing';
          if (state === 'completed' && !this.props.loop) this.wantsPlay = false;
          this.event({ event: 'playStateDidChanged', state: state === 'completed' ? 'ended' : state === 'stopped' ? 'paused' : state });
          this.redraw(); if (state === 'playing' || state === 'paused') this.applyControl();
        }
      });
      player.on('startRenderFrame', () => { if (current() && !firstFrame) { firstFrame = true; this.event({ event: 'firstFrameDidDisplay', source }); } });
      player.on('timeUpdate', time => { if (current()) { this.state.time = time; this.event({ event: 'playTimeDidChanged', x: time, duration: this.state.duration }); if (this.state.controls) this.redraw(); } });
      player.on('durationUpdate', duration => { if (current()) this.state.duration = Math.max(0, duration); });
      player.on('error', error => { if (current()) this.failed(error); });
      if (source.startsWith('asset://')) {
        const path = 'assets/' + source.substring(8);
        if (path.includes('..')) throw new Error('INVALID_ARGUMENT: video asset');
        const fd = await this.context.resourceManager.getRawFd(path);
        if (!current()) { await this.context.resourceManager.closeRawFd(path); return; }
        this.rawPath = path; player.fdSrc = { fd: fd.fd, offset: fd.offset, length: fd.length };
      } else player.url = source;
    } catch (error) { if (epoch === this.epoch) this.failed(error as Object); }
  }
  private configure(): void {
    const player = this.player; if (!player || !['prepared','playing','paused','completed'].includes(player.state)) return;
    player.loop = this.props.loop ?? false; player.setVolume(this.props.muted ? 0 : 1);
    player.videoScaleType = this.props.resizeMode === 'cover' ? media.VideoScaleType.VIDEO_SCALE_TYPE_FIT_CROP : this.props.resizeMode === 'stretch' ? media.VideoScaleType.VIDEO_SCALE_TYPE_FIT : media.VideoScaleType.VIDEO_SCALE_TYPE_SCALED_ASPECT;
    player.setPlaybackRate(this.props.rate ?? 1);
  }
  private applyControl(): void {
    const player = this.player; if (!player || this.controlling === player) return;
    const play = this.visible && this.wantsPlay && ['prepared','paused','completed'].includes(player.state);
    const pause = (!this.visible || !this.wantsPlay) && player.state === 'playing';
    if (!play && !pause) return;
    this.controlling = player;
    const operation = play ? player.play() : player.pause();
    void operation.then(() => {
      if (this.controlling === player) this.controlling = null;
      if (this.player === player) this.applyControl();
    }).catch((error: BusinessError) => {
      if (this.controlling === player) this.controlling = null;
      if (this.player === player) this.failed(error);
    });
  }
  update(props: VideoProperties): void {
    const previous = this.props; this.props = props;
    if (props.src !== previous.src) this.wantsPlay = props.playControl === 'play' || (props.playControl === undefined && props.autoplay === true);
    if (props.playControl !== previous.playControl) { if (props.playControl === 'play') this.wantsPlay = true; else if (props.playControl === 'pause' || props.playControl === 'stop') this.wantsPlay = false; }
    this.redraw();
    if (props.src !== previous.src) { void this.load(); return; }
    this.configure(); this.applyControl();
    if (props.playControl === 'stop' && previous.playControl !== 'stop' && this.player && ['prepared','playing','paused','completed'].includes(this.player.state)) this.player.seek(0);
  }
  setVisible(visible: boolean): void { this.visible = visible; this.applyControl(); }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.epoch++; void this.release(); this.builder.dispose(); }
}
export class HarmonyMedia {
  private entries: Map<number, VideoEntry> = new Map();
  private ui: UIContext;
  private emit: (node: number, event: MediaEvent) => void;
  private isVisible: boolean = true;
  constructor(ui: UIContext, emit: (node: number, event: MediaEvent) => void) { this.ui = ui; this.emit = emit; }
  create(node: number): FrameNode | null {
    const entry = new VideoEntry(this.ui, event => this.emit(node, event)); entry.setVisible(this.isVisible); this.entries.set(node, entry); return entry.builder.getFrameNode();
  }
  update(node: number, bytes: string): void { const entry = this.entries.get(node); if (!entry) throw new Error('VIDEO_UNMOUNTED'); entry.update(JSON.parse(bytes) as VideoProperties); }
  visible(visible: boolean): void { this.isVisible = visible; this.entries.forEach(entry => entry.setVisible(visible)); }
  remove(node: number): void { this.entries.get(node)?.dispose(); this.entries.delete(node); }
  dispose(): void { this.entries.forEach(entry => entry.dispose()); this.entries.clear(); }
}
