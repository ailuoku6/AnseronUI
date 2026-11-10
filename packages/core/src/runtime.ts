import { BusinessRuntime } from "./business-runtime.js";
import type { RuntimeOptions } from "./business-runtime.js";
import { LayoutKernel } from "./kernel.js";
export type { RuntimeOptions } from "./business-runtime.js";
/** JavaScript reference composition of the same independently compiled layers. */
export class ReferenceRuntime extends BusinessRuntime {
  private readonly kernel: LayoutKernel;
  constructor(options: RuntimeOptions) {
    const kernel = new LayoutKernel();
    super({ ...options, renderCore: options.renderCore ?? (request => kernel.execute(request)) });
    this.kernel = kernel;
  }
  override dispose(): void { try { super.dispose(); } finally { this.kernel.dispose(); } }
}
