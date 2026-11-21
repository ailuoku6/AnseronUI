import { describe, expect, it } from "vitest";
import { decodeEnvelope, encodeEnvelope, PROTOCOL_MAJOR, PROTOCOL_MINOR, validProps } from "../src/index.js";
import type { Envelope, InputPayload } from "../src/index.js";

describe("protocol envelope", () => {
  it("accepts dark colors and shadows but rejects invalid shadow geometry and opacity", () => {
    expect(validProps({ dmBackgroundColor:'#111111', dmColor:'#ffffff', dmBorderColor:'#222222', dmShadowColor:'#ffffff', dmPlaceholderTextColor:'#aaaaaa', shadowColor:'#000000', shadowOffsetX:-4, shadowOffsetY:8, shadowRadius:12, shadowOpacity:0.3 })).toBe(true);
    for (const props of [{ shadowOpacity:1.1 }, { shadowOpacity:-0.1 }, { shadowRadius:-1 }, { shadowOffsetX:NaN }, { shadowOffsetY:Infinity }, { dmColor:123 }]) expect(validProps(props)).toBe(false);
  });
  it("accepts Liquid Glass properties and validates their values", () => {
    expect(validProps({ glassEffect: true, glassEffectStyle: "clear", glassEffectTintColor: "#5599cc", glassEffectInteractive: true, glassEffectContainer: true, glassEffectSpacing: 12 })).toBe(true);
    for (const props of [{ glassEffectStyle: "blur" }, { glassEffectSpacing: -1 }, { glassEffect: 1 }, { glassEffectInteractive: "yes" }]) expect(validProps(props)).toBe(false);
  });
  const envelope: Envelope<InputPayload> = {
    protocolMajor: PROTOCOL_MAJOR, protocolMinor: PROTOCOL_MINOR,
    bundleBuildId: "test", runtimeEpoch: 1, surfaceId: 2,
    surfaceGeneration: 3, sequence: 1, ackSequence: 0,
    payload: { type: "CreateSurface", page: "home", width: 320, height: 640 },
  };
  it("rejects removed Button nodes and accepts image theme sources and absolute line heights", () => {
    for (const payload of [
      { type: 'Handshake', requiredNodes: ['Button'] },
      { type: 'Commit', revision: 1, commands: [{ type: 'CreateNode', nodeId: 1, kind: 'Button' }] },
      { type: 'MeasureRequest', requestId: 1, nodeId: 1, kind: 'Button', text: 'old', fontSize: 16, maxWidth: 100 },
    ]) expect(() => encodeEnvelope({ ...envelope, payload } as Envelope<InputPayload>)).toThrow('PROTOCOL_PAYLOAD');
    expect(validProps({ src: 'light.png', dmSrc: 'dark.png', lineHeight: 24 })).toBe(true);
    for (const props of [{ dmSrc: 1 }, { lineHeight: -1 }, { lineHeight: NaN }, { lineHeight: '24px' }, { title: 'old' }]) expect(validProps(props)).toBe(false);
  });
  it("validates registered extension envelopes", () => {
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "InvokeModule", requestId: 1, module: "device", method: "info", argument: '{"nested":[true,null]}' } })).not.toThrow();
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "InvokeModule", requestId: 1, module: "invalid name", method: "info", argument: "null" } })).toThrow("PROTOCOL_PAYLOAD");
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "Commit", revision: 1, commands: [{ type: "CreateNode", nodeId: 1, kind: "Native", nativeName: "MapView" }] } })).not.toThrow();
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "Commit", revision: 1, commands: [{ type: "CreateNode", nodeId: 1, kind: "Native" }] } })).toThrow("PROTOCOL_PAYLOAD");
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "NativeEvent", nodeId: 1, revision: 1, event: "nativeComponent", value: '{"name":"change","data":1}' } })).not.toThrow();
  });
  it("validates visibility and finite diagnostic counters", () => {
    for (const payload of [{ type: "SurfaceVisibility", visible: false }, { type: "InspectRuntime", enabled: true, reset: true }, { type: "RuntimeStats", values: { nodes: 12, layoutMs: 0.5 } }]) {
      expect(() => encodeEnvelope({ ...envelope, payload })).not.toThrow();
    }
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "SurfaceVisibility", visible: 1 } })).toThrow("PROTOCOL_PAYLOAD");
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "RuntimeStats", values: { layoutMs: Infinity } } })).toThrow("PROTOCOL_PAYLOAD");
    expect(validProps({ scrollAnchorOffset: -80.5 })).toBe(true);
    expect(validProps({ scrollAnchorOffset: Infinity })).toBe(false);
    const scroll = { type: "NativeEvent", nodeId: 1, revision: 1, event: "scroll", x: 0, y: 800, contentWidth: 320, contentHeight: 10000, scrollAdjustment: -80.5 };
    expect(decodeEnvelope(encodeEnvelope({ ...envelope, payload: scroll })).payload).toEqual(scroll);
    expect(() => encodeEnvelope({ ...envelope, payload: { ...scroll, scrollAdjustment: Infinity } })).toThrow("PROTOCOL_PAYLOAD");
  });
  it("round trips original error stacks and accepts legacy diagnostics", () => {
    const diagnostic = { type: "Diagnostic", code: "RENDER_ERROR", message: "Error: broken", stack: "Error: broken\n    at Page (pages/订单.tsx:12:7)", errorName: "Error", buildId: "release-1" };
    expect(decodeEnvelope(encodeEnvelope({ ...envelope, payload: diagnostic })).payload).toEqual(diagnostic);
    expect(() => encodeEnvelope({ ...envelope, payload: { type: "Diagnostic", code: "OLD", message: "old bundle" } })).not.toThrow();
    expect(() => encodeEnvelope({ ...envelope, payload: { ...diagnostic, stack: "x".repeat(32769) } })).toThrow("PROTOCOL_PAYLOAD");
    expect(() => encodeEnvelope({ ...envelope, payload: { ...diagnostic, stack: 123 } })).toThrow("PROTOCOL_PAYLOAD");
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
