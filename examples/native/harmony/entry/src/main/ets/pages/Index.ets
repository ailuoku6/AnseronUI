import { AnseronView, HarmonyController } from '../anseronui/AnseronView';
@Entry
@Component
struct Index {
  private controller: HarmonyController = new HarmonyController();
  onBackPress(): boolean { this.controller.back(); return true; }
  build() { Stack() { AnseronView({controller:this.controller,buildId:"anseronui-demo",initialPage:"components",pages:["appearance","counter","async-form","components","extensions","timers","virtual-list"],showPageTabs:true,maxRetainedPages:Infinity}) }.width('100%').height('100%') }
}
