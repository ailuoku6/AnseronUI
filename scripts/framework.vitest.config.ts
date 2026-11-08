import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "@anseronui/ui" } },
  test: { include: ["packages/{core,protocol,ui,ui-compiler,render-web}/test/**/*.test.ts", "packages/{core,protocol,ui,ui-compiler,render-web}/test/**/*.test.tsx"] },
});
