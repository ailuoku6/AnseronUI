import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { debugBuildOptions, instrumentSource } from '../instrumentation/index.mjs';
import { SnapshotAssembler } from '../src/chunks.ts';
import { adaptSnapshot } from '../ui/src/adapter.ts';
import { buildRows } from '../ui/src/tree.ts';
import { lowerTSX } from '../../ui-compiler/src/index.ts';

test('all platform targets inject only Debug sources; Release overrides Debug and contains no inspector', () => {
  const source=readFileSync('packages/core/src/business-runtime.ts','utf8');
  for(const target of ['ios-simulator','android','macos-arm64','harmony','wasm']) {
    const automatic=debugBuildOptions(target,{});
    assert.equal(automatic.enabled,true,`Debug is automatic for ${target}`);
    const debug=debugBuildOptions(target,{ANSERONUI_DEBUG_BUILD:'1'});
    assert.equal(debug.enabled,true);
    assert.match(instrumentSource('packages/core/src/business-runtime.ts',source,debug),/devtoolsPoll/);
    const release=debugBuildOptions(target,{ANSERONUI_DEBUG_BUILD:'1',ANSERONUI_RELEASE_BUILD:'1'});
    assert.equal(release.enabled,false);
    assert.equal(instrumentSource('packages/core/src/business-runtime.ts',source,release),source);
    assert.equal(debugBuildOptions(target,{ANSERONUI_DEBUG_BUILD:'0'}).enabled,false);
  }
  const jsx='export const page = definePage("home", Home); function Home(){return <Card />}';
  assert.match(lowerTSX(jsx,'home.tsx',{devtools:true}).source,/undefined, "Card"/);
  assert.match(lowerTSX(jsx,'home.tsx',{devtools:true}).source,/"home", Home, "Home"/);
  assert.doesNotMatch(lowerTSX(jsx,'home.tsx').source,/"Card"|"Home"/);
});

test('snapshot chunks are atomic, tolerate retries/reordering, and reject identity mismatches',()=>{
  const assemble=new SnapshotAssembler();
  const s={protocol:1,type:'snapshot',pagerId:'a',seq:1,nodes:Array.from({length:1000},(_,id)=>({id}))};
  const data=JSON.stringify(s),middle=Math.floor(data.length/2);
  const part=(index:number,text:string)=>({protocol:1,type:'snapshotChunk',pagerId:'a',seq:1,index,count:2,data:text});
  assert.equal(assemble.accept(part(1,data.slice(middle))),undefined);
  assert.equal(assemble.accept(part(1,data.slice(middle))),undefined);
  assert.deepEqual(assemble.accept(part(0,data.slice(0,middle))),s);
  assert.throws(()=>assemble.accept({...part(0,'{}'),count:1}),/IDENTITY/);
  assert.throws(()=>assemble.accept({...part(0,''),count:513}),/INVALID/);
});

test('staged Core reports committed Page/component/host hierarchy, stable IDs and updated Hook state without native views',async()=>{
  const dir=mkdtempSync(resolve('.verification/devtools-inspection-'));
  try {
    mkdirSync(join(dir,'pages'));
    writeFileSync(join(dir,'pages/page.tsx'), `import {View,Text,Button,definePage,useState} from '@anseronui/ui';
function Card(){ const [count,setCount]=useState(0); return <View><Text testID="count">{count}</Text><Button testID="increment" title="increment" onClick={()=>{console.info('count changed',count+1);setCount(count+1)}} /></View>; }
function Home(){console.warn('page opened');return <View><Card /></View>;}
export const page=definePage('home',Home);`);
    const config=join(dir,'config.json');
    writeFileSync(config,JSON.stringify({buildId:'debug-test',sourceDirs:[relative(process.cwd(),join(dir,'pages'))],pages:[{name:'home',source:relative(process.cwd(),join(dir,'pages/page.tsx')),export:'page'}]}));
    const staged=spawnSync(process.execPath,['--import','tsx','scripts/stage-core.mjs',config,'business','native'],{encoding:'utf8',env:{...process.env,ANSERONUI_DEBUG_BUILD:'1',ANSERONUI_RELEASE_BUILD:'0'}});
    assert.equal(staged.status,0,staged.stderr);
    const base=resolve('.verification/source-native/business');
    const {ReferenceRuntime}=await import(pathToFileURL(join(base,'packages/core/src/runtime.ts')).href);
    const {page}=await import(pathToFileURL(join(base,relative(process.cwd(),join(dir,'pages/page.ts')))).href);
    const runtime=new ReferenceRuntime({bundleBuildId:'debug-test',pages:[page]});
    let sequence=0,ack=0,revision=0;
    const send=(payload:any)=>runtime.post({protocolMajor:1,protocolMinor:5,bundleBuildId:'debug-test',runtimeEpoch:1,surfaceId:1,surfaceGeneration:1,sequence:++sequence,ackSequence:ack,payload});
    const assembler=new SnapshotAssembler();let snapshot:any;let timer:any;
    const nativeNodes=new Set<number>();
    async function settle(){
      for(let i=0;i<100;i++){
        await Promise.resolve();
        for(const message of runtime.step()){
          ack=message.sequence;const p=message.payload;
          if(p.type==='Diagnostic')assert.fail(JSON.stringify(p));
          if(p.type==='Commit'){
            revision=p.revision;
            for(const c of p.commands){if(c.type==='CreateNode')nativeNodes.add(c.nodeId);if(c.type==='RemoveNode')nativeNodes.delete(c.nodeId);}
            send({type:'CommitAck',revision});
          }
          if(p.type==='MeasureRequest')send({type:'MeasureResult',requestId:p.requestId,nodeId:p.nodeId,width:40,height:20,baseline:16});
          if(p.type==='InvokeModule'&&p.module==='http'){
            const request=JSON.parse(p.argument);const result=assembler.accept(JSON.parse(request.body));if(result)snapshot=result;
            send({type:'ModuleResult',requestId:p.requestId,ok:true,value:JSON.stringify({status:200,body:'{"commands":[]}'})});
          }
          if(p.type==='InvokeModule'&&p.module==='timer')timer=p;
        }
      }
    }
    send({type:'CreateSurface',page:'home',width:320,height:480});await settle();
    assert.ok(snapshot);
    assert.equal(snapshot.stats.nodes,snapshot.nodes.length);
    assert.equal(snapshot.stats.hostNodes,nativeNodes.size);
    assert.equal(snapshot.stats.components,snapshot.nodes.filter((n:any)=>!!n.component).length);
    assert.equal(snapshot.nodes.filter((n:any)=>n.id>0).length,nativeNodes.size);
    assert.ok(snapshot.nodes.some((n:any)=>n.tag==='Page'));
    const card=snapshot.nodes.find((n:any)=>n.component==='Card');assert.ok(card);
    assert.equal(card.state['state[0]'],0);
    assert.ok(snapshot.logs.some((log:any)=>log.level==='warn'&&log.args.join(' ')==='page opened'));
    const home=snapshot.nodes.find((n:any)=>n.component==='Home');assert.ok(home);
    const rows=buildRows(new Map(adaptSnapshot(snapshot).nodes.map(n=>[n.id,n])),new Set(),'Card',true);
    assert.deepEqual(rows.filter(n=>n.node.cv).map(n=>n.node.n),['home','Home','Card']);
    const button=snapshot.nodes.find((n:any)=>n.id>0&&n.props.testID==='increment');assert.ok(button);
    send({type:'Tap',nodeId:button.id,revision});await settle();
    send({type:'ModuleResult',requestId:timer.requestId,ok:true,value:''});await settle();
    const next=snapshot.nodes.find((n:any)=>n.component==='Card');assert.equal(next.id,card.id);assert.equal(next.state['state[0]'],1);
    assert.ok(snapshot.logs.some((log:any)=>log.level==='info'&&log.args.join(' ')==='count changed 1'));
    send({type:'DestroySurface'});await settle();assert.equal((runtime as any).devtoolsSessions.size,0);
    assert.equal((runtime as any).devtoolsCalls.size,0);runtime.dispose();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
