import { ReferenceRuntime } from "@anseronui/core";
import type { Envelope, InputPayload } from "@anseronui/protocol";
import { counterPage } from "../../../.verification/framework/counter.js";

let runtime: ReferenceRuntime | null = null;

/** Synchronous UTF-8 JSON ABI probe. The production bytes/context embedding is still pending. */
export function dispatch(input: string): string {
  if (!runtime) runtime = new ReferenceRuntime({ bundleBuildId: "counter", pages: [counterPage] });
  const envelope = JSON.parse(input) as Envelope<InputPayload>;
  runtime.post(envelope);
  return JSON.stringify(runtime.step());
}
