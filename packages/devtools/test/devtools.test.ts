import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DevtoolsHub } from '../src/hub.ts';
import { startDevtoolsServer } from '../src/server.ts';
import { DevtoolsStore } from '../ui/src/store.ts';
import { adaptSnapshot } from '../ui/src/adapter.ts';
import { buildRows } from '../ui/src/tree.ts';
import { toCurl } from '../ui/src/curl.ts';
import type { DevtoolsSnapshot } from '../src/protocol.ts';
const snapshot = (extra: Partial<DevtoolsSnapshot> = {}): DevtoolsSnapshot => ({ protocol:1,type:'snapshot',pagerId:'page-a',page:'Counter',ts:Date.now(),seq:1,capabilities:['full','sample'],...extra });
const log = (seq: number) => ({seq,level:'info' as const,args:['hello '+seq],ts:Date.now()});
test('hub merges retries and pending records, rejects old snapshots and late destroyed pages', () => {
 const hub=new DevtoolsHub();
 hub.ingest(snapshot({logs:[log(1)],network:[{id:'r1',url:'/api',method:'POST',ts:1}]}));
 hub.ingest(snapshot({seq:2,logs:[log(1),log(2)],network:[{id:'r1',url:'/api',method:'POST',ts:1,status:200,responseBody:'ok'}]}));
 hub.ingest(snapshot({logs:[log(3)]}));
 assert.equal(hub.sessions.get('page-a')!.logs.length,2);
 assert.equal(hub.sessions.get('page-a')!.network.length,1);
 assert.equal(hub.sessions.get('page-a')!.network[0].status,200);
 hub.ingest(snapshot({seq:3,destroyed:true}));
 hub.ingest(snapshot({seq:2}));
 assert.equal(hub.sessions.size,0);
});
test('panel clear survives new snapshots and does not clear other categories or pages',()=>{
 const store=new DevtoolsStore();
 const first=snapshot({logs:[log(1)],network:[{id:'r1',url:'/api',method:'GET',ts:1}]});
 store.accept(first);store.clearActiveBuffers('logs');store.accept({...first,ts:first.ts+1});
 assert.equal(store.active!.logs.length,0);assert.equal(store.active!.network.length,1);
 store.accept(snapshot({pagerId:'page-b',logs:[log(1)]}));store.selectSession('page-b');assert.equal(store.active!.logs.length,1);
 store.selectSession('page-a');store.accept({...first,ts:first.ts+2,logs:[log(1),log(2)]});
 assert.deepEqual(store.active!.logs.map(l=>l.seq),[2]);
});
test('adapter preserves actual components and their ancestors, payloads, and curl headers',()=>{
 const node=(id:number,parentId:number,component?:string)=>({id,parentId,tag:component?'Component':'View',component,rect:{x:0,y:0,width:100,height:100},props:{},children:[]});
 const state=adaptSnapshot(snapshot({nodes:[node(-2,0,'Page'),node(1,-2),{...node(-3,1,'CounterCard'),state:{count:2}},node(2,-3)],network:[{id:'r',url:'http://localhost/api',method:'POST',requestBody:'{"hello":1}',requestHeaders:{'Content-Type':'application/json'},responseHeaders:{'X-Test':'yes'},ts:1}]}));
 const rows=buildRows(new Map(state.nodes.map(n=>[n.id,n])),new Set([-2]),'CounterCard',true);
 assert.deepEqual(rows.map(r=>r.node.id),[-2,1,-3]);assert.deepEqual(state.nodes[2].s,{count:2});
 assert.match(toCurl(state.network[0]),/application\/json/);assert.match(state.network[0].responseHeaders!,/X-Test/);
});
test('server serves bundled UI, hydrates SSE history, validates and delivers commands',async()=>{
 const server=await startDevtoolsServer({port:0});const base=`http://127.0.0.1:${server.port}/__anseronui_devtools`;
 const post=(path:string,value:unknown)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
 try {
  assert.equal((await post('/ingest',snapshot({logs:[log(1)]}))).status,200);
  const html=await (await fetch(base)).text();assert.match(html,/\/assets\/.*\.js/);
  const asset=html.match(/src="([^"]+\.js)"/)![1];assert.equal((await fetch(`http://127.0.0.1:${server.port}`+asset)).status,200);
  const abort=new AbortController();const stream=await fetch(base+'/events',{signal:abort.signal});
  const reader=stream.body!.getReader();let text='';while(!text.includes('hello 1'))text+=new TextDecoder().decode((await reader.read()).value);
  assert.match(text,/"type":"sessions"/);assert.match(text,/"type":"snapshot"/);abort.abort();
  assert.equal((await post('/api/command',{pagerId:'page-a',command:{type:'sample',value:10}})).status,400);
  assert.equal((await post('/api/command',{pagerId:'page-a',command:{type:'shot'}})).status,400);
  assert.equal((await post('/api/command',{pagerId:'page-a',command:{type:'sample',value:200}})).status,200);
  assert.deepEqual((await (await post('/ingest',snapshot({seq:2}))).json()).commands,[{type:'sample',value:200}]);
  assert.deepEqual((await (await post('/ingest',snapshot({seq:3}))).json()).commands,[]);
 }finally{await server.close();}
});
test('production build with the devtools plugin configured contains no debug client, panel or React modules',async()=>{
 const { build }=await import('vite');
 const result=await build({configFile:'packages/devtools/test/fixture/vite.config.ts',logLevel:'silent',build:{write:false}});
 const outputs=Array.isArray(result)?result:[result];
 for(const output of outputs){
  assert.ok('output' in output);
  for(const file of output.output){
   const content=file.type==='chunk'?file.code:String(file.source);
   assert.doesNotMatch(content,/__anseronui_devtools|installBrowserDevtools|BrowserDevtoolsSession|devtools\.hostPatched/);
   if(file.type==='chunk')for(const id of Object.keys(file.modules)){
    assert.doesNotMatch(id,/packages\/devtools\/(src|ui)|node_modules\/react/);
   }
  }
 }
});
