export class SurfaceController extends XComponentController {
  created: (id: string) => void = () => {};
  removed: () => void = () => {};
  onSurfaceCreated(id: string): void { this.created(id); }
  onSurfaceDestroyed(_id: string): void { this.removed(); }
}
export class VideoState {
  id: string;
  surface: SurfaceController;
  controls: boolean = true;
  playing: boolean = false;
  duration: number = 0;
  time: number = 0;
  toggle: () => void = () => {};
  seek: (time: number) => void = () => {};
  constructor(id: string, surface: SurfaceController) { this.id = id; this.surface = surface; }
}
@Builder
export function videoBuilder(state: VideoState) {
  Stack({ alignContent: Alignment.Bottom }) {
    // Texture composition participates in the parent's rounded clip and transforms.
    // A separate SURFACE plane can keep drawing square video above that clip.
    XComponent({ id: state.id, type: XComponentType.TEXTURE, controller: state.surface }).width('100%').height('100%')
    if (state.controls) {
      Row({ space: 8 }) {
        Button(state.playing ? '暂停' : '播放').fontSize(12).height(30).onClick(() => state.toggle())
        Slider({ value: state.time, min: 0, max: Math.max(1, state.duration), step: 1000 })
          .layoutWeight(1).onChange((value: number, mode: SliderChangeMode) => { if (mode === SliderChangeMode.End || mode === SliderChangeMode.Click) state.seek(value); })
      }.width('100%').padding(6).backgroundColor('#99000000')
    }
  }.width('100%').height('100%').clip(true)
}
