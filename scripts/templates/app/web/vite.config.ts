import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({ root: fileURLToPath(new URL(".", import.meta.url)), server: { port: 5175 }, build: { outDir: fileURLToPath(new URL("../dist/web", import.meta.url)), emptyOutDir: true } });
