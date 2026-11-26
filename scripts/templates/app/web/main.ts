import { BrowserReferenceHost, BrowserPageStack } from "@anseronui/render-web";
import { pages } from "virtual:anseronui-pages";
import "./style.css";
import { createPluginExtensions } from "../.anseronui/plugins/web";

const container = document.querySelector<HTMLElement>("#app")!;
const stack = new BrowserPageStack(container, async (root, page, router) => {
  const pageEntry = pages.find(entry => entry.name === page);
  if (!pageEntry) throw new Error(`Unknown page: ${page}`);
  const host = new BrowserReferenceHost(root, pageEntry, undefined, { ...createPluginExtensions(), router });
  await host.mount(page, root.clientWidth, root.clientHeight);
  return host;
});
const router = stack.router;
window.addEventListener("resize", () => { void stack.resize(); });
window.addEventListener("keydown", async event => { if (event.key !== "Escape" && event.key !== "BrowserBack") return; if (await stack.handleBackPress()) event.preventDefault(); });
router.load("home");
