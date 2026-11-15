import { Want } from '@kit.AbilityKit';

/** Ability-scoped delivery also works before a page has mounted. */
export class HarmonyLinking {
  private static initialURL: string | null = null;
  private static listeners: Set<(url: string) => void> = new Set();
  static receive(want: Want | undefined, initial: boolean = false): void {
    const url = want?.uri ?? '';
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) || url.startsWith('anseronui-notification:')) return;
    if (initial) HarmonyLinking.initialURL = url;
    else HarmonyLinking.listeners.forEach(listener => listener(url));
  }
  static getInitialURL(): string | null { return HarmonyLinking.initialURL; }
  static listen(listener: (url: string) => void): () => void {
    HarmonyLinking.listeners.add(listener);
    return () => { HarmonyLinking.listeners.delete(listener); };
  }
}
