import { Button, Fragment, RichText, ScrollView, Text, TextInput, View, normalizeChildren } from "./index.js";
import type { Child, Component, ComponentElement, FragmentElement, HostElement, HostTag, Key, UIElement } from "./index.js";
export { Fragment };

export namespace JSX {
  export type Element = UIElement;
  export interface ElementChildrenAttribute { children: {} }
  export interface IntrinsicAttributes { key?: Key }
}

type ElementType = Component<any>;
export function jsx(type: ElementType, props: object | null, key?: Key): UIElement {
  const attributes = (props ?? {}) as { children?: Child; key?: Key };
  const resolvedKey = key ?? attributes.key ?? null;
  if (type === Fragment) return { kind: "fragment", key: resolvedKey, children: normalizeChildren(attributes.children) } as FragmentElement;
  if (typeof type !== "function") throw new Error("Unsupported JSX component");
  if (type === View || type === Text || type === RichText || type === Button || type === TextInput || type === ScrollView) {
    const tag: HostTag = type === View ? "View" : type === Text ? "Text" : type === RichText ? "RichText" : type === Button ? "Button" : type === TextInput ? "TextInput" : "ScrollView";
    const children = normalizeChildren(attributes.children);
    if (tag !== "Text" && tag !== "RichText" && children.some(child => typeof child === "string" || typeof child === "number")) {
      throw new Error("RAW_TEXT_OUTSIDE_TEXT");
    }
    return { kind: "host", tag, key: resolvedKey, props: attributes, children } as HostElement;
  }
  return { kind: "component", component: type as Component<any>, key: resolvedKey, props: attributes } as ComponentElement;
}
export const jsxs = jsx;
export const jsxDEV = jsx;
