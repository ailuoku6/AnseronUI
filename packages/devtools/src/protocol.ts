export const DEVTOOLS_PROTOCOL = 1;

export type DevtoolsNode = {
  id: number;
  parentId: number;
  tag: string;
  testId?: string;
  text?: string;
  rect: { x: number; y: number; width: number; height: number };
  props: Record<string, unknown>;
  attributes?: Record<string, string>;
  styles?: Record<string, string>;
  component?: string;
  state?: Record<string, unknown>;
  children: number[];
  editable?: { p?: Record<string, string>; s?: Record<string, string> };
  scrollOffset?: [number, number];
};

export type DevtoolsLog = { seq: number; level: "log" | "info" | "debug" | "warn" | "error"; args: unknown[]; tag?: string; ts: number };
export type DevtoolsNetwork = { id: string; url: string; method: string; status?: number; ok?: boolean; durationMs?: number; error?: string; ts: number; transport?: string; requestHeaders?: Record<string, string>; responseHeaders?: Record<string, string>; requestBody?: string; responseBody?: string };
export type DevtoolsNativeCall = { id: string; module: string; method: string; args?: unknown; result?: unknown; error?: string; durationMs?: number; ts: number };

export type DevtoolsSnapshot = {
  protocol: number;
  type: "snapshot" | "heartbeat";
  pagerId: string;
  page?: string;
  ts: number;
  nodes?: DevtoolsNode[];
  stats?: Record<string, number>;
  logs?: DevtoolsLog[];
  network?: DevtoolsNetwork[];
  native?: DevtoolsNativeCall[];
  droppedLogs?: number;
  screenshot?: DevtoolsScreenshot;
  commandResults?: DevtoolsCommandResult[];
  platform?: "web" | "ios" | "android" | "macos" | "harmony";
  seq?: number;
  destroyed?: boolean;
  sampleMs?: number;
  capabilities?: string[];
  device?: { platform?: string; density?: number; pageWidth?: number; pageHeight?: number };
  diagnostics?: { code: string; message: string }[];
};

export type DevtoolsSessionSummary = {
  pagerId: string;
  page: string;
  nodeCount: number;
  logCount: number;
  networkCount: number;
  nativeCount?: number;
  lastSeenAt: number;
  stale: boolean;
};

export type DevtoolsScreenshot = { id: number; ts: number; sample: number; data?: string; err?: string; ox?: number; oy?: number; ow?: number; oh?: number; live?: boolean };
export type DevtoolsCommand = { type: string; requestId?: string; expiresAt?: number; id?: number; value?: unknown; target?: string; key?: string; schemaToken?: string; sample?: number; on?: boolean; interval?: number };
export type DevtoolsCommandResult = { requestId: string; ok: boolean; error?: string; [key: string]: unknown };
