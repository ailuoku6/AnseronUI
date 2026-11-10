import { describe, expect, it } from "vitest";
import { ReferenceRuntime } from "../src/index.js";
import { PROTOCOL_MAJOR, PROTOCOL_MINOR } from "@anseronui/protocol";
import type { Envelope, InputPayload, OutputPayload, RenderCommand } from "@anseronui/protocol";
import { Button, Image, NativeComponent, createRef, useRef, useImperativeHandle, RichText, ScrollView, Text, TextInput, Video, View, createContext, definePage, useContext, useEffect, useRouter, useServices, useState, setTimeout, clearTimeout, useTimers } from "@anseronui/ui";
import type { UIElement } from "@anseronui/ui";

function harness(page: ReturnType<typeof definePage>, onWake?: () => void) {
  const runtime = new ReferenceRuntime({ bundleBuildId: "test-build", pages: [page], onWake });
  const sequences = new Map<number, number>();
  const send = (payload: InputPayload, generation = 1): void => {
    const sequence = (sequences.get(generation) ?? 0) + 1;
    sequences.set(generation, sequence);
    const envelope: Envelope<InputPayload> = {
      protocolMajor: PROTOCOL_MAJOR, protocolMinor: PROTOCOL_MINOR,
      bundleBuildId: "test-build", runtimeEpoch: 1, surfaceId: 1,
      surfaceGeneration: generation, sequence, ackSequence: 0, payload,
    };
    runtime.post(envelope);
  };
  const drain = (autoAck = true): OutputPayload[] => {
    const results: OutputPayload[] = [];
    for (let i = 0; i < 20; i++) {
      const messages = runtime.step();
      if (messages.length === 0) return results;
      for (const message of messages) {
        const output = message.payload;
        results.push(output);
        if (output.type === "MeasureRequest") {
          send({ type: "MeasureResult", requestId: output.requestId, nodeId: output.nodeId,
            width: Math.min(output.maxWidth, Math.max(1, output.text.length * 8)), height: 18, baseline: 14 });
        } else if (output.type === "Commit" && autoAck) send({ type: "CommitAck", revision: output.revision });
      }
    }
    throw new Error("Runtime did not settle");
  };
  return { runtime, send, drain };
}
function createdNode(commands: RenderCommand[], kind: string): number {
  const item = commands.find(command => command.type === "CreateNode" && command.kind === kind);
  if (!item || item.type !== "CreateNode") throw new Error("Node missing: " + kind);
  return item.nodeId;
}

describe("reference Core", () => {
  it("transports dark color declarations, span colors and shadows and removes overrides on update", () => {
    let toggle = (_:boolean) => {};
    const page = definePage('dark-styles', () => {
      const [dark, setDark] = useState(true); toggle = setDark;
      return <View style={{ backgroundColor:'#ffffff', dmBackgroundColor:dark ? '#111111' : undefined, borderColor:'#333333', dmBorderColor:'#dddddd', shadowColor:'#000000', dmShadowColor:'#ffffff', shadowOpacity:0.25, shadowRadius:8, shadowOffsetX:-2, shadowOffsetY:4 }}>
        <TextInput value="typed" onChangeText={() => {}} style={{ color:'#000000', dmColor:'#eeeeee', placeholderTextColor:'#666666', dmPlaceholderTextColor:'#aaaaaa' }} />
        <RichText spans={[{ text:'span', color:'#112233', dmColor:'#ddeeff' }]} />
      </View>;
    });
    const h = harness(page);
    h.send({ type:'CreateSurface', page:'dark-styles', width:320, height:480 });
    const outputs = h.drain();
    const commit = outputs.find(item => item.type === 'Commit');
    if (!commit || commit.type !== 'Commit') throw new Error('Missing commit');
    const props = commit.commands.filter(command => command.type === 'SetProps');
    expect(props[0]).toMatchObject({ props:{ dmBackgroundColor:'#111111', dmBorderColor:'#dddddd', dmShadowColor:'#ffffff', shadowOpacity:0.25, shadowRadius:8, shadowOffsetX:-2, shadowOffsetY:4 } });
    expect(props[1]).toMatchObject({ props:{ dmColor:'#eeeeee', placeholderTextColor:'#666666', dmPlaceholderTextColor:'#aaaaaa' } });
    expect(JSON.parse(String(props[2].props.spans))[0]).toMatchObject({ color:'#112233', dmColor:'#ddeeff' });
    toggle(false);
    const update = h.drain().find(item => item.type === 'Commit');
    if (!update || update.type !== 'Commit') throw new Error('Missing update');
    const next = update.commands.find(command => command.type === 'SetProps');
    expect(next?.type === 'SetProps' && next.props.dmBackgroundColor).toBeUndefined();
    h.runtime.dispose();
  });
  it("constrains a nested scroll viewport without shrinking its content", () => {
    const page = definePage("scroll-layout", () => <View style={{ flexDirection: "column", flexGrow: 1 }}>
      <View style={{ height: 80, flexShrink: 0 }} />
      <ScrollView style={{ flexGrow: 1, flexDirection: "column" }}>
        <View style={{ height: 1200, flexShrink: 0 }} />
      </ScrollView>
    </View>);
    const h = harness(page);
    h.send({ type: "CreateSurface", page: "scroll-layout", width: 320, height: 480 });
    const commit = h.drain().find(item => item.type === "Commit");
    if (!commit || commit.type !== "Commit") throw new Error("No commit");
    const scrollId = createdNode(commit.commands, "ScrollView");
    const frames = commit.commands.filter(item => item.type === "SetFrame");
    expect(frames.find(item => item.nodeId === scrollId)).toMatchObject({ frame: { y: 80, height: 400 } });
    expect(frames[0]).toMatchObject({ frame: { height: 480 } });
    expect(frames[frames.length - 1]).toMatchObject({ frame: { height: 1200 } });
    h.runtime.dispose();
  });

  it("attaches node refs only after ACK, keeps identity and retires commands on unmount", async () => {
    const ref = createRef<import("@anseronui/ui").NodeHandle>();
    let show = (_: boolean) => {};
    const events: unknown[] = [];
    function Page(): UIElement {
      const [visible, setVisible] = useState(true); show = setVisible;
      return <View>{visible ? <NativeComponent name="TestControl" ref={ref} nativeProps={{ value: 2, nested: { label: "test" } }}
        onNativeEvent={event => events.push(event)} style={{ width: 100, height: 40 }} /> : null}</View>;
    }
    const h = harness(definePage("native-ref", Page));
    h.send({ type: "CreateSurface", page: "native-ref", width: 320, height: 480 });
    const commit = h.drain(false).find(item => item.type === "Commit");
    if (!commit || commit.type !== "Commit") throw new Error("No commit");
    expect(ref.current).toBeNull();
    expect(commit.commands).toContainEqual(expect.objectContaining({ type: "CreateNode", kind: "Native", nativeName: "TestControl" }));
    const nodeId = createdNode(commit.commands, "Native");
    h.send({ type: "CommitAck", revision: commit.revision }); h.drain();
    const handle = ref.current!;
    expect(handle.nodeId).toBe(nodeId);
    h.send({ type: "NativeEvent", event: "nativeComponent", nodeId, revision: commit.revision, value: JSON.stringify({ name: "change", data: { value: 3 } }) }); h.drain();
    expect(events).toEqual([{ name: "change", data: { value: 3 } }]);
    const result = handle.invoke<{ value: number }>("read", { key: "value" });
    const request = h.drain().find(item => item.type === "InvokeModule");
    expect(request).toMatchObject({ module: "__view", method: "read", argument: JSON.stringify({ nodeId, args: { key: "value" } }) });
    if (!request || request.type !== "InvokeModule") throw new Error("No request");
    h.send({ type: "ModuleResult", requestId: request.requestId, ok: true, value: '{"value":3}' }); h.drain();
    await expect(result).resolves.toEqual({ value: 3 });
    h.send({ type: "Resize", width: 400, height: 480 }); h.drain();
    expect(ref.current).toBe(handle);
    const pending = handle.invoke("wait"); const failed = expect(pending).rejects.toThrow("NODE_UNMOUNTED");
    const waiting = h.drain().find(item => item.type === "InvokeModule");
    show(false); const removed = h.drain();
    expect(ref.current).toBeNull();
    expect(removed).toContainEqual({ type: "CancelRequest", requestId: waiting?.type === "InvokeModule" ? waiting.requestId : 0 });
    await failed;
    await expect(handle.invoke("read")).rejects.toThrow("NODE_UNMOUNTED");
    show(true); h.drain(); expect(ref.current?.nodeId).not.toBe(nodeId);
    h.runtime.dispose(); expect(ref.current).toBeNull();
  });

  it("keeps independent mutable refs across renders and clears callback refs on removal", () => {
    type Handle = import("@anseronui/ui").NodeHandle;
    let bump = () => {};
    let remember = () => {};
    let snapshot!: { node: import("@anseronui/ui").Ref<Handle | null>; saved: import("@anseronui/ui").Ref<Handle | null>; count: import("@anseronui/ui").Ref<number> };
    const callbacks: (Handle | null)[] = [];
    const callback = (handle: Handle | null) => { callbacks.push(handle); };
    function Page(): UIElement {
      const node = useRef<Handle | null>(null);
      const saved = useRef<Handle | null>(null);
      const count = useRef(0);
      const [visible, setVisible] = useState(true);
      snapshot = { node, saved, count };
      remember = () => { saved.current = node.current; count.current++; };
      bump = () => setVisible(false);
      return <View>{visible ? <View ref={node}><View ref={callback} /></View> : null}</View>;
    }
    const h = harness(definePage("ref-storage", Page));
    h.send({ type: "CreateSurface", page: "ref-storage", width: 20, height: 20 }); h.drain();
    const initial = snapshot;
    remember(); bump(); h.drain();
    expect(snapshot.node).toBe(initial.node);
    expect(snapshot.saved).toBe(initial.saved);
    expect(snapshot.saved).not.toBe(snapshot.node);
    expect(snapshot.node.current).toBeNull();
    expect(snapshot.saved.current?.nodeId).toBeGreaterThan(0);
    expect(snapshot.count.current).toBe(1);
    expect(callbacks.length).toBe(2);
    expect(callbacks[0]?.nodeId).toBeGreaterThan(0);
    expect(callbacks[1]).toBeNull();
    h.runtime.dispose();
  });

  it("registers generic module calls with JSON results, errors and owner cancellation", async () => {
    let services!: import("@anseronui/ui").Services;
    let toggle = (_: boolean) => {};
    function Child(): UIElement { services = useServices(); return <View />; }
    function Page(): UIElement { const [show, setShow] = useState(true); toggle = setShow; return <View>{show ? <Child /> : null}</View>; }
    const h = harness(definePage("modules", Page));
    h.send({ type: "CreateSurface", page: "modules", width: 10, height: 10 }); h.drain();
    const result = services.invoke("device", "info", { nested: [1, true, null] });
    const request = h.drain().find(item => item.type === "InvokeModule");
    expect(request).toMatchObject({ module: "device", method: "info", argument: '{"nested":[1,true,null]}' });
    if (!request || request.type !== "InvokeModule") throw new Error("No request");
    h.send({ type: "ModuleResult", requestId: request.requestId, ok: true, value: '{"platform":"test"}' }); h.drain();
    await expect(result).resolves.toEqual({ platform: "test" });
    const missing = services.invoke("missing", "read"); const failure = expect(missing).rejects.toThrow("UNSUPPORTED_MODULE");
    const r = h.drain().find(item => item.type === "InvokeModule");
    if (!r || r.type !== "InvokeModule") throw new Error("No request");
    h.send({ type: "ModuleResult", requestId: r.requestId, ok: false, value: "UNSUPPORTED_MODULE" }); h.drain(); await failure;
    const pending = services.invoke("device", "wait"); const cancelled = expect(pending).rejects.toThrow("SURFACE_DISPOSED");
    h.drain(); toggle(false);
    expect(h.drain().some(item => item.type === "CancelRequest")).toBe(true);
    await cancelled;
    await expect(services.invoke("device", "info")).rejects.toThrow("SURFACE_DISPOSED");
    h.runtime.dispose();
  });

  it("exposes a typed router facade through the reserved router module", async () => {
    let router!: import("@anseronui/ui").Router;
    function Page(): UIElement { router = useRouter(); return <View />; }
    const h = harness(definePage("router", Page));
    h.send({ type: "CreateSurface", page: "router", width: 20, height: 20 }); h.drain();
    const pushed = router.push("details");
    const pushRequest = h.drain().find(item => item.type === "InvokeModule");
    expect(pushRequest).toMatchObject({ type: "InvokeModule", module: "router", method: "push", argument: '{"page":"details"}' });
    if (!pushRequest || pushRequest.type !== "InvokeModule") throw new Error("No router request");
    h.send({ type: "ModuleResult", requestId: pushRequest.requestId, ok: true, value: "null" }); h.drain();
    await expect(pushed).resolves.toBeUndefined();
    const current = router.current();
    const currentRequest = h.drain().find(item => item.type === "InvokeModule");
    if (!currentRequest || currentRequest.type !== "InvokeModule") throw new Error("No current request");
    h.send({ type: "ModuleResult", requestId: currentRequest.requestId, ok: true, value: '"details"' }); h.drain();
    await expect(current).resolves.toBe("details");
    h.runtime.dispose();
  });

  it("snapshots route params, supports typed reads and rejects invalid JSON", async () => {
    let router!: import("@anseronui/ui").Router;
    const h = harness(definePage("route-params", () => { router = useRouter(); return <View />; }));
    h.send({ type: "CreateSurface", page: "route-params", width: 20, height: 20 }); h.drain();
    const params = { id: 7, nested: { title: "中文", flags: [true, null] } };
    const pending = router.push("details", params); params.nested.title = "changed";
    const request = h.drain().find(item => item.type === "InvokeModule");
    if (!request || request.type !== "InvokeModule") throw new Error("No push request");
    expect(JSON.parse(request.argument)).toEqual({ page: "details", params: { id: 7, nested: { title: "中文", flags: [true, null] } } });
    h.send({ type: "ModuleResult", requestId: request.requestId, ok: true, value: "null" }); h.drain(); await pending;
    const replaced = router.replace("details", { replaced: true });
    const replaceRequest = h.drain().find(item => item.type === "InvokeModule");
    if (!replaceRequest || replaceRequest.type !== "InvokeModule") throw new Error("No replace request");
    expect(JSON.parse(replaceRequest.argument)).toEqual({ page: "details", params: { replaced: true } });
    h.send({ type: "ModuleResult", requestId: replaceRequest.requestId, ok: true, value: "null" }); h.drain(); await replaced;
    const read = router.getParams<{ id: number }>();
    const readRequest = h.drain().find(item => item.type === "InvokeModule");
    if (!readRequest || readRequest.type !== "InvokeModule") throw new Error("No params request");
    expect(readRequest.method).toBe("getParams");
    h.send({ type: "ModuleResult", requestId: readRequest.requestId, ok: true, value: '{"id":7}' }); h.drain();
    expect((await read).id).toBe(7);
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    for (const value of [null, [], { bad: undefined }, { bad: NaN }, { bad: Infinity }, { bad: () => {} }, cycle]) {
      await expect(router.push("details", value as import("@anseronui/ui").RouteParams)).rejects.toThrow("INVALID_ROUTE_PARAMS");
    }
    await expect(router.push("details", { text: "x".repeat(12000) })).rejects.toThrow("ROUTE_PARAMS_TOO_LARGE");
    expect(h.drain().some(item => item.type === "InvokeModule")).toBe(false);
    h.runtime.dispose();
  });

  it("dispatches synchronous system back presses and reports consumption", () => {
    let allow = true;
    const page = definePage("back-press", () => <View onBackPress={() => allow} />);
    const h = harness(page);
    h.send({ type: "CreateSurface", page: "back-press", width: 20, height: 20 }); h.drain();
    h.send({ type: "BackPress" });
    expect(h.drain()).toContainEqual(expect.objectContaining({ type: "BackPressResult", consumed: true }));
    allow = false;
    h.send({ type: "BackPress" });
    expect(h.drain()).toContainEqual(expect.objectContaining({ type: "BackPressResult", consumed: false }));
    h.runtime.dispose();
  });

  it("exposes a function component handle after commit and clears it on removal", () => {
    const ref = createRef<{ node(): number | null }>();
    function Editor(): UIElement {
      const node = useRef<import("@anseronui/ui").NodeHandle | null>(null);
      useImperativeHandle(ref, () => ({ node: () => node.current?.nodeId ?? null }), []);
      return <View ref={node} />;
    }
    const h = harness(definePage("imperative", Editor));
    h.send({ type: "CreateSurface", page: "imperative", width: 20, height: 20 });
    const commit = h.drain(false).find(item => item.type === "Commit");
    expect(ref.current).toBeNull();
    if (!commit || commit.type !== "Commit") throw new Error("No commit");
    h.send({ type: "CommitAck", revision: commit.revision }); h.drain();
    expect(ref.current?.node()).toBe(createdNode(commit.commands, "View"));
    h.runtime.dispose(); expect(ref.current).toBeNull();
  });

  it("dispatches touch capture, target and bubbling with synchronous propagation control", () => {
    const calls: string[] = [];
    let stop = true;
    const page = definePage("touch-bubble", () => <View
      onTouchDownCapture={event => { calls.push(`capture:${event.currentTarget}:${event.target}`); }}
      onTouchDown={event => { calls.push("outer"); }}>
      <View onTouchDown={event => { calls.push("inner"); if (stop) event.stopPropagation(); }} />
    </View>);
    const h = harness(page);
    h.send({ type: "CreateSurface", page: "touch-bubble", width: 320, height: 480 });
    const commit = h.drain().find(item => item.type === "Commit");
    if (!commit || commit.type !== "Commit") throw new Error("No commit");
    const viewIds = commit.commands.filter(item => item.type === "CreateNode" && item.kind === "View").map(item => item.nodeId);
    h.send({ type: "NativeEvent", nodeId: viewIds[1]!, targetId: viewIds[1]!, revision: commit.revision, event: "touchDown", x: 1, y: 2, pageX: 3, pageY: 4, pointerId: 1, touches: [] });
    h.drain();
    expect(calls).toEqual([`capture:${viewIds[0]}:${viewIds[1]}`, "inner"]);
    stop = false;
    h.send({ type: "NativeEvent", nodeId: viewIds[1]!, targetId: viewIds[1]!, revision: commit.revision, event: "touchDown", x: 1, y: 2, pageX: 3, pageY: 4, pointerId: 1, touches: [] });
    h.drain();
    expect(calls.slice(2)).toEqual([`capture:${viewIds[0]}:${viewIds[1]}`, "inner", "outer"]);
    h.runtime.dispose();
  });

  it("runs the full capture and bubble path, including a target with no handler", () => {
    const calls: string[] = [];
    let stopAt = "";
    const record = (label: string) => (event: import("@anseronui/ui").TouchEvent) => {
      calls.push(`${label}:${event.eventPhase}`);
      if (label === stopAt) event.stopPropagation();
    };
    const h = harness(definePage("path", () => <View onTouchMoveCapture={record("outer-c")} onTouchMove={record("outer-b")}>
      <View onTouchMoveCapture={record("inner-c")} onTouchMove={record("inner-b")}><Text>hit</Text></View>
    </View>));
    h.send({ type: "CreateSurface", page: "path", width: 320, height: 480 });
    const commit = h.drain().find(item => item.type === "Commit");
    if (!commit || commit.type !== "Commit") throw new Error("No commit");
    const text = createdNode(commit.commands, "Text"), owner = createdNode(commit.commands, "View");
    const move = () => {
      calls.length = 0;
      h.send({ type: "NativeEvent", nodeId: owner, targetId: text, revision: commit.revision, event: "touchMove", x: -20, y: 2, pageX: 3, pageY: 4, pointerId: 1, touches: [] });
      h.drain();
    };
    move(); expect(calls).toEqual(["outer-c:capture", "inner-c:capture", "inner-b:bubble", "outer-b:bubble"]);
    stopAt = "outer-c"; move(); expect(calls).toEqual(["outer-c:capture"]);
    stopAt = "inner-b"; move(); expect(calls).toEqual(["outer-c:capture", "inner-c:capture", "inner-b:bubble"]);
    h.runtime.dispose();
  });

  it("remeasures RichText when span typography changes without changing text", () => {
    function Page(): UIElement {
      const [large, setLarge] = useState(false);
      return <View style={{ flexDirection: "column" }}>
        <RichText spans={[{ text: "Same text", fontSize: large ? 32 : 16 }]} />
        <Button title="Grow" onClick={() => setLarge(true)} />
      </View>;
    }
    const h = harness(definePage("rich-measure", Page));
    h.send({ type: "CreateSurface", page: "rich-measure", width: 320, height: 480 });
    const initial = h.drain();
    const commit = initial.find(item => item.type === "Commit");
    if (!commit || commit.type !== "Commit") throw new Error("No commit");
    h.send({ type: "Tap", nodeId: createdNode(commit.commands, "Button"), revision: commit.revision });
    const updated = h.drain();
    const measures = updated.filter(item => item.type === "MeasureRequest" && item.kind === "RichText");
    expect(measures.length).toBeGreaterThan(0);
    expect(measures.every(item => item.type === "MeasureRequest" && JSON.parse(String(item.props?.spans))[0].fontSize === 32)).toBe(true);
    expect(updated.some(item => item.type === "Diagnostic")).toBe(false);
    h.runtime.dispose();
  });

  it("maps RichText spans and multi-touch callbacks", () => {
    const events: unknown[] = [];
    const page = definePage("touch-rich", () => <View onTouchDown={event => events.push(event)}>
      <RichText spans={[{ text: "Hello ", color: "#cc0000" }, { text: "world", fontWeight: "bold" }]} onSpanClick={index => events.push(index)} />
    </View>);
    const h = harness(page);
    h.send({ type: "CreateSurface", page: "touch-rich", width: 300, height: 100 });
    const output = h.drain();
    const commit = output.find(item => item.type === "Commit");
    if (!commit || commit.type !== "Commit") throw new Error("No commit");
    expect(commit.commands).toContainEqual(expect.objectContaining({ type: "CreateNode", kind: "RichText" }));
    const richProps = commit.commands.find(item => item.type === "SetProps" && typeof item.props.spans === "string");
    expect(richProps?.type === "SetProps" && JSON.parse(String(richProps.props.spans))).toHaveLength(2);
    const viewId = createdNode(commit.commands, "View");
    h.send({ type: "NativeEvent", nodeId: viewId, revision: 1, event: "touchDown", x: 4, y: 5, pageX: 14, pageY: 15, pointerId: 2, touches: [{ x: 4, y: 5, pageX: 14, pageY: 15, pointerId: 2 }] });
    h.drain();
    expect(events[0]).toMatchObject({ x: 4, y: 5, pageX: 14, pageY: 15, pointerId: 2, target: viewId, currentTarget: viewId, touches: [{ x: 4, y: 5, pageX: 14, pageY: 15, pointerId: 2 }] });
    expect(typeof (events[0] as { stopPropagation?: unknown }).stopPropagation).toBe("function");
    h.runtime.dispose();
  });

  it("maps extended shared styles, input props, and native events into commits", () => {
    const observed: unknown[] = [];
    function Page(): UIElement {
      return <View style={{ maxWidth: 220, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: "#123456", position: "relative" }} onLongPress={() => observed.push("long")} onLayout={frame => observed.push(frame)}>
        <Text style={{ fontWeight: "bold", textAlign: "center" }} numberOfLines={2}>hello</Text>
        <TextInput value="secret" secureTextEntry maxLength={8} keyboardType="email-address" returnKeyType="done" onChangeText={() => {}} onFocus={() => observed.push("focus")} onSubmitEditing={value => observed.push(value)} />
        <ScrollView scrollEnabled showsVerticalScrollIndicator onScroll={(offset, event) => observed.push([offset, event.contentHeight])} onScrollEnd={event => observed.push(event.y)}><Text>row</Text></ScrollView>
      </View>;
    }
    const h = harness(definePage("extended", Page));
    h.send({ type: "CreateSurface", page: "extended", width: 300, height: 400 });
    const output = h.drain();
    const commit = output.find(item => item.type === "Commit");
    expect(commit?.type).toBe("Commit");
    if (!commit || commit.type !== "Commit") return;
    const props = commit.commands.filter(item => item.type === "SetProps").map(item => item.type === "SetProps" ? item.props : {});
    expect(props).toContainEqual(expect.objectContaining({ borderRadius: 6, borderColor: "#123456" }));
    expect(props).toContainEqual(expect.objectContaining({ secureTextEntry: true, maxLength: 8, keyboardType: "email-address" }));
    expect(commit.commands.filter(item => item.type === "BindEvent" && item.enabled).map(item => item.type === "BindEvent" ? item.event : null))
      .toEqual(expect.arrayContaining(["longPress", "layout", "focus", "submit", "scroll", "scrollEnd"]));
    h.send({ type: "NativeEvent", nodeId: 1, revision: 1, event: "longPress" });
    h.drain();
    expect(observed).toContain("long");
    expect(observed.some(item => typeof item === "object" && item !== null && "width" in item)).toBe(true);
    h.runtime.dispose();
  });

  it("creates Image and Video media nodes with cross-platform props and callbacks", () => {
    const events: string[] = [];
    const page = definePage("media", () => <View>
      <Image src="https://example.test/photo.png" resizeMode="contain" placeholderSrc="https://example.test/placeholder.png" onLoad={src => events.push("image:" + src)} onError={(_, code) => events.push("image-error:" + code)} />
      <Video src="https://example.test/clip.mp4" controls muted loop rate={1.5} resizeMode="cover" onPlaybackStateChange={state => events.push(state)} onTimeUpdate={(time, duration) => events.push(`${time}/${duration}`)} onFirstFrame={() => events.push("frame")} />
    </View>);
    const h = harness(page);
    h.send({ type: "CreateSurface", page: "media", width: 320, height: 240 });
    const output = h.drain();
    const commit = output.find(item => item.type === "Commit");
    expect(commit?.type).toBe("Commit");
    if (!commit || commit.type !== "Commit") return;
    expect(commit.commands).toContainEqual(expect.objectContaining({ type: "CreateNode", kind: "Image" }));
    expect(commit.commands).toContainEqual(expect.objectContaining({ type: "CreateNode", kind: "Video" }));
    const imageProps = commit.commands.find(item => item.type === "SetProps" && item.props.src === "https://example.test/photo.png");
    expect(imageProps?.type === "SetProps" && imageProps.props).toEqual(expect.objectContaining({ resizeMode: "contain", placeholderSrc: "https://example.test/placeholder.png" }));
    const videoProps = commit.commands.find(item => item.type === "SetProps" && item.props.src === "https://example.test/clip.mp4");
    expect(videoProps?.type === "SetProps" && videoProps.props).toEqual(expect.objectContaining({ controls: true, muted: true, loop: true, rate: 1.5 }));
    expect(commit.commands.filter(item => item.type === "BindEvent" && item.enabled).map(item => item.type === "BindEvent" ? item.event : null))
      .toEqual(expect.arrayContaining(["loadSuccess", "loadFailure", "playStateDidChanged", "playTimeDidChanged", "firstFrameDidDisplay"]));
    const image = createdNode(commit.commands, "Image");
    h.send({ type: "NativeEvent", nodeId: image, revision: 1, event: "loadSuccess", source: "https://example.test/photo.png" });
    h.drain();
    expect(events).toContain("image:https://example.test/photo.png");
    h.runtime.dispose();
  });

  it("preserves rapid input across commit ACKs and rejects duplicate input versions", () => {
    function Form(): UIElement {
      const [value, setValue] = useState("");
      return <TextInput value={value} onChangeText={setValue} />;
    }
    const h = harness(definePage("input", Form));
    h.send({ type: "CreateSurface", page: "input", width: 300, height: 100 });
    const initial = h.drain().find(item => item.type === "Commit");
    if (!initial || initial.type !== "Commit") throw new Error("No initial commit");
    const id = createdNode(initial.commands, "TextInput");
    h.send({ type: "InputChange", nodeId: id, revision: 1, inputRevision: 1, value: "a" });
    const pending = h.drain(false).find(item => item.type === "Commit");
    if (!pending || pending.type !== "Commit") throw new Error("No input commit");
    h.send({ type: "CommitAck", revision: pending.revision });
    // Input captured before the renderer applied the preceding commit arrives after its ACK.
    h.send({ type: "InputChange", nodeId: id, revision: 1, inputRevision: 2, value: "abc" });
    const outputs = h.drain();
    expect(outputs.some(item => item.type === "Commit" && item.commands.some(command => command.type === "SetProps" && command.props.value === "abc" && command.props.inputRevision === 2))).toBe(true);
    h.send({ type: "InputChange", nodeId: id, revision: 1, inputRevision: 1, value: "a" });
    expect(h.drain()).toEqual([]);
    h.runtime.dispose();
  });

  it("holds effects until ACK and batches functional updates", () => {
    const effects: string[] = [];
    function Counter(): UIElement {
      const [count, setCount] = useState(0);
      useEffect(() => { effects.push("setup:" + count); return () => { effects.push("cleanup:" + count); }; }, [count]);
      return <View><Text>{count}</Text><Button title="twice" onClick={() => { setCount(v => v + 1); setCount(v => v + 1); }} /></View>;
    }
    const h = harness(definePage("counter", Counter));
    h.send({ type: "CreateSurface", page: "counter", width: 300, height: 100 });
    const first = h.drain(false);
    const commit = first.find(item => item.type === "Commit");
    expect(commit?.type).toBe("Commit");
    if (!commit || commit.type !== "Commit") return;
    expect(effects).toEqual([]);
    const buttonId = createdNode(commit.commands, "Button");
    h.send({ type: "CommitAck", revision: commit.revision });
    h.drain();
    expect(effects).toEqual(["setup:0"]);
    h.send({ type: "Tap", nodeId: buttonId, revision: 1 });
    const second = h.drain();
    expect(second.some(item => item.type === "Commit" && item.commands.some(command => command.type === "SetProps" && command.props.text === "2"))).toBe(true);
    expect(effects).toEqual(["setup:0", "cleanup:0", "setup:2"]);
    h.send({ type: "DestroySurface" });
    expect(h.drain().some(item => item.type === "SurfaceDisposed")).toBe(true);
    expect(effects.at(-1)).toBe("cleanup:2");
  });

  it("retains keyed component state and host IDs during reorder", () => {
    function Row(props: { id: string }): UIElement {
      const [value, setValue] = useState(0);
      return <Button title={props.id + ":" + value} onClick={() => setValue(value + 1)} />;
    }
    function List(): UIElement {
      const [order, setOrder] = useState(["a", "b"]);
      return <View><Button title="swap" onClick={() => setOrder(["b", "a"])} />{order.map(id => <Row key={id} id={id} />)}</View>;
    }
    const h = harness(definePage("list", List));
    h.send({ type: "CreateSurface", page: "list", width: 300, height: 100 });
    const initial = h.drain();
    const first = initial.find(item => item.type === "Commit");
    if (!first || first.type !== "Commit") throw new Error("No first commit");
    const buttons = first.commands.filter((cmd): cmd is Extract<RenderCommand, { type: "SetProps" }> => cmd.type === "SetProps" && typeof cmd.props.title === "string");
    const b = buttons.find(cmd => cmd.props.title === "b:0")!.nodeId;
    const swap = buttons.find(cmd => cmd.props.title === "swap")!.nodeId;
    h.send({ type: "Tap", nodeId: b, revision: 1 });
    h.drain();
    h.send({ type: "Tap", nodeId: swap, revision: 2 });
    const after = h.drain();
    const reorder = after.find(item => item.type === "Commit");
    expect(reorder?.type).toBe("Commit");
    if (reorder?.type === "Commit") {
      expect(reorder.commands.some(cmd => cmd.type === "MoveChild" && cmd.nodeId === b)).toBe(true);
      expect(reorder.commands.some(cmd => cmd.type === "CreateNode" && cmd.nodeId === b)).toBe(false);
    }
  });

  it("skips children with unchanged props and rerenders them when props change", () => {
    let childRenders = 0;
    function Child(props: { label: string }): UIElement {
      childRenders++;
      return <Text>{props.label}</Text>;
    }
    function Parent(): UIElement {
      const [value, setValue] = useState(0);
      return <View><Button title="update" onClick={() => setValue(value + 1)} /><Child label={value === 2 ? "changed" : "stable"} /></View>;
    }
    const h = harness(definePage("component-bailout", Parent));
    h.send({ type: "CreateSurface", page: "component-bailout", width: 300, height: 100 });
    const first = h.drain().find(item => item.type === "Commit");
    if (!first || first.type !== "Commit") throw new Error("No initial commit");
    const button = first.commands.find(item => item.type === "SetProps" && item.props.title === "update");
    if (!button || button.type !== "SetProps") throw new Error("Update button missing");
    const buttonId = button.nodeId;
    expect(childRenders).toBe(1);
    h.send({ type: "Tap", nodeId: buttonId, revision: 1 });
    h.drain();
    expect(childRenders).toBe(1);
    h.send({ type: "Tap", nodeId: buttonId, revision: 2 });
    h.drain();
    expect(childRenders).toBe(2);
    h.runtime.dispose();
  });

  it("rerenders a child when a Context value it reads changes", () => {
    const Theme = createContext("light");
    let childRenders = 0;
    function Child(): UIElement {
      childRenders++;
      return <Text>{useContext(Theme)}</Text>;
    }
    function Parent(): UIElement {
      const [theme, setTheme] = useState("light");
      return <Theme.Provider value={theme}><Button title="toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} /><Child /></Theme.Provider>;
    }
    const h = harness(definePage("context-bailout", Parent));
    h.send({ type: "CreateSurface", page: "context-bailout", width: 300, height: 100 });
    const first = h.drain().find(item => item.type === "Commit");
    if (!first || first.type !== "Commit") throw new Error("No initial commit");
    const button = first.commands.find(item => item.type === "SetProps" && item.props.title === "toggle");
    if (!button || button.type !== "SetProps") throw new Error("Toggle button missing");
    expect(childRenders).toBe(1);
    h.send({ type: "Tap", nodeId: button.nodeId, revision: 1 });
    h.drain();
    expect(childRenders).toBe(2);
    h.runtime.dispose();
  });

  it("finds a child's own state update through reused parent output", () => {
    let parentRenders = 0;
    let childRenders = 0;
    function Child(): UIElement {
      childRenders++;
      const [value, setValue] = useState(0);
      return <Button title={String(value)} onClick={() => setValue(value + 1)} />;
    }
    function Parent(): UIElement {
      parentRenders++;
      return <View><Child /></View>;
    }
    const h = harness(definePage("descendant-state", Parent));
    h.send({ type: "CreateSurface", page: "descendant-state", width: 300, height: 100 });
    const first = h.drain().find(item => item.type === "Commit");
    if (!first || first.type !== "Commit") throw new Error("No initial commit");
    const button = createdNode(first.commands, "Button");
    h.send({ type: "Tap", nodeId: button, revision: 1 });
    const updated = h.drain().find(item => item.type === "Commit");
    expect(updated?.type).toBe("Commit");
    expect(parentRenders).toBe(1);
    expect(childRenders).toBe(2);
    if (updated?.type === "Commit") expect(updated.commands.some(item => item.type === "SetProps" && item.props.title === "1")).toBe(true);
    h.runtime.dispose();
  });

  it("never reuses a removed node ID within the same surface generation", () => {
    function Toggle(): UIElement {
      const [shown, setShown] = useState(true);
      return <View><Button title="toggle" onClick={() => setShown(value => !value)} />{shown ? <Text>child</Text> : null}</View>;
    }
    const h = harness(definePage("toggle", Toggle));
    h.send({ type: "CreateSurface", page: "toggle", width: 300, height: 100 });
    const first = h.drain().find(item => item.type === "Commit");
    if (!first || first.type !== "Commit") throw new Error("No first commit");
    const button = createdNode(first.commands, "Button");
    const removedText = createdNode(first.commands, "Text");
    h.send({ type: "Tap", nodeId: button, revision: 1 });
    h.drain();
    h.send({ type: "Tap", nodeId: button, revision: 2 });
    const third = h.drain().find(item => item.type === "Commit");
    if (!third || third.type !== "Commit") throw new Error("No third commit");
    expect(createdNode(third.commands, "Text")).toBeGreaterThan(removedText);
  });

  it("ignores stale generations after surface destruction", () => {
    const h = harness(definePage("empty", () => <View />));
    h.send({ type: "CreateSurface", page: "empty", width: 10, height: 10 });
    h.drain();
    h.send({ type: "DestroySurface" });
    h.drain();
    h.send({ type: "CreateSurface", page: "empty", width: 10, height: 10 }, 2);
    expect(h.drain().some(item => item.type === "Commit")).toBe(true);
    h.send({ type: "Tap", nodeId: 1, revision: 1 });
    expect(h.drain()).toEqual([]);
    h.send({ type: "Handshake", requiredNodes: ["View"] });
    expect(h.drain()).toEqual([]);
  });

  it("rejects acknowledgments for Core output not yet sent", () => {
    const h = harness(definePage("empty", () => <View />));
    const invalid: Envelope<InputPayload> = {
      protocolMajor: PROTOCOL_MAJOR, protocolMinor: PROTOCOL_MINOR,
      bundleBuildId: "test-build", runtimeEpoch: 1, surfaceId: 1,
      surfaceGeneration: 1, sequence: 1, ackSequence: 1,
      payload: { type: "CreateSurface", page: "empty", width: 10, height: 10 },
    };
    expect(() => h.runtime.post(invalid)).toThrow("PROTOCOL_ACK_AHEAD");
    h.send(invalid.payload);
    expect(h.drain().some(item => item.type === "Commit")).toBe(true);
  });

  it("resolves a host module Promise and cancels requests on destroy", async () => {
    let wakes = 0;
    function Remote(): UIElement {
      const [text, setText] = useState("idle");
      const { http } = useServices();
      return <View><Text>{text}</Text><Button title="load" onClick={async () => setText(await http.getText("/hello"))} /></View>;
    }
    const h = harness(definePage("remote", Remote), () => { wakes++; });
    h.send({ type: "CreateSurface", page: "remote", width: 300, height: 100 });
    const first = h.drain().find(item => item.type === "Commit");
    if (!first || first.type !== "Commit") throw new Error("No first commit");
    const button = createdNode(first.commands, "Button");
    h.send({ type: "Tap", nodeId: button, revision: 1 });
    const request = h.drain().find(item => item.type === "InvokeModule");
    expect(request).toMatchObject({ type: "InvokeModule", module: "http", method: "getText", argument: "/hello" });
    if (!request || request.type !== "InvokeModule") return;
    const wakesBeforeResult = wakes;
    h.send({ type: "ModuleResult", requestId: request.requestId, ok: true, value: "loaded" });
    h.drain();
    await Promise.resolve();
    expect(wakes).toBeGreaterThan(wakesBeforeResult);
    const updated = h.drain();
    expect(updated.some(item => item.type === "Commit" && item.commands.some(command => command.type === "SetProps" && command.props.text === "loaded"))).toBe(true);
    h.send({ type: "Tap", nodeId: button, revision: 2 });
    const pending = h.drain().find(item => item.type === "InvokeModule");
    if (!pending || pending.type !== "InvokeModule") throw new Error("No second request");
    h.send({ type: "DestroySurface" });
    const disposed = h.drain();
    expect(disposed.some(item => item.type === "CancelRequest" && item.requestId === pending.requestId)).toBe(true);
    h.send({ type: "ModuleResult", requestId: pending.requestId, ok: true, value: "too late" });
    expect(h.drain()).toEqual([]);
  });
});

it('host timers are asynchronous, cancellable, scoped and retired with the surface', () => {
  const calls: string[] = [];
  let handle = 0;
  const page = definePage('timers', () => {
    useEffect(() => {
      const cancelled = setTimeout(() => calls.push('cancelled'), 25);
      clearTimeout(cancelled); clearTimeout(cancelled); clearTimeout(undefined);
      handle = setTimeout(() => {
        calls.push('fired');
        setTimeout(() => calls.push('nested'), 0);
      }, 2.9);
    }, []);
    return <View />;
  });
  const h = harness(page);
  h.send({type:'CreateSurface',page:'timers',width:100,height:100});
  const outputs = h.drain();
  const requests = outputs.filter(p => p.type === 'InvokeModule');
  expect(requests).toHaveLength(2);
  expect(requests[1].argument).toBe('2');
  expect(outputs).toContainEqual({type:'CancelRequest',requestId:requests[0].requestId});
  expect(calls).toEqual([]);
  h.send({type:'ModuleResult',requestId:requests[0].requestId,ok:true,value:''});
  h.drain(); expect(calls).toEqual([]);
  h.send({type:'ModuleResult',requestId:requests[1].requestId,ok:true,value:''});
  const nested = h.drain().find(p => p.type === 'InvokeModule');
  expect(nested?.argument).toBe('0');
  expect(calls).toEqual(['fired']);
  clearTimeout(handle); // fired handles are harmless
  h.send({type:'ModuleResult',requestId:requests[1].requestId,ok:true,value:''});
  h.drain(); expect(calls).toEqual(['fired']);
  h.send({type:'DestroySurface'});
  expect(h.drain()).toContainEqual({type:'CancelRequest',requestId:nested!.requestId});
  h.send({type:'ModuleResult',requestId:nested!.requestId,ok:true,value:''});
  h.drain(); expect(calls).toEqual(['fired']);
  h.runtime.dispose();
});

it('useTimers keeps the originating surface after await and refuses scheduling after disposal', async () => {
  let timers: ReturnType<typeof useTimers> | undefined;
  const page = definePage('timers', () => { timers = useTimers(); return <View />; });
  const h = harness(page);
  h.send({type:'CreateSurface',page:'timers',width:100,height:100}); h.drain();
  await Promise.resolve();
  let count = 0;
  const id = timers!.setTimeout(() => { count++; }, -10);
  const request = h.drain().find(p => p.type === 'InvokeModule')!;
  expect(request.argument).toBe('0');
  timers!.clearTimeout(id);
  h.send({type:'ModuleResult',requestId:request.requestId,ok:true,value:''}); h.drain();
  expect(count).toBe(0);
  h.runtime.dispose();
  expect(() => timers!.setTimeout(() => {}, 1)).toThrow('SURFACE_DISPOSED');
});

it('timer callback failures are diagnostics and do not leave a live handle', () => {
  const page = definePage('timers', () => {
    useEffect(() => { setTimeout(() => { throw new Error('timer boom'); }, 1); }, []);
    return <View />;
  });
  const h = harness(page);
  h.send({type:'CreateSurface',page:'timers',width:100,height:100});
  const request = h.drain().find(p => p.type === 'InvokeModule')!;
  h.send({type:'ModuleResult',requestId:request.requestId,ok:true,value:''});
  expect(h.drain()).toContainEqual({type:'Diagnostic',code:'TIMER_ERROR',message:'Error: timer boom'});
  h.runtime.dispose();
});

describe('standard native services', () => {
  it('delivers subscription values repeatedly and cancels pending reads on component removal', async () => {
    let services!: import('@anseronui/ui').Services;
    let remove = () => {};
    const values: unknown[] = [];
    const errors: Error[] = [];
    function Child(): UIElement { services = useServices(); return <Text>child</Text>; }
    function Page(): UIElement { const [visible, setVisible] = useState(true); remove = () => setVisible(false); return <View>{visible ? <Child /> : null}</View>; }
    const h = harness(definePage('native-stream', Page));
    h.send({ type: 'CreateSurface', page: 'native-stream', width: 320, height: 480 }); h.drain();
    const stop = services.network.subscribe(value => values.push(value), error => errors.push(error));
    const first = h.drain().find(item => item.type === 'InvokeModule');
    expect(first).toMatchObject({ module: 'events', method: 'next' });
    if (first?.type !== 'InvokeModule') throw new Error('missing subscription');
    h.send({ type: 'ModuleResult', requestId: first.requestId, ok: true, value: '{"connected":true,"type":"wifi"}' }); h.drain();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(values).toEqual([{ connected: true, type: 'wifi' }]);
    const second = h.drain().find(item => item.type === 'InvokeModule');
    expect(second).toMatchObject({ module: 'events', method: 'next', argument: first.argument });
    if (second?.type !== 'InvokeModule') throw new Error('missing next read');
    remove(); const outputs = h.drain();
    expect(outputs).toContainEqual({ type: 'CancelRequest', requestId: second.requestId });
    expect(outputs).toContainEqual(expect.objectContaining({ type: 'InvokeModule', module: 'events', method: 'close' }));
    h.send({ type: 'ModuleResult', requestId: second.requestId, ok: true, value: '{"connected":false,"type":"none"}' }); h.drain();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(values).toHaveLength(1); expect(errors).toEqual([]);
    stop(); h.runtime.dispose();
  });

  it('returns HTTP status/headers and maps errors to stable service codes', async () => {
    let services!: import('@anseronui/ui').Services;
    function Page(): UIElement { services = useServices(); return <View />; }
    const h = harness(definePage('native-http', Page));
    h.send({ type: 'CreateSurface', page: 'native-http', width: 320, height: 480 }); h.drain();
    const response = services.http.request({ url: 'https://example.test/api', method: 'POST', headers: { Authorization: 'example' }, body: '{}' });
    const request = h.drain().find(item => item.type === 'InvokeModule');
    expect(request).toMatchObject({ module: 'http', method: 'request' });
    if (request?.type !== 'InvokeModule') throw new Error('missing HTTP');
    expect(JSON.parse(request.argument)).toMatchObject({ method: 'POST', body: '{}' });
    h.send({ type: 'ModuleResult', requestId: request.requestId, ok: true, value: '{"status":401,"headers":{},"body":"unauthorized"}' }); h.drain();
    await expect(response).resolves.toMatchObject({ status: 401, body: 'unauthorized' });
    const failure = services.secureStorage.get('token');
    const pending = h.drain().find(item => item.type === 'InvokeModule');
    if (pending?.type !== 'InvokeModule') throw new Error('missing secure storage');
    h.send({ type: 'ModuleResult', requestId: pending.requestId, ok: false, value: 'UNSUPPORTED: secureStorage' }); h.drain();
    await expect(failure).rejects.toMatchObject({ name: 'NativeServiceError', code: 'UNSUPPORTED' }); h.runtime.dispose();
  });
});
