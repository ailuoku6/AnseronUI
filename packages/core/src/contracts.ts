import type { Frame, NodeKind, EventKind, RenderProps, RenderCommand } from "@anseronui/protocol";
import type { Style } from "@anseronui/ui";

/** Increment when either side changes the render message contract. */
export const CORE_ABI_VERSION = 1;
export interface RenderNode {
  id: number; kind: NodeKind; nativeName?: string; props: RenderProps; style: Style;
  frame: Frame; events: EventKind[]; children: RenderNode[];
}
export interface MeasureQuery {
  requestId: number; nodeId: number; kind: "Text" | "RichText" | "Button" | "TextInput";
  text: string; fontSize: number; maxWidth: number; props: RenderProps; key: string;
}
export interface RenderRequest {
  abi: number; surfaceId: number; generation: number; revision: number; round: number;
  width: number; height: number; tree: RenderNode[]; previous: RenderNode[];
  nextRequestId: number;
  measureCache: { key: string; width: number; height: number; baseline: number }[];
}
export interface RenderResult {
  abi: number; surfaceId: number; generation: number; revision: number; round: number;
  frames: { nodeId: number; frame: Frame }[]; measures: MeasureQuery[];
  commands: RenderCommand[]; nextRequestId: number;
}
