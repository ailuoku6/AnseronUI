import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("../packages/flexily/", import.meta.url)),
  test: {
    maxWorkers: 1,
    testTimeout: 120000,
    benchmark: { include: ["bench/yoga-compare-warmup.bench.ts", "bench/yoga-compare-rich.bench.ts"] },
  },
});
