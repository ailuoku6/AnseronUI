import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  oxc: { jsx: { runtime: "automatic", importSource: "@anseronui/ui" } },
  build: { outDir: fileURLToPath(new URL("../../dist/async-form-web", import.meta.url)), emptyOutDir: true },
});
