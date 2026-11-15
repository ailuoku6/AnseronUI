import type { DevtoolsNode } from './protocol.js';

// Debug-only views of the JS host internals. Kept outside render-web/core so no
// inspector code or component traversal is linked into production applications.
type Frame = { path: string; component: {name?: string}; props: object; slots: {kind: string; value?: unknown}[] };
type HostNode = {id: number; path: string; kind: string; nativeName?: string; props: Record<string,unknown>; style: Record<string,unknown>; frame: DevtoolsNode['rect']; children: HostNode[]};
type Surface = {page: {name: string}; width: number; height: number; frames: Map<string, Frame>; tree: HostNode[]};
export type InspectableHost = {
  renderer: {root: HTMLElement};
  runtime: {getStats?: () => Record<string, number>};
  getPerformanceStats?: () => Record<string, number>;
};
export function safeValue(value: unknown): unknown {
  const seen = new WeakSet<object>();
  try { return JSON.parse(JSON.stringify(value, (_key, v) => {
    if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
    if (typeof v === 'bigint') return String(v);
    if (v instanceof Error) return {name:v.name,message:v.message,stack:v.stack};
    if (v && typeof v === 'object') { if (seen.has(v)) return '[Circular]'; seen.add(v); }
    return v;
  }) ?? 'null'); } catch { return String(value); }
}
export function inspectNodes(host: InspectableHost, componentIds: Map<string, number>): DevtoolsNode[] {
  const nodes: DevtoolsNode[] = [];
  const byId = new Map<number,DevtoolsNode>();
  const paths = new Map<number, string>();
  const surfaces = (host.runtime as unknown as {surfaces?: Map<number,Surface>}).surfaces;
  for (const [surfaceId,surface] of surfaces ?? []) {
    const pageId = -1000000 - surfaceId;
    const pageNode: DevtoolsNode = {id:pageId,parentId:0,tag:'Page',component:surface.page.name,props:{},rect:{x:0,y:0,width:surface.width,height:surface.height},children:[]};
    nodes.push(pageNode);byId.set(pageId,pageNode);paths.set(pageId,'');
    const append = (items:HostNode[],parentId:number,x:number,y:number):void => {
      for(const n of items) {
        const rect={...n.frame,x:x+n.frame.x,y:y+n.frame.y};
        const node:DevtoolsNode={id:n.id,parentId,tag:n.nativeName??n.kind,rect,props:safeValue(n.props) as Record<string,unknown>,styles:Object.fromEntries(Object.entries(n.style).map(([k,v])=>[k,String(v)])),children:[]};
        nodes.push(node);byId.set(node.id,node);append(n.children,n.id,rect.x,rect.y);
      }
    };
    append(surface.tree,pageId,0,0);
    const frames = [...surface.frames.values()].sort((a,b)=>a.path.length-b.path.length);
    const frameId = (frame: Frame) => { const key = surfaceId + ':' + frame.path; if (!componentIds.has(key)) componentIds.set(key,-componentIds.size-2); return componentIds.get(key)!; };
    const parentFrame = (path: string) => frames.filter(f=>path.startsWith(f.path + '/')).at(-1);
    const hostPaths: HostNode[] = [];
    const visit = (items: HostNode[]) => { for (const n of items) {hostPaths.push(n);visit(n.children);} }; visit(surface.tree);
    for (const n of hostPaths) paths.set(n.id, n.path);
    for (const f of frames) {
      const descendants = hostPaths.filter(n=>n.path.startsWith(f.path + '/')).map(n=>byId.get(n.id)).filter((n): n is DevtoolsNode=>!!n);
      const xs=descendants.map(n=>n.rect.x),ys=descendants.map(n=>n.rect.y);
      const x=xs.length?Math.min(...xs):0,y=ys.length?Math.min(...ys):0;
      const parent = parentFrame(f.path);
      // A component nested inside a host element belongs under that element.
      const hostParent = hostPaths.filter(n=>f.path.startsWith(n.path+'/')).sort((a,b)=>b.path.length-a.path.length)[0];
      const parentId = hostParent && (!parent || hostParent.path.length>parent.path.length) ? hostParent.id : parent ? frameId(parent) : pageId;
      const node: DevtoolsNode = {id:frameId(f),parentId,tag:'Component',component:f.component.name||'Anonymous',props:safeValue(f.props) as Record<string,unknown>,
        state:Object.fromEntries(f.slots.flatMap((slot,i)=>['state','reducer','memo'].includes(slot.kind)?[[slot.kind+'['+i+']',safeValue(slot.value)]]:[])),
        rect:{x,y,width:Math.max(x,...descendants.map(n=>n.rect.x+n.rect.width))-x,height:Math.max(y,...descendants.map(n=>n.rect.y+n.rect.height))-y},children:[]};
      nodes.push(node);byId.set(node.id,node);paths.set(node.id, f.path);
    }
    for (const hostNode of hostPaths) {
      const node=byId.get(hostNode.id);const frame=parentFrame(hostNode.path);if(!node||!frame)continue;
      const hostParent=hostPaths.find(n=>n.id===node.parentId);
      if (!hostParent || frame.path.length>hostParent.path.length) node.parentId=frameId(frame);
    }
  }
  nodes.sort((a,b)=>(paths.get(a.id) ?? '').localeCompare(paths.get(b.id) ?? '', undefined, {numeric:true}));
  for (const n of nodes) byId.get(n.parentId)?.children.push(n.id);
  return nodes;
}
