import { validCommand, patchProps } from './index.js';
import type { NodeKind, RenderCommand, RenderProps } from './index.js';
export interface TopologyRecord { kind: NodeKind; parent: number | null; children: number[]; props: RenderProps }
/** Persistent preflight graph. Only touched records and changed child lists are
 * copied; callers publish after platform application succeeds, or discard. */
export class RenderTopology {
  private records = new Map<number, TopologyRecord>();
  private roots: number[] = [];
  clear(): void { this.records.clear(); this.roots = []; }
  prepare(commands: readonly RenderCommand[]): () => void {
    const edits = new Map<number, TopologyRecord>(), removed = new Set<number>();
    let roots = this.roots;
    const get = (id: number): TopologyRecord => {
      const record = removed.has(id) ? undefined : edits.get(id) ?? this.records.get(id);
      if (!record) throw new Error('UNKNOWN_RENDER_NODE'); return record;
    };
    const edit = (id: number): TopologyRecord => {
      let record = edits.get(id);
      if (!record) { record = { ...get(id) }; edits.set(id, record); }
      return record;
    };
    const list = (parent: number): number[] => parent === 0 ? roots : get(parent).children;
    const setList = (parent: number, children: number[]): void => { if (parent === 0) roots = children; else edit(parent).children = children; };
    const detach = (id: number): void => {
      const record = edit(id);
      if (record.parent !== null) setList(record.parent, list(record.parent).filter(child => child !== id));
      record.parent = null;
    };
    const remove = (id: number): void => { const children = get(id).children; for (const child of children) remove(child); removed.add(id); edits.delete(id); };
    for (const command of commands) {
      if (!validCommand(command)) throw new Error('INVALID_RENDER_COMMAND');
      const id = command.nodeId;
      if (command.type === 'CreateNode') {
        if (this.records.has(id) || edits.has(id) || removed.has(id)) throw new Error('DUPLICATE_RENDER_NODE');
        edits.set(id, { kind: command.kind, parent: null, children: [], props: {} }); continue;
      }
      const record = get(id);
      switch (command.type) {
        case 'InsertChild': case 'MoveChild': {
          if (command.parentId !== 0 && !['View', 'ScrollView', 'Native'].includes(get(command.parentId).kind)) throw new Error('RENDER_PARENT_IS_LEAF');
          let parent = command.parentId;
          while (parent) { if (parent === id) throw new Error('RENDER_GRAPH_CYCLE'); parent = get(parent).parent ?? 0; }
          detach(id);
          const children = list(command.parentId).slice();
          if (command.index > children.length) throw new Error('INVALID_RENDER_INDEX');
          children.splice(command.index, 0, id); setList(command.parentId, children); edit(id).parent = command.parentId; break;
        }
        case 'DetachChild': detach(id); break;
        case 'RemoveNode': detach(id); remove(id); break;
        case 'PatchProps': edit(id).props = patchProps(record.props, command.set, command.unset); break;
        case 'SetProps': edit(id).props = command.props; break;
      }
    }
    return () => { for (const id of removed) this.records.delete(id); for (const [id, record] of edits) this.records.set(id, record); this.roots = roots; };
  }
}
