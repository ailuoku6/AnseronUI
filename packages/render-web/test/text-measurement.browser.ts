import { definePage } from '@anseronui/ui';
import { BrowserHost, BrowserReferenceHost, WasmRuntime, measureBrowserText } from '../src/index.js';
import { measurementSample, measurementStyle, TextMeasurementShowcase } from '../../../examples/components/text-measurement-showcase.js';

/** Public API → platform typesetting → Promise → TSX, in JS or real Wasm. */
export async function verifyTextMeasurement(business?: Uint8Array, framework?: Uint8Array): Promise<void> {
  const root = document.createElement('div'); root.style.cssText = 'width:390px;height:844px'; document.body.append(root);
  const host = business && framework ? new BrowserHost(root, await WasmRuntime.load(business, framework))
    : new BrowserReferenceHost(root, definePage('components', TextMeasurementShowcase));
  const node = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message + '; ' + root.outerHTML + '; ' + JSON.stringify(host.diagnostics)); };
  const tick = async () => { for (let i = 0; i < 20; i++) { await host.flush(); await Promise.resolve(); } };
  try {
    await host.mount('components', 390, 844);
    for (let i = 0; i < 100 && !node('text-measure-toggle'); i++) {
      await new Promise(resolve => setTimeout(resolve, 10)); await tick();
    }
    assert(node('text-measure-toggle'), 'overflow creates an expand button');
    const width = node('text-measure-content').getBoundingClientRect().width;
    const bodyChildren = document.body.childElementCount;
    const full = await measureBrowserText(root)('Text', measurementSample, 16, width, { lineHeight: measurementStyle.lineHeight! });
    const collapsed = await measureBrowserText(root)('Text', measurementSample, 16, width, { lineHeight: 24, numberOfLines: 2 });
    assert(node('text-measure-result').textContent === `完整: ${full.width} × ${full.height} / 两行: ${collapsed.height}`, 'public measurement matches browser typesetting');
    assert(node('text-measure-preview').getBoundingClientRect().height === collapsed.height, 'collapsed Text matches measured height');
    node('text-measure-toggle').click(); await tick();
    assert(node('text-measure-preview').getBoundingClientRect().height === full.height, 'expanded Text matches measured height');
    node('text-measure-toggle').click(); await tick();
    assert(node('text-measure-preview').getBoundingClientRect().height === collapsed.height, 'collapse restores two lines');
    assert(document.body.childElementCount === bodyChildren, 'detached measurement probes are released');
    assert(host.diagnostics.length === 0, 'no runtime diagnostics');
  } finally { await host.destroy(); root.remove(); }
}
