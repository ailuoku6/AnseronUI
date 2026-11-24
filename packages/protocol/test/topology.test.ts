import { expect, it } from 'vitest';
import { RenderTopology } from '../src/topology.js';
import type { RenderCommand } from '../src/index.js';
it('preflights cycles, subtree deletion, post-removal indices and atomic input before publication', () => {
  const graph = new RenderTopology();
  graph.prepare([{type:'CreateNode',nodeId:1,kind:'View'},{type:'CreateNode',nodeId:2,kind:'TextInput'},
    {type:'InsertChild',nodeId:1,parentId:0,index:0},{type:'InsertChild',nodeId:2,parentId:1,index:0}])();
  expect(()=>graph.prepare([{type:'MoveChild',nodeId:1,parentId:2,index:0}])).toThrow();
  expect(()=>graph.prepare([{type:'RemoveNode',nodeId:1},{type:'PatchProps',nodeId:2,set:{opacity:0.5},unset:[]}])).toThrow('UNKNOWN_RENDER_NODE');
  expect(()=>graph.prepare([{type:'PatchProps',nodeId:2,set:{value:'x'},unset:[]}])).toThrow();
  expect(()=>graph.prepare([{type:'MoveChild',nodeId:1,parentId:0,index:1}])).toThrow('INVALID_RENDER_INDEX');
  const move: RenderCommand[] = [{type:'DetachChild',nodeId:2},{type:'RemoveNode',nodeId:1},{type:'MoveChild',nodeId:2,parentId:0,index:0}];
  graph.prepare(move)(); // Failed preflight never damaged the committed graph.
  graph.prepare([{type:'PatchProps',nodeId:2,set:{value:'7',inputRevision:1},unset:[]}])();
});
