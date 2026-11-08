import { BrowserReferenceHost } from "@anseronui/render-web";
import { asyncFormPage } from "./page.js";
import "./style.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing app root");
const host = new BrowserReferenceHost(root, asyncFormPage);
void host.mount(asyncFormPage.name, root.clientWidth, root.clientHeight).catch(error => {
  root.textContent = String(error);
  console.error(error);
});
window.addEventListener("resize", () => { void host.resize(root.clientWidth, root.clientHeight); });
