import { ReferenceRuntime } from "@anseronui/core";
import { PROTOCOL_MAJOR, PROTOCOL_MINOR } from "@anseronui/protocol";
import type { Envelope, InputPayload } from "@anseronui/protocol";
import { counterPage } from "../../../.verification/framework/counter.js";

const runtime = new ReferenceRuntime({ bundleBuildId: "counter", pages: [counterPage] });
let sequence = 0;
let buttonId = 0;
function post(payload: InputPayload): void {
  const input: Envelope<InputPayload> = {
    protocolMajor: PROTOCOL_MAJOR, protocolMinor: PROTOCOL_MINOR,
    bundleBuildId: "counter", runtimeEpoch: 1, surfaceId: 1, surfaceGeneration: 1,
    sequence: ++sequence, ackSequence: 0, payload,
  };
  runtime.post(input);
}
function drain(): void {
  for (let pass = 0; pass < 12; pass++) {
    const output = runtime.step();
    for (const message of output) {
      const payload = message.payload;
      if (payload.type === "MeasureRequest") {
        post({ type: "MeasureResult", requestId: payload.requestId, nodeId: payload.nodeId,
          width: Math.min(payload.maxWidth, Math.max(1, payload.text.length * 8)), height: 18, baseline: 14 });
      } else if (payload.type === "Commit") {
        for (const command of payload.commands) {
          if (command.type === "CreateNode" && command.kind === "Button") buttonId = command.nodeId;
          if (command.type === "SetProps" && command.props.text !== undefined) console.log("text:" + command.props.text);
        }
        post({ type: "CommitAck", revision: payload.revision });
      } else if (payload.type === "Diagnostic") console.log("error:" + payload.code);
    }
  }
}
post({ type: "CreateSurface", page: "counter", width: 300, height: 120 });
drain();
post({ type: "Tap", nodeId: buttonId, revision: 1 });
drain();
runtime.dispose();
