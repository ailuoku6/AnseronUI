import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("../packages/flexily/", import.meta.url)),
  test: {
    clearMocks: false,
    maxWorkers: 1,
    testTimeout: 60000,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/logger.test.ts", "tests/unmeasured-guard.test.ts", "tests/performance-regression.test.ts"],
  },
});
