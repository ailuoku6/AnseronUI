import { normalizeChildren } from './index.js';
import type { Child, HostElement, HostTag, Key, UIElement } from './index.js';
/** Internal compiler ABI. These descriptors never escape as user props. */
export interface TemplateField { node: number; field: string; input: number }
export interface TemplateNode { tag: HostTag; key: Key | null; props: object; children: number[]; text?: string }
export interface HostTemplate { siteId: string; nodes: TemplateNode[]; fields: TemplateField[] }
export interface TemplateElement { kind: 'template'; key: null; plan: HostTemplate; values: unknown[] }
export function template(plan: HostTemplate, values: unknown[]): UIElement { return { kind: 'template', key: null, plan, values }; }
export function templateNode(plan: HostTemplate, index: number, values: unknown[], children: Child): HostElement {
  const descriptor = plan.nodes[index];
  const props: { [key: string]: unknown } = { ...descriptor.props };
  for (const field of plan.fields) if (field.node === index) {
    if (field.field === 'children') children = values[field.input] as Child;
    else props[field.field] = values[field.input];
  }
  if (descriptor.text !== undefined) children = descriptor.text;
  props.children = children;
  return { kind: 'host', tag: descriptor.tag, key: descriptor.key, props, children: normalizeChildren(children) };
}
