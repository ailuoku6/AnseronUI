import type { Frame, NodeKind, EventKind, RenderProps, RenderCommand } from "@anseronui/protocol";
import type { Style } from "@anseronui/ui";

/** Increment when either side changes the render message contract. */
export const CORE_ABI_VERSION = 3;
export interface RenderNode {
  id: number; kind: NodeKind; nativeName?: string; props: RenderProps; style: Style;
  frame: Frame; events: EventKind[]; children: RenderNode[];
}
export interface MeasureQuery {
  requestId: number; nodeId: number; kind: "Text" | "RichText" | "TextInput";
  text: string; fontSize: number; maxWidth: number; props: RenderProps; key: string;
}
export interface RenderRequest {
  type: "Render";
  abi: number; surfaceId: number; generation: number; revision: number; round: number;
  width: number; height: number; tree: RenderNode[]; previous: RenderNode[];
  nextRequestId: number;
  /** Optional diagnostic extension; omitted in normal builds. */
  profile?: boolean;
  measureCache: { key: string; width: number; height: number; baseline: number }[];
}
export interface RenderResult {
  type: "RenderResult";
  abi: number; surfaceId: number; generation: number; revision: number; round: number;
  frames: { nodeId: number; frame: Frame }[]; measures: MeasureQuery[];
  commands: RenderCommand[]; nextRequestId: number;
  timings?: { syncMs: number; layoutMs: number; diffMs: number };
}
export interface ReleaseSurfaceRequest {
  type: "ReleaseSurface"; abi: number; surfaceId: number; generation: number;
}
export interface SurfaceReleased {
  type: "SurfaceReleased"; abi: number; surfaceId: number; generation: number;
}
export interface TransactionHeader { abi: number; surfaceId: number; generation: number; transactionId: number }
export type NodeMutation =
  | { type: "Create"; nodeId: number; kind: NodeKind; nativeName?: string; props: RenderProps; style: Style; events: EventKind[] }
  | { type: "Patch"; nodeId: number; propsSet: RenderProps; propsUnset: string[]; styleSet: Style; styleUnset: string[]; events?: EventKind[] }
  | { type: "Children"; parentId: number; children: number[] }
  | { type: "Delete"; nodeId: number };
export interface BeginRenderRequest extends TransactionHeader {
  type: "BeginRender"; baseRevision: number; targetRevision: number;
  width: number; height: number; environmentVersion: number;
  mutations: NodeMutation[]; nextRequestId: number; profile?: boolean;
}
export interface ContinueRenderRequest extends TransactionHeader {
  type: "ContinueRender"; round: number;
  measurements: { requestId: number; nodeId: number; key: string; width: number; height: number; baseline: number }[];
}
export interface Prepared extends TransactionHeader {
  type: "Prepared"; revision: number; round: number; ready: boolean;
  frames: { nodeId: number; frame: Frame }[]; measures: MeasureQuery[]; commands: RenderCommand[]; nextRequestId: number;
  stats: { coreSyncNodes: number; layoutVisited: number; frameCandidates: number; frameChanged: number };
}
export interface FinishRenderRequest extends TransactionHeader { type: "FinalizeRender" | "AbortRender" }
export interface RenderFinished extends TransactionHeader { type: "Finalized" | "Aborted"; revision: number }
export interface ResetSurfaceRequest extends TransactionHeader { type: "ResetSurface"; resetToken: number; rejectedThroughTransactionId: number }
export interface SurfaceReset extends TransactionHeader { type: "SurfaceReset"; resetToken: number }
export interface CoreFailure extends TransactionHeader { type: "CoreFailure"; code: string }
export type CoreRequest = RenderRequest | ReleaseSurfaceRequest | BeginRenderRequest | ContinueRenderRequest | FinishRenderRequest | ResetSurfaceRequest;
export type CoreResult = RenderResult | SurfaceReleased | Prepared | RenderFinished | SurfaceReset | CoreFailure;
