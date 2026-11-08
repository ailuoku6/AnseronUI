import { ReferenceRuntime } from "@anseronui/core";
import { PROTOCOL_MAJOR, PROTOCOL_MINOR } from "@anseronui/protocol";
import type { Envelope, InputPayload } from "@anseronui/protocol";
import { Text, View, definePage } from "@anseronui/ui";
import type { UIElement } from "@anseronui/ui";

function Home(): UIElement {
  return View({ style: { width: 120, padding: 4 }, children: [Text({ children: "hello" })] });
}
const runtime = new ReferenceRuntime({ bundleBuildId: "probe", pages: [definePage("home", Home)] });
let sequence = 0;
function post(payload: InputPayload): void {
  const input: Envelope<InputPayload> = {
    protocolMajor: PROTOCOL_MAJOR, protocolMinor: PROTOCOL_MINOR,
    bundleBuildId: "probe", runtimeEpoch: 1, surfaceId: 1, surfaceGeneration: 1,
    sequence: ++sequence, ackSequence: 0, payload,
  };
  runtime.post(input);
}
post({ type: "CreateSurface", page: "home", width: 200, height: 100 });
for (let pass = 0; pass < 10; pass++) {
  const output = runtime.step();
  for (const message of output) {
    const payload = message.payload;
    if (payload.type === "MeasureRequest") {
      post({ type: "MeasureResult", requestId: payload.requestId, nodeId: payload.nodeId, width: 40, height: 16, baseline: 12 });
    } else if (payload.type === "Commit") {
      console.log("commit:" + payload.revision + ":" + payload.commands.length);
      post({ type: "CommitAck", revision: payload.revision });
    } else if (payload.type === "Diagnostic") console.log("error:" + payload.code);
  }
}
runtime.dispose();
