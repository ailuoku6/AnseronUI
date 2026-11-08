import { describe, expect, it } from "vitest";
import { decodeEnvelope, encodeEnvelope, PROTOCOL_MAJOR, PROTOCOL_MINOR } from "@anseronui/protocol";
import type { Envelope, InputPayload, OutputPayload } from "@anseronui/protocol";
import { BrowserBytesAdapter } from "../src/index.js";

describe("browser bytes adapter", () => {
  it("preserves the wire envelope and enforces output validation", () => {
    const input: Envelope<InputPayload> = {
      protocolMajor: PROTOCOL_MAJOR, protocolMinor: PROTOCOL_MINOR,
      bundleBuildId: "build", runtimeEpoch: 3, surfaceId: 2, surfaceGeneration: 5,
      sequence: 1, ackSequence: 0, payload: { type: "DestroySurface" },
    };
    const output: Envelope<OutputPayload> = { ...input, payload: { type: "SurfaceDisposed" } };
    const sent: Uint8Array[] = [];
    let next: Uint8Array[] = [encodeEnvelope(output)];
    let disposed = false;
    const adapter = new BrowserBytesAdapter("build", 3, {
      post(bytes) { sent.push(bytes); },
      step() { const result = next; next = []; return result; },
      hasPendingWork() { return next.length > 0; },
      dispose() { disposed = true; },
    });
    adapter.post(input);
    expect(decodeEnvelope(sent[0])).toEqual(input);
    expect(adapter.hasPendingWork()).toBe(true);
    expect(adapter.step()).toEqual([output]);
    next = [new TextEncoder().encode('{"protocolMajor":99}')];
    expect(() => adapter.step()).toThrow("PROTOCOL_VERSION");
    adapter.dispose();
    expect(disposed).toBe(true);
  });
});
