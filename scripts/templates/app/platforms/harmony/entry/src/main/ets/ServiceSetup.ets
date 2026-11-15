import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { HarmonyBackground } from './anseronui/HarmonyApplicationServices';

/** Called in both UI and background startup, including a cold background launch. */
export function configureServices(context: common.Context): void {
  HarmonyBackground.register(context.applicationInfo.name + '.refresh', (workerContext, complete) => {
    let cancelled = false;
    void preferences.getPreferences(workerContext, { name: 'anseronui-background-example' }).then(async store => {
      if (cancelled) return;
      await store.put('lastRefresh', Date.now()); await store.flush();
      if (!cancelled) complete(true);
    }).catch(() => { if (!cancelled) complete(false); });
    return () => { cancelled = true; };
  });
}
