import { BrowserHost, WasmRuntime } from "@anseronui/render-web";
import "./style.css";
import { createPluginExtensions } from "../.anseronui/plugins/web";

const container = document.querySelector<HTMLElement>("#app")!;
const routeStack = ["home"];
let host: BrowserHost | undefined;
let transition = Promise.resolve();
function select(page: string) {
  transition = transition.then(async () => {
    await host?.destroy();
    const root = document.createElement("div"); root.className = "surface"; container.replaceChildren(root);
    const runtime = await WasmRuntime.load("/core.wasm", undefined, "__BUILD_ID__");
    host = new BrowserHost(root, runtime, undefined, { ...createPluginExtensions(), router: async (method, args) => {
      const target = typeof args === "object" && args !== null && "page" in args ? String((args as { page: unknown }).page) : "";
      if (method === "push") { if (!target) throw new Error("INVALID_ROUTE"); routeStack.push(target); setTimeout(() => { void select(target); }, 0); return null; }
      if (method === "replace") { if (!target || routeStack.length === 0) throw new Error("INVALID_ROUTE"); routeStack[routeStack.length - 1] = target; setTimeout(() => { void select(target); }, 0); return null; }
      if (method === "pop" || method === "back") { if (routeStack.length <= 1) throw new Error("ROUTER_EMPTY"); routeStack.pop(); setTimeout(() => { void select(routeStack[routeStack.length - 1]); }, 0); return null; }
      if (method === "current") return routeStack[routeStack.length - 1] ?? null;
      throw new Error("UNSUPPORTED_METHOD: " + method);
    }});
    await host.mount(page, root.clientWidth, root.clientHeight);
  }).catch(error => { console.error(error); });
}
window.addEventListener("resize", () => { const root = container.firstElementChild as HTMLElement | null; if (root) void host?.resize(root.clientWidth, root.clientHeight); });
window.addEventListener("keydown", async event => { if (event.key !== "Escape" && event.key !== "BrowserBack") return; if (await host?.handleBackPress()) { event.preventDefault(); return; } if (routeStack.length > 1) { event.preventDefault(); routeStack.pop(); select(routeStack[routeStack.length - 1]); } });
select("home");
