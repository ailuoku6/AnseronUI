import { UIAbility, Want, Configuration, AbilityConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { HarmonyLinking } from './HarmonyLinking';
import { HarmonyNotifications } from './HarmonyApplicationServices';

/** Subclass to add app-specific push/native setup while retaining lifecycle forwarding. */
export class HarmonyAbility extends UIAbility {
  onCreate(want: Want, _param: AbilityConstant.LaunchParam): void {
    // UIAbility construction can dispatch this hook before the launch Want exists.
    if (!want) return;
    AppStorage.setOrCreate('anseronuiActive', true);
    AppStorage.setOrCreate('anseronuiColorMode', this.context.config.colorMode);
    AppStorage.setOrCreate('anseronuiMemoryPressure', 0);
    HarmonyLinking.receive(want, true); HarmonyNotifications.receiveWant(this.context, want);
  }
  onNewWant(want: Want, _param: AbilityConstant.LaunchParam): void {
    HarmonyLinking.receive(want); HarmonyNotifications.receiveWant(this.context, want);
  }
  onForeground(): void { AppStorage.setOrCreate('anseronuiActive', true); }
  onBackground(): void { AppStorage.setOrCreate('anseronuiActive', false); }
  onConfigurationUpdate(configuration: Configuration): void { if (configuration.colorMode !== undefined) AppStorage.setOrCreate('anseronuiColorMode', configuration.colorMode); }
  onMemoryLevel(_level: AbilityConstant.MemoryLevel): void { AppStorage.setOrCreate('anseronuiMemoryPressure', (AppStorage.get<number>('anseronuiMemoryPressure') ?? 0) + 1); }
  onWindowStageCreate(stage: window.WindowStage): void {
    stage.loadContent('pages/Index', error => {
      if (error.code) console.error('AnseronUI loadContent: ' + JSON.stringify(error));
    });
  }
}
