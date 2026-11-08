import { describe, expect, it } from "vitest";
import { decodeEnvelope, encodeEnvelope, PROTOCOL_MAJOR, PROTOCOL_MINOR } from "../src/index.js";
import type { Envelope, InputPayload } from "../src/index.js";

describe("protocol envelope", () => {
  const envelope: Envelope<InputPayload> = {
    protocolMajor: PROTOCOL_MAJOR, protocolMinor: PROTOCOL_MINOR,
    bundleBuildId: "test", runtimeEpoch: 1, surfaceId: 2,
    surfaceGeneration: 3, sequence: 1, ackSequence: 0,
    payload: { type: "CreateSurface", page: "home", width: 320, height: 640 },
  };
  it("validates registered extension envelopes", () => {
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "InvokeModule", requestId: 1, module: "device", method: "info", argument: '{"nested":[true,null]}' } })).not.toThrow();
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "InvokeModule", requestId: 1, module: "invalid name", method: "info", argument: "null" } })).toThrow("PROTOCOL_PAYLOAD");
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "Commit", revision: 1, commands: [{ type: "CreateNode", nodeId: 1, kind: "Native", nativeName: "MapView" }] } })).not.toThrow();
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "Commit", revision: 1, commands: [{ type: "CreateNode", nodeId: 1, kind: "Native" }] } })).toThrow("PROTOCOL_PAYLOAD");
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "NativeEvent", nodeId: 1, revision: 1, event: "nativeComponent", value: '{"name":"change","data":1}' } })).not.toThrow();
  });
  it("round trips UTF-8 bytes", () => {
    expect(decodeEnvelope(encodeEnvelope(envelope))).toEqual(envelope);
  });
  it("rejects version and counter mismatches", () => {
    expect(() => encodeEnvelope({ ...envelope, protocolMajor: 99 })).toThrow("PROTOCOL_VERSION");
    expect(() => encodeEnvelope({ ...envelope, sequence: 0 })).toThrow("PROTOCOL_sequence");
  });
  it("rejects malformed commands and measurement payloads before dispatch", () => {
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "Tap", nodeId: 0, revision: 1 } })).toThrow("PROTOCOL_PAYLOAD");
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "MeasureResult", requestId: 1, nodeId: 2, width: Number.NaN, height: 10, baseline: 8 } })).toThrow("PROTOCOL_PAYLOAD");
    const invalidCommit = { ...envelope, payload: { type: "Commit", revision: 1, commands: [{ type: "SetFrame", nodeId: 1, frame: { x: 0, y: 0, width: -1, height: 10 } }] } };
    expect(() => encodeEnvelope(invalidCommit as Envelope<InputPayload>)).toThrow("PROTOCOL_PAYLOAD");
    const invalidKind = { ...envelope, payload: { type: "MeasureRequest", requestId: 1, nodeId: 2, kind: "Unknown", text: "a", fontSize: 16, maxWidth: 100 } };
    expect(() => encodeEnvelope(invalidKind as Envelope<InputPayload>)).toThrow("PROTOCOL_PAYLOAD");
  });
  it("validates extended native event and element properties", () => {
    const props = { type: "Commit", revision: 1, commands: [
      { type: "SetProps", nodeId: 1, props: { borderRadius: 4, fontWeight: "bold", secureTextEntry: true, keyboardType: "numeric" } },
      { type: "BindEvent", nodeId: 1, event: "longPress", enabled: true },
    ] };
    expect(() => encodeEnvelope({ ...envelope, payload: props } as Envelope<InputPayload>)).not.toThrow();
    const invalid = { ...props, commands: [{ type: "SetProps", nodeId: 1, props: { keyboardType: "banana" } }] };
    expect(() => encodeEnvelope({ ...envelope, payload: invalid } as Envelope<InputPayload>)).toThrow("PROTOCOL_PAYLOAD");
  });
  it("accepts media element kinds and validates media events", () => {
    const mediaCommit = { type: "Commit", revision: 1, commands: [
      { type: "CreateNode", nodeId: 1, kind: "Image" },
      { type: "SetProps", nodeId: 1, props: { src: "https://example.test/image.png", resizeMode: "cover" } },
    ] };
    expect(() => encodeEnvelope({ ...envelope, payload: mediaCommit } as Envelope<InputPayload>)).not.toThrow();
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "NativeEvent", nodeId: 1, revision: 1, event: "loadFailure", source: "broken", errorCode: 2 } })).not.toThrow();
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "NativeEvent", nodeId: 1, revision: 1, event: "playStateDidChanged", state: "buffering" } })).toThrow("PROTOCOL_PAYLOAD");
  });
  it("validates touch payloads for gesture recognizers", () => {
    const touch = { type: "NativeEvent", nodeId: 1, targetId: 2, revision: 1, event: "touchMove", x: 4, y: 8, pageX: 14, pageY: 18, pointerId: 1, touches: [{ x: 4, y: 8, pageX: 14, pageY: 18, pointerId: 1 }] };
    expect(() => encodeEnvelope({ ...envelope, payload: touch })).not.toThrow();
    expect(() => encodeEnvelope({ ...envelope, payload: { ...touch, targetId: 0 } })).toThrow("PROTOCOL_PAYLOAD");
    expect(() => encodeEnvelope({ ...envelope, payload: { ...touch, touches: [{ ...touch.touches[0], x: Number.NaN }] } })).toThrow("PROTOCOL_PAYLOAD");
  });
});
