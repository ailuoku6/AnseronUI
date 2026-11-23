import { common } from '@kit.AbilityKit';
import { HarmonyHost, ServiceArgs } from './HarmonyHost';
import { HarmonyPageStack, HarmonyRoute } from './HarmonyPageStack';

export class HarmonyController {
  back: () => void = () => {};
  selectPage: (page: string) => void = () => {};
  trimMemory: () => void = () => {};
  setMaxRetainedPages: (value: number) => void = () => {};
  setVisibility: (visible: boolean) => void = () => {};
  onPageEvicted: (page: string) => void = () => {};
  inspectRuntime: (enabled?: boolean, reset?: boolean) => void = () => {};
  onRuntimeStats: (values: Record<string, number>) => void = () => {};
}
@Component
export struct AnseronView {
  controller: HarmonyController = new HarmonyController();
  buildId: string = '';
  initialPage: string = '';
  pages: string[] = [];
  maxRetainedPages: number = Infinity;
  showPageTabs: boolean = true;
  @StorageLink('anseronuiColorMode') @Watch('appearanceChanged') private colorMode: number = 1;
  @StorageLink('anseronuiActive') @Watch('lifecycle') private appActive: boolean = true;
  @StorageLink('anseronuiMemoryPressure') @Watch('memoryPressure') private memoryVersion: number = 0;
  @State private routes: HarmonyRoute[] = [];
  @State private failure: string = '';
  private stack: HarmonyPageStack | null = null;
  private viewportWidth: number = 0;
  private viewportHeight: number = 0;
  private active: boolean = true;
  private externallyVisible: boolean = true;
  aboutToAppear(): void {
    this.stack = new HarmonyPageStack(this.pages, route => this.createHost(route));
    this.stack.onChange = () => { this.routes = this.stack!.entries.slice(); };
    this.stack.onEvict = page => this.controller.onPageEvicted(page);
    this.stack.setMaxRetainedPages(this.maxRetainedPages);
    this.controller.back = () => this.back();
    this.controller.selectPage = page => { if (this.pages.includes(page) && this.stack?.current()?.page !== page) this.stack?.load(page); };
    this.controller.trimMemory = () => this.stack?.trimMemory();
    this.controller.inspectRuntime = (enabled: boolean = true, reset: boolean = false) => (this.stack?.current()?.host as HarmonyHost | null)?.inspectRuntime(enabled, reset);
    this.controller.setMaxRetainedPages = value => this.stack?.setMaxRetainedPages(value);
    this.controller.setVisibility = visible => { this.externallyVisible = visible; this.lifecycle(); };
    this.lifecycle();
  }
  private appearanceChanged(): void { this.routes.forEach(route => (route.host as HarmonyHost | null)?.setAppearance(this.colorMode === 0)); }
  private memoryPressure(): void { this.stack?.trimMemory(); }
  private lifecycle(): void {
    this.routes.forEach(route => (route.host as HarmonyHost | null)?.setActive(this.appActive));
    this.stack?.setVisible(this.appActive && this.active && this.externallyVisible);
  }
  aboutToDisappear(): void {
    this.stack?.destroy(); this.stack = null;
    this.controller.back = () => {}; this.controller.selectPage = () => {};
    this.controller.trimMemory = () => {}; this.controller.setMaxRetainedPages = () => {}; this.controller.setVisibility = () => {};
    this.controller.inspectRuntime = () => {};
  }
  private createHost(route: HarmonyRoute): HarmonyHost {
    const host = new HarmonyHost(this.getUIContext().getHostContext() as common.UIAbilityContext, this.getUIContext(), this.buildId, route.page);
    host.router = (method: string, args: ServiceArgs): Object | null => this.stack!.navigate(route, method, args.page, args.params);
    host.onFailure = reason => { this.failure = reason; };
    host.onRuntimeStats = values => this.controller.onRuntimeStats(values);
    host.setActive(this.appActive); host.setVisible(this.appActive && this.active && this.externallyVisible);
    host.start(this.viewportWidth, this.viewportHeight);
    return host;
  }
  back(): void {
    const route = this.stack?.current(); if (!route?.host) return;
    (route.host as HarmonyHost).back(consumed => {
      if (consumed || this.stack?.current() !== route) return;
      if (this.routes.length > 1) this.stack!.navigate(route, 'pop');
      else void (this.getUIContext().getHostContext() as common.UIAbilityContext).moveAbilityToBackground();
    });
  }
  build() {
    Column() {
      if (this.showPageTabs) {
        Scroll() {
          Row({ space: 8 }) {
            ForEach(this.pages, (page: string) => {
              Button(page).fontSize(13).height(38).padding({ left: 14, right: 14 })
                .backgroundColor(this.routes[this.routes.length - 1]?.page === page ? '#3559dc' : '#e9edf4')
                .fontColor(this.routes[this.routes.length - 1]?.page === page ? '#ffffff' : '#263246')
                .onClick(() => this.controller.selectPage(page))
            }, (page: string) => page)
          }.padding({ left: 12, right: 12 })
        }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).height(48).width('100%')
      }
      Stack({ alignContent: Alignment.TopStart }) {
        ForEach(this.routes.filter(route => route.host !== null), (route: HarmonyRoute) => {
          Stack({ alignContent: Alignment.TopStart }) { ContentSlot((route.host as HarmonyHost).content) }
            // ANSERONUI_DEVTOOLS_BEGIN
            .id((route.host as HarmonyHost).devtoolsRootId)
            // ANSERONUI_DEVTOOLS_END
            .width('100%').height('100%')
            .visibility(route.id === this.routes[this.routes.length - 1]?.id ? Visibility.Visible : Visibility.Hidden)
        }, (route: HarmonyRoute) => route.id)
        if (this.failure.length > 0) { Text('AnseronUI: ' + this.failure).fontColor('#b00020').padding(16) }
      }
      .layoutWeight(1).width('100%').clip(true)
      .onAreaChange((_old: Area, area: Area) => {
        this.viewportWidth = Number(area.width); this.viewportHeight = Number(area.height);
        if (this.routes.length === 0 && this.viewportWidth > 0 && this.viewportHeight > 0) this.stack?.load(this.initialPage);
        else this.routes.forEach(route => (route.host as HarmonyHost | null)?.resize(this.viewportWidth, this.viewportHeight));
      })
      .onVisibleAreaChange([0, 1], (visible: boolean) => { this.active = visible; this.lifecycle(); })
    }.width('100%').height('100%')
  }
}
