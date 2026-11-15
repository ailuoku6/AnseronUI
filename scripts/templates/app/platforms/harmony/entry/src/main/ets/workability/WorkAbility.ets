import { WorkSchedulerExtensionAbility, workScheduler } from '@kit.BackgroundTasksKit';
import { HarmonyBackground } from '../anseronui/HarmonyApplicationServices';
import { configureServices } from '../ServiceSetup';
export default class AnseronUIWorkAbility extends WorkSchedulerExtensionAbility {
  onWorkStart(work: workScheduler.WorkInfo): void {
    configureServices(this.context); HarmonyBackground.start(this.context, work);
  }
  onWorkStop(work: workScheduler.WorkInfo): void { HarmonyBackground.stop(work); }
}
