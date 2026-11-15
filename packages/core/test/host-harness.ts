import { ReferenceRuntime } from '../src/runtime.js';
import type { Page } from '@anseronui/ui';
import type { Envelope, InputPayload, OutputPayload, RenderProps, Frame } from '@anseronui/protocol';
import { validateEnvelope } from '@anseronui/protocol';

export class TestHost {
  runtime: ReferenceRuntime;
  nodes = new Map<number, { kind: string; props: RenderProps; frame?: Frame; parent?: number }>();
  outputs: OutputPayload[] = [];
  scrolls: number[] = [];
  sequence = 0; ack = 0; revision = 0;
  constructor(page: Page<any>) { this.runtime = new ReferenceRuntime({ bundleBuildId: 'test', pages: [page], profile: true }); }
  send(payload: InputPayload): void {
    this.runtime.post({ protocolMajor: 1, protocolMinor: 5, bundleBuildId: 'test', runtimeEpoch: 1, surfaceId: 1, surfaceGeneration: 1,
      sequence: ++this.sequence, ackSequence: this.ack, payload });
  }
  async settle(): Promise<OutputPayload[]> {
    const collected: OutputPayload[] = [];
    let idle = 0;
    for (let rounds = 0; rounds < 200; rounds++) {
      await Promise.resolve();
      const messages = this.runtime.step();
      if (!messages.length && !this.runtime.hasPendingWork()) { if (++idle >= 5) return collected; } else idle = 0;
      for (const message of messages) {
        validateEnvelope<OutputPayload>(message); this.ack = message.sequence;
        const p = message.payload; this.outputs.push(p); collected.push(p);
        if (p.type === 'Diagnostic') throw new Error(JSON.stringify(p));
        if (p.type === 'MeasureRequest') {
          const lines = p.text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length * p.fontSize * 0.6 / Math.max(1, p.maxWidth))), 0);
          const visibleLines = p.props?.numberOfLines ? Math.min(lines, Number(p.props.numberOfLines)) : lines;
          this.send({ type: 'MeasureResult', requestId: p.requestId, nodeId: p.nodeId, width: Math.min(p.maxWidth, p.text.length * p.fontSize * 0.6), height: visibleLines * Number(p.props?.lineHeight ?? p.fontSize + 4), baseline: p.fontSize });
        }
        if (p.type === 'Commit') {
          this.revision = p.revision;
          const remove = (id: number) => { for (const [child, node] of this.nodes) if (node.parent === id) remove(child); this.nodes.delete(id); };
          for (const c of p.commands) {
            if (c.type === 'CreateNode') this.nodes.set(c.nodeId, { kind: c.kind, props: {} });
            if (c.type === 'RemoveNode') remove(c.nodeId);
            if (c.type === 'SetProps') this.nodes.get(c.nodeId)!.props = c.props;
            if (c.type === 'SetFrame') this.nodes.get(c.nodeId)!.frame = c.frame;
            if (c.type === 'InsertChild' || c.type === 'MoveChild') this.nodes.get(c.nodeId)!.parent = c.parentId;
          }
          this.send({ type: 'CommitAck', revision: p.revision });
        }
        if (p.type === 'InvokeModule' && p.module === '__view') {
          if (p.method === 'scrollTo') this.scrolls.push(JSON.parse(p.argument).args.y);
          this.send({ type: 'ModuleResult', requestId: p.requestId, ok: true, value: 'null' });
        }
      }
    }
    throw new Error('Test host did not settle');
  }
  async mount(page: string, width = 320, height = 480): Promise<void> { this.send({ type: 'CreateSurface', page, width, height }); await this.settle(); }
}
