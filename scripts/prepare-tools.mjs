import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
if (!process.env.ANSERONUI_SDK_WORKSPACE) {
  const installed = spawnSync(process.execPath, [join(root, "node_modules/scriptc/scripts/install-native.mjs")], { stdio: "inherit" });
  if (installed.error) throw installed.error;
  if (installed.status !== 0) process.exit(installed.status ?? 1);
}
// Upstream benchmarks use this package-relative path to read Yoga's .wasm.
const yoga = join(root, "packages/flexily/node_modules/yoga-wasm-web");
if (!process.env.ANSERONUI_SDK_WORKSPACE && !existsSync(yoga)) {
  mkdirSync(dirname(yoga), { recursive: true });
  symlinkSync(relative(dirname(yoga), join(root, "node_modules/yoga-wasm-web")), yoga, "dir");
}
