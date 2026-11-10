import { BrowserHost, BrowserPageStack, WasmRuntime } from "@anseronui/render-web";
import "./style.css";
import { createPluginExtensions } from "../.anseronui/plugins/web";

const container = document.querySelector<HTMLElement>("#app")!;
const stack = new BrowserPageStack(container, async (root, page, router) => {
  const runtime = await WasmRuntime.load("/core.wasm", undefined, "__BUILD_ID__");
  const host = new BrowserHost(root, runtime, undefined, { ...createPluginExtensions(), router });
  await host.mount(page, root.clientWidth, root.clientHeight);
  return host;
});
const router = stack.router;
window.addEventListener("resize", () => { void stack.resize(); });
window.addEventListener("keydown", async event => { if (event.key !== "Escape" && event.key !== "BrowserBack") return; if (await stack.handleBackPress()) event.preventDefault(); });
router.load("home");
