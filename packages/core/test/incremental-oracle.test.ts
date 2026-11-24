import { expect, it } from 'vitest';
import { LayoutKernel } from '../src/kernel.js';
import { CORE_ABI_VERSION as abi } from '../src/contracts.js';
import type { BeginRenderRequest, NodeMutation, Prepared, RenderNode } from '../src/contracts.js';
import type { Frame } from '@anseronui/protocol';

it('matches full synchronization after seeded field, constraint and sibling order mutations', () => {
  const incremental = new LayoutKernel(), oracle = new LayoutKernel();
  let seed = 18371; const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/0x100000000; };
  const children: RenderNode[] = Array.from({length:40},(_,i)=>({id:i+2,kind:'View',props:{opacity:1},style:{width:10+i%5,height:10+i%7},events:[],children:[],frame:{x:0,y:0,width:0,height:0}}));
  const root: RenderNode = {id:1,kind:'View',props:{},style:{flexDirection:'row',flexWrap:'wrap',gap:3},events:[],children,frame:{x:0,y:0,width:0,height:0}};
  const frames = new Map<number,Frame>(); let previous: RenderNode[] = [];
  try {
    for (let revision=1;revision<=50;revision++) {
      const mutations: NodeMutation[]=[];
      if (revision===1) {
        for(const n of [root,...children]) mutations.push({type:'Create',nodeId:n.id,kind:n.kind,props:n.props,style:n.style,events:[]});
        mutations.push({type:'Children',parentId:0,children:[1]});
      } else {
        const node=children[Math.floor(random()*children.length)], width=Math.floor(random()*35)+1;
        node.style={...node.style,width}; node.props={opacity:random()};
        mutations.push({type:'Patch',nodeId:node.id,propsSet:node.props,propsUnset:[],styleSet:{width},styleUnset:[]});
        if (revision%3===0) { const from=Math.floor(random()*children.length), to=Math.floor(random()*children.length); children.splice(to,0,children.splice(from,1)[0]); }
      }
      if(revision===1 || revision%3===0) mutations.push({type:'Children',parentId:1,children:children.map(n=>n.id)});
      const width=100+revision%5*17;
      const request: BeginRenderRequest={type:'BeginRender',abi,surfaceId:1,generation:1,transactionId:revision,baseRevision:revision-1,targetRevision:revision,width,height:400,environmentVersion:0,nextRequestId:1,mutations};
      const actual=incremental.execute(request) as Prepared;
      expect(actual.ready).toBe(true);
      for(const item of actual.frames) frames.set(item.nodeId,item.frame);
      const expected=oracle.render({type:'Render',abi,surfaceId:1,generation:1,revision,round:1,width,height:400,nextRequestId:1,tree:[root],previous,measureCache:[]});
      for(const item of expected.frames) expect(frames.get(item.nodeId)).toEqual(item.frame);
      incremental.execute({type:'FinalizeRender',abi,surfaceId:1,generation:1,transactionId:revision});
      previous=JSON.parse(JSON.stringify([root]));
    }
  } finally { incremental.dispose(); oracle.dispose(); }
});

it('retains early frame candidates across measurement rounds and suppresses provisional geometry', () => {
  const core = new LayoutKernel();
  const begin = (revision: number, mutations: NodeMutation[]): Prepared => core.execute({
    type: 'BeginRender', abi, surfaceId: 1, generation: 1, transactionId: revision,
    baseRevision: revision - 1, targetRevision: revision, width: 100, height: 200,
    environmentVersion: 0, nextRequestId: 1, mutations,
  }) as Prepared;
  const measure = (revision: number, first: Prepared): Prepared => {
    let result = first;
    for (let round = 0; !result.ready && round < 8; round++) {
      expect(result.frames).toEqual([]);
      expect(result.commands).toEqual([]);
      result = core.execute({ type: 'ContinueRender', abi, surfaceId: 1, generation: 1,
        transactionId: revision, round: result.round,
        measurements: result.measures.map(query => ({ requestId: query.requestId,
          nodeId: query.nodeId, key: query.key, width: 50, height: 20, baseline: 16 })),
      }) as Prepared;
    }
    expect(result.ready).toBe(true);
    return result;
  };
  try {
    measure(1, begin(1, [
      { type: 'Create', nodeId: 1, kind: 'View', props: {}, style: { flexDirection: 'column' }, events: [] },
      { type: 'Create', nodeId: 2, kind: 'View', props: {}, style: { width: 20, height: 20 }, events: [] },
      { type: 'Create', nodeId: 3, kind: 'Text', props: { text: 'first' }, style: { width: 100 }, events: [] },
      { type: 'Create', nodeId: 4, kind: 'View', props: {}, style: { width: 10, height: 10 }, events: [] },
      { type: 'Children', parentId: 1, children: [2, 3, 4] },
      { type: 'Children', parentId: 0, children: [1] },
    ]));
    core.execute({ type: 'FinalizeRender', abi, surfaceId: 1, generation: 1, transactionId: 1 });
    const provisional = begin(2, [
      { type: 'Patch', nodeId: 2, propsSet: {}, propsUnset: [], styleSet: { width: 30 }, styleUnset: [] },
      { type: 'Patch', nodeId: 3, propsSet: { text: 'second' }, propsUnset: [], styleSet: {}, styleUnset: [] },
    ]);
    expect(provisional.ready).toBe(false);
    const final = measure(2, provisional);
    // Node 2 changed in the first pass, then remains cached during text measurement.
    expect(final.frames).toContainEqual({ nodeId: 2, frame: { x: 0, y: 0, width: 30, height: 20 } });
    // Node 4 moved with a zero-height placeholder, then returned to its committed y.
    expect(final.frames.some(item => item.nodeId === 4)).toBe(false);
    expect(final.commands.filter(command => command.type === 'SetFrame').map(command => command.nodeId)).toEqual([2]);
    core.execute({ type: 'FinalizeRender', abi, surfaceId: 1, generation: 1, transactionId: 2 });
  } finally { core.dispose(); }
});
