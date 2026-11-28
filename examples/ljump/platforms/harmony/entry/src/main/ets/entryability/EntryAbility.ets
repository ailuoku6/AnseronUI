import { Want, Configuration, AbilityConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { HarmonyAbility } from '../anseronui/HarmonyAbility';
import { configureServices } from '../ServiceSetup';
export default class EntryAbility extends HarmonyAbility {
  onCreate(want: Want, param: AbilityConstant.LaunchParam): void {
    if (!want) return;
    configureServices(this.context);
    super.onCreate(want, param);
  }
  // Forward Stage lifecycle callbacks to the shared host.
  onWindowStageCreate(stage: window.WindowStage): void { super.onWindowStageCreate(stage); }
  onNewWant(want: Want, param: AbilityConstant.LaunchParam): void { super.onNewWant(want, param); }
  onForeground(): void { super.onForeground(); }
  onBackground(): void { super.onBackground(); }
  onConfigurationUpdate(configuration: Configuration): void { super.onConfigurationUpdate(configuration); }
  onMemoryLevel(level: AbilityConstant.MemoryLevel): void { super.onMemoryLevel(level); }
}
