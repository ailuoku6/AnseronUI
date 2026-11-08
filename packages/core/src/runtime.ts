import { BusinessRuntime } from "./business-runtime.js";
import type { RuntimeOptions } from "./business-runtime.js";
import { render } from "./kernel.js";
export type { RuntimeOptions } from "./business-runtime.js";
/** JavaScript reference composition of the same independently compiled layers. */
export class ReferenceRuntime extends BusinessRuntime {
  constructor(options: RuntimeOptions) { super({ ...options, renderCore: options.renderCore ?? render }); }
}
