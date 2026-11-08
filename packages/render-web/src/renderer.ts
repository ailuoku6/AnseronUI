import { NodeAnimation, visualDefaults, colorValues, paintElement } from "./animation.js";
import type { NativeViewFactory, NativeViewInstance } from "./extensions.js";
import type { EventKind, NodeKind, RenderCommand, RenderProps } from "@anseronui/protocol";

type NodeRecord = {
  element: HTMLElement;
  animation: NodeAnimation;
  native?: NativeViewInstance;
  kind: NodeKind;
  enabled: Set<EventKind>;
  composing: boolean;
  inputRevision: number;
  pendingInputRevision: number;
  pendingValue: string | null;
};
export type RendererEvent = { type: "Tap"; nodeId: number; revision: number } |
  { type: "InputChange"; nodeId: number; revision: number; value: string; inputRevision: number } |
  { type: "NativeEvent"; nodeId: number; targetId?: number; revision: number; event: "nativeComponent" | "longPress" | "backPress" | "focus" | "blur" | "submit" | "scroll" | "scrollEnd" | "layout" | "touchDown" | "touchMove" | "touchUp" | "touchCancel" | "spanClick" | "loadSuccess" | "loadFailure" | "playStateDidChanged" | "playTimeDidChanged" | "firstFrameDidDisplay"; value?: string; x?: number; y?: number; contentWidth?: number; contentHeight?: number; source?: string; state?: string; duration?: number; errorCode?: number; pageX?: number; pageY?: number; pointerId?: number; touches?: { x: number; y: number; pageX: number; pageY: number; pointerId: number }[] };

/** Applies one checked transaction to a single DOM root. */
export class DOMRenderer {
  private records = new Map<number, NodeRecord>();
  private revision = 0;
  private disposed = false;
  private pointers = new Map<number, { target: number; owner: number; clientX: number; clientY: number }>();
  private readonly pointerListeners: [string, EventListener][] = [];

  private sendPointer(name: "touchDown" | "touchMove" | "touchUp" | "touchCancel", event: PointerEvent): void {
    if (name === "touchDown") {
      const target = (event.target as Element | null)?.closest<HTMLElement>("[data-tsn-node]");
      if (!target || !this.root.contains(target)) return;
      let ancestor: HTMLElement | null = target;
      let owner: number | undefined;
      while (ancestor && ancestor !== this.root) {
        const id = Number(ancestor.dataset.tsnNode);
        const record = this.records.get(id);
        if (record && ["touchDown", "touchMove", "touchUp", "touchCancel"].some(name => record.enabled.has(name as EventKind))) { owner = id; break; }
        ancestor = ancestor.parentElement;
      }
      if (owner === undefined) return;
      this.pointers.set(event.pointerId, { target: Number(target.dataset.tsnNode), owner, clientX: event.clientX, clientY: event.clientY });
      try { target.setPointerCapture(event.pointerId); } catch {}
    }
    const session = this.pointers.get(event.pointerId);
    if (!session) return;
    session.clientX = event.clientX; session.clientY = event.clientY;
    const target = this.records.get(session.target)?.element;
    if (!target || !this.root.contains(target)) { this.pointers.delete(event.pointerId); return; }
    if (name === "touchUp" || name === "touchCancel") this.pointers.delete(event.pointerId);
    const rootBounds = this.root.getBoundingClientRect();
    const point = (id: number, p: { clientX: number; clientY: number }) => {
      const chain: HTMLElement[] = [];
      for (let item: HTMLElement | null = target; item && item !== this.root; item = item.parentElement) chain.push(item);
      let local = new DOMPoint(p.clientX - rootBounds.left, p.clientY - rootBounds.top);
      for (const item of chain.reverse()) {
        const style = getComputedStyle(item);
        const [ox, oy] = style.transformOrigin.split(" ").map(parseFloat);
        const matrix = new DOMMatrix().translate(ox, oy).multiply(new DOMMatrix(style.transform === "none" ? undefined : style.transform)).translate(-ox, -oy);
        const parent = item.parentElement;
        local = new DOMPoint(local.x - item.offsetLeft - (parent?.clientLeft ?? 0) + (parent?.scrollLeft ?? 0), local.y - item.offsetTop - (parent?.clientTop ?? 0) + (parent?.scrollTop ?? 0)).matrixTransform(matrix.inverse());
      }
      return { x: Number.isFinite(local.x) ? local.x : 0, y: Number.isFinite(local.y) ? local.y : 0, pageX: p.clientX - rootBounds.left, pageY: p.clientY - rootBounds.top, pointerId: id };
    };
    this.onEvent({ type: "NativeEvent", nodeId: session.owner, targetId: session.target, revision: this.revision, event: name,
      ...point(event.pointerId, session), touches: [...this.pointers].map(([id, p]) => point(id, p)) });
  }

  constructor(readonly root: HTMLElement, private readonly onEvent: (event: RendererEvent) => void, private readonly components: Record<string, NativeViewFactory> = {}) {
    for (const [native, name] of [["pointerdown", "touchDown"], ["pointermove", "touchMove"], ["pointerup", "touchUp"], ["pointercancel", "touchCancel"], ["lostpointercapture", "touchCancel"]] as const) {
      const listener: EventListener = event => this.sendPointer(name, event as PointerEvent);
      this.pointerListeners.push([native, listener]);
      root.addEventListener(native, listener, true);
    }
    root.style.position = "relative";
    root.style.overflow = "hidden";
    if (!root.ownerDocument.querySelector("style[data-anseronui-placeholder]")) {
      const style = root.ownerDocument.createElement("style");
      style.dataset.anseronuiPlaceholder = "true";
      style.textContent = "[data-anseronui-input]::placeholder{color:var(--placeholder-color,currentColor);opacity:1}";
      root.ownerDocument.head.append(style);
    }
  }

  apply(revision: number, commands: readonly RenderCommand[]): void {
    if (this.disposed || revision <= this.revision) throw new Error("Invalid renderer revision");
    this.validate(commands);
    try {
      for (const command of commands) this.applyOne(command, revision);
      for (const record of this.records.values()) record.animation.commit();
      this.revision = revision;
    } catch (error) {
      this.clear();
      throw error;
    }
  }

  clear(): void {
    this.pointers.clear();
    for (const record of this.records.values()) { record.animation.cancel(); record.native?.dispose?.(); }
    this.root.replaceChildren();
    this.records.clear();
    this.revision = 0;
  }
  dispose(): void { if (!this.disposed) { this.clear(); for (const [name, listener] of this.pointerListeners) this.root.removeEventListener(name, listener, true); this.disposed = true; } }
  getNode(nodeId: number): HTMLElement | undefined { return this.records.get(nodeId)?.element; }

  async invoke(nodeId: number, method: string, args: any): Promise<unknown> {
    const record = this.records.get(nodeId);
    if (!record) throw new Error("NODE_UNMOUNTED");
    const element = record.element;
    if (method === "measure") {
      const box = element.getBoundingClientRect(), origin = this.root.getBoundingClientRect();
      return { x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height };
    }
    if (method === "animate") return record.animation.animate(args?.style, args?.options ?? {});
    if (method === "cancelAnimation") { record.animation.cancel(); return null; }
    if (record.native) {
      if (!record.native.invoke) throw new Error("UNSUPPORTED_VIEW_METHOD: " + method);
      return (await record.native.invoke(method, args)) ?? null;
    }
    if (method === "focus" && record.kind === "TextInput") { element.focus(); return null; }
    if (method === "blur" && record.kind === "TextInput") { element.blur(); return null; }
    if (method === "scrollTo" && record.kind === "ScrollView" && Number.isFinite(args?.x) && Number.isFinite(args?.y)) {
      element.scrollTo({ left: args.x, top: args.y, behavior: args.animated ? "smooth" : "instant" }); return null;
    }
    throw new Error("UNSUPPORTED_VIEW_METHOD: " + method);
  }

  private validate(commands: readonly RenderCommand[]): void {
    if (commands.length > 4096) throw new Error("Too many commands");
    const known = new Set(this.records.keys());
    for (const command of commands) {
      if (command.type === "CreateNode") {
        if (known.has(command.nodeId) || command.nodeId < 1) throw new Error("Duplicate node ID");
        known.add(command.nodeId);
      } else if (command.type === "InsertChild" || command.type === "MoveChild") {
        if (!known.has(command.nodeId) || (command.parentId !== 0 && !known.has(command.parentId)) || !Number.isInteger(command.index) || command.index < 0) throw new Error("Invalid insertion");
      } else if (command.type === "RemoveNode") {
        if (!known.has(command.nodeId)) throw new Error("Unknown removal");
        known.delete(command.nodeId);
      } else if (!known.has(command.nodeId)) throw new Error("Unknown node reference");
      if (command.type === "SetFrame") {
        const f = command.frame;
        if (![f.x, f.y, f.width, f.height].every(Number.isFinite) || f.width < 0 || f.height < 0) throw new Error("Invalid frame");
      }
    }
  }

  private applyOne(command: RenderCommand, revision: number): void {
    if (command.type === "CreateNode") {
      let native: NativeViewInstance | undefined;
      if (command.kind === "Native") {
        const factory = Object.prototype.hasOwnProperty.call(this.components, command.nativeName!) ? this.components[command.nativeName!] : undefined;
        if (!factory) throw new Error("UNREGISTERED_NATIVE_COMPONENT: " + command.nativeName);
        native = factory({ document: this.root.ownerDocument, emit: (name, data = null) => {
          // Queue to finish the commit/bind phase; ignore events from disposed instances.
          queueMicrotask(() => {
            const record = this.records.get(command.nodeId);
            if (record?.native !== native || !record?.enabled.has("nativeComponent")) return;
            this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "nativeComponent", value: JSON.stringify({ name, data }) });
          });
        } });
      }
      const element = native?.element ?? this.root.ownerDocument.createElement(({ View: "div", Text: "div", RichText: "div", Button: "button", TextInput: "input", ScrollView: "div", Image: "img", Video: "video", Native: "div" })[command.kind]);
      element.style.position = "absolute";
      element.style.boxSizing = "border-box";
      if (command.kind === "ScrollView") element.style.overflow = "auto";
      if (command.kind === "Image") {
        const image = element as HTMLImageElement;
        image.addEventListener("load", () => record.enabled.has("loadSuccess") && this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "loadSuccess", source: image.dataset.originalSrc ?? image.src }));
        image.addEventListener("error", () => {
          const source = image.dataset.originalSrc ?? image.src;
          if (record.enabled.has("loadFailure")) this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "loadFailure", source, errorCode: 1 });
          const placeholder = String((this.records.get(command.nodeId)?.element as HTMLImageElement).getAttribute("data-placeholder-src") ?? "");
          if (placeholder && !image.dataset.placeholderApplied) { image.dataset.placeholderApplied = "true"; image.src = placeholder; }
        });
      }
      if (command.kind === "Video") {
        const video = element as HTMLVideoElement;
        const state = (value: "playing" | "paused" | "ended" | "error"): void => {
          if (record.enabled.has("playStateDidChanged")) this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "playStateDidChanged", state: value });
        };
        video.addEventListener("playing", () => state("playing"));
        video.addEventListener("pause", () => state("paused"));
        video.addEventListener("ended", () => state("ended"));
        video.addEventListener("error", () => {
          if (record.enabled.has("loadFailure")) this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "loadFailure", source: video.currentSrc || video.src, errorCode: video.error?.code ?? 1 });
          state("error");
        });
        video.addEventListener("loadedmetadata", () => record.enabled.has("loadSuccess") && this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "loadSuccess", source: video.currentSrc || video.src }));
        video.addEventListener("loadeddata", () => record.enabled.has("firstFrameDidDisplay") && this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "firstFrameDidDisplay" }));
        video.addEventListener("timeupdate", () => record.enabled.has("playTimeDidChanged") && this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "playTimeDidChanged", x: Math.round(video.currentTime * 1000), duration: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0 }));
      }
      if (command.kind === "Button") {
        element.setAttribute("type", "button");
        Object.assign(element.style, {
          appearance: "none", boxSizing: "border-box", border: "0", borderRadius: "0",
          background: "transparent", padding: "6px 12px", color: "#007aff",
          font: "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif", cursor: "pointer",
        });
      }
      const record: NodeRecord = { element, animation: new NodeAnimation(values => paintElement(element, values)), native, kind: command.kind, enabled: new Set(), composing: false, inputRevision: 0, pendingInputRevision: 0, pendingValue: null };
      this.records.set(command.nodeId, record);
      element.dataset.tsnNode = String(command.nodeId);
      element.addEventListener("click", event => {
        const span = (event.target as Element | null)?.closest<HTMLElement>("[data-tsn-span]");
        if (span && record.enabled.has("spanClick")) this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "spanClick", value: span.dataset.tsnSpan });
      });
      element.addEventListener("click", () => {
        if (record.enabled.has("tap")) this.onEvent({ type: "Tap", nodeId: command.nodeId, revision: this.revision });
      });
      let pressTimer = 0;
      element.addEventListener("pointerdown", () => {
        if (record.enabled.has("longPress")) pressTimer = this.root.ownerDocument.defaultView!.setTimeout(() => {
          pressTimer = 0;
          this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "longPress" });
        }, 500);
      });
      for (const event of ["pointerup", "pointercancel", "pointerleave"] as const) element.addEventListener(event, () => {
        if (pressTimer) this.root.ownerDocument.defaultView!.clearTimeout(pressTimer);
        pressTimer = 0;
      });
      if (command.kind === "ScrollView") {
        let endTimer = 0;
        element.addEventListener("scroll", () => {
          const scroll = element as HTMLElement;
          const emit = (event: "scroll" | "scrollEnd"): void => {
            if (record.enabled.has(event)) this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event,
              x: scroll.scrollLeft, y: scroll.scrollTop, contentWidth: scroll.scrollWidth, contentHeight: scroll.scrollHeight });
          };
          emit("scroll");
          this.root.ownerDocument.defaultView!.clearTimeout(endTimer);
          endTimer = this.root.ownerDocument.defaultView!.setTimeout(() => emit("scrollEnd"), 120);
        });
      }
      if (command.kind === "TextInput") {
        element.setAttribute("data-anseronui-input", "true");
        element.addEventListener("focus", () => { if (record.enabled.has("focus")) this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "focus" }); });
        element.addEventListener("blur", () => { if (record.enabled.has("blur")) this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "blur" }); });
        element.addEventListener("keydown", event => { if ((event as KeyboardEvent).key === "Enter" && record.enabled.has("submit")) this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "submit", value: (element as HTMLInputElement).value }); });
        element.addEventListener("compositionstart", () => { record.composing = true; });
        element.addEventListener("compositionend", () => {
          record.composing = false;
          if (record.pendingValue !== null && record.pendingInputRevision >= record.inputRevision) {
            (element as HTMLInputElement).value = record.pendingValue;
          }
          record.pendingValue = null;
        });
        element.addEventListener("input", () => {
          if (!record.enabled.has("changeText")) return;
          record.inputRevision++;
          this.onEvent({ type: "InputChange", nodeId: command.nodeId, revision: this.revision, value: (element as HTMLInputElement).value, inputRevision: record.inputRevision });
        });
      }
      return;
    }
    if (command.type === "RemoveNode") {
      const record = this.records.get(command.nodeId)!;
      const descendants = new Set<HTMLElement>([record.element]);
      for (const child of record.element.querySelectorAll("*")) descendants.add(child as HTMLElement);
      for (const [id, item] of this.records) if (descendants.has(item.element)) { this.records.delete(id); item.animation.cancel(); item.native?.dispose?.(); }
      record.element.remove();
      return;
    }
    const record = this.records.get(command.nodeId)!;
    if (command.type === "InsertChild" || command.type === "MoveChild") {
      const parentRecord = this.records.get(command.parentId);
      if (parentRecord?.native && !parentRecord.native.content) throw new Error("NATIVE_COMPONENT_IS_LEAF");
      const parent = command.parentId === 0 ? this.root : parentRecord!.native?.content ?? parentRecord!.element;
      const sibling = parent.children.item(command.index);
      if (sibling !== record.element) parent.insertBefore(record.element, sibling);
    } else if (command.type === "SetProps") {
      this.setProps(record, command.props, revision);
    } else if (command.type === "SetFrame") {
      record.animation.stage(command.frame);
      if (record.enabled.has("layout")) queueMicrotask(() => this.onEvent({ type: "NativeEvent", nodeId: command.nodeId, revision: this.revision, event: "layout", x: command.frame.x, y: command.frame.y, contentWidth: command.frame.width, contentHeight: command.frame.height }));
    } else if (command.type === "BindEvent") {
      if (command.enabled) record.enabled.add(command.event);
      else record.enabled.delete(command.event);
    }
  }

  private setProps(record: NodeRecord, props: RenderProps, revision: number): void {
    record.native?.setProps(JSON.parse(String(props.nativeProps ?? "{}")));
    const element = record.element;
    if (typeof props.testID === "string") element.dataset.testid = props.testID;
    if (typeof props.accessibilityLabel === "string") element.setAttribute("aria-label", props.accessibilityLabel);
    if (record.kind === "Text") element.textContent = String(props.text ?? "");
    if (record.kind === "RichText") {
      const spans = JSON.parse(String(props.spans ?? "[]")) as { text?: string; color?: string; fontSize?: number; fontWeight?: string; fontStyle?: string; textDecorationLine?: string }[];
      element.replaceChildren(...spans.map((item, index) => {
        const span = element.ownerDocument.createElement("span");
        span.textContent = String(item.text ?? ""); span.dataset.tsnSpan = String(index);
        if (item.color) span.style.color = item.color;
        if (item.fontSize !== undefined) span.style.fontSize = item.fontSize + "px";
        if (item.fontWeight) span.style.fontWeight = item.fontWeight;
        if (item.fontStyle) span.style.fontStyle = item.fontStyle;
        if (item.textDecorationLine) span.style.textDecorationLine = item.textDecorationLine;
        return span;
      }));
      element.style.whiteSpace = "pre-wrap";
    }
    if (record.kind === "Button") {
      element.textContent = String(props.title ?? "");
      (element as HTMLButtonElement).disabled = props.disabled === true;
    }
    if (record.kind === "TextInput") {
      const input = element as HTMLInputElement;
      input.placeholder = String(props.placeholder ?? "");
      const nextValue = String(props.value ?? "");
      const acknowledged = Number(props.inputRevision ?? 0);
      if (acknowledged >= record.inputRevision) {
        if (record.composing) { record.pendingValue = nextValue; record.pendingInputRevision = acknowledged; }
        else { if (input.value !== nextValue) input.value = nextValue; record.pendingValue = null; }
      }
    }
    if (record.kind === "Image") {
      const image = element as HTMLImageElement;
      image.alt = String(props.accessibilityLabel ?? "");
      image.style.objectFit = props.resizeMode === "stretch" ? "fill" : String(props.resizeMode ?? "cover");
      const source = String(props.src ?? "");
      image.setAttribute("data-placeholder-src", String(props.placeholderSrc ?? ""));
      if (image.dataset.originalSrc !== source) {
        image.dataset.originalSrc = source;
        image.dataset.placeholderApplied = "";
        image.src = source.startsWith("asset://") ? "/assets/" + source.slice(8) : source;
      }
    }
    if (record.kind === "Video") {
      const video = element as HTMLVideoElement;
      video.controls = props.controls !== false;
      video.autoplay = props.autoplay === true;
      video.loop = props.loop === true;
      video.muted = props.muted === true;
      video.playbackRate = Number(props.rate ?? 1);
      video.playsInline = true;
      video.preload = "metadata";
      video.style.objectFit = props.resizeMode === "stretch" ? "fill" : String(props.resizeMode ?? "cover");
      video.style.backgroundColor = "#000";
      const source = String(props.src ?? "");
      const resolvedSource = source.startsWith("asset://") ? "/assets/" + source.slice(8) : source;
      if (video.getAttribute("src") !== resolvedSource) { video.src = resolvedSource; video.load(); }
      if (props.playControl === "play") void video.play().catch(() => {});
      else if (props.playControl === "pause") video.pause();
      else if (props.playControl === "stop") { video.pause(); video.currentTime = 0; }
    }
    record.animation.options = props.animation ? JSON.parse(String(props.animation)) : undefined;
    const visual = { ...visualDefaults, ...colorValues(String(props.backgroundColor ?? "transparent")) };
    for (const key of ["opacity", "translateX", "translateY", "scaleX", "scaleY", "rotate", "borderRadius"]) if (typeof props[key] === "number") visual[key] = props[key] as number;
    record.animation.stage(visual);
    element.style.color = String(props.color ?? (record.kind === "Button" ? (props.disabled === true ? "#8e8e93" : "#007aff") : ""));
    element.style.fontSize = props.fontSize === undefined ? (record.kind === "Button" ? "16px" : "") : props.fontSize + "px";
    element.style.fontWeight = String(props.fontWeight ?? "");
    element.style.fontStyle = String(props.fontStyle ?? "");
    element.style.textAlign = String(props.textAlign ?? "");
    element.style.textDecorationLine = String(props.textDecorationLine ?? "");
    element.style.borderWidth = props.borderWidth === undefined ? "" : props.borderWidth + "px";
    element.style.borderStyle = props.borderWidth ? "solid" : "";
    element.style.borderColor = String(props.borderColor ?? "");
    element.style.overflow = String(props.overflow ?? (record.kind === "ScrollView" ? "auto" : ""));
    element.style.visibility = String(props.visibility ?? "");
    element.style.touchAction = String(props.touchAction ?? "");
    if (record.kind === "Text") {
      element.style.whiteSpace = "pre-wrap";
      element.style.display = props.numberOfLines ? "-webkit-box" : "";
      element.style.webkitBoxOrient = "vertical";
      element.style.webkitLineClamp = String(props.numberOfLines ?? "");
      element.style.textOverflow = props.ellipsizeMode === "clip" ? "clip" : "ellipsis";
    }
    if (record.kind === "TextInput") {
      const input = element as HTMLInputElement;
      input.disabled = props.editable === false;
      input.type = props.secureTextEntry === true ? "password" : "text";
      input.maxLength = Number(props.maxLength ?? 524288);
      input.autocapitalize = String(props.autoCapitalize ?? "none");
      input.autocomplete = props.autoCorrect === false ? "off" : "on";
      input.inputMode = ({ numeric: "numeric", "decimal-pad": "decimal", "phone-pad": "tel", "email-address": "email", url: "url" } as Record<string, string>)[String(props.keyboardType)] ?? "text";
      input.placeholder = String(props.placeholder ?? "");
      input.style.setProperty("--placeholder-color", String(props.placeholderTextColor ?? ""));
      input.style.setProperty("color-scheme", "light dark");
    }
  }
}
