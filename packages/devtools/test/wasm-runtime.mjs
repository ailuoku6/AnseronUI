// Run after npm run build:core:wasm. Exercises compiled AOT code, not JS private methods.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {WasmRuntime} from '../../render-web/src/wasm-runtime.ts';
import {SnapshotAssembler} from '../src/chunks.ts';
const manifest=JSON.parse(await readFile('.verification/core-wasm/manifest.json','utf8'));
assert.equal(manifest.devtools?.enabled,true,'build a Debug Wasm Core first');
const runtime=await WasmRuntime.load(new Uint8Array(await readFile('.verification/core-wasm/entry.wasm')),new Uint8Array(await readFile('.verification/core-wasm/framework.wasm')));
let sequence=0,ack=0,snapshot,pollTimer,captureFailed=false;
const commands=[],results=new Map(),assembler=new SnapshotAssembler(),committedProps=new Map();
const send=payload=>runtime.post({protocolMajor:1,protocolMinor:5,bundleBuildId:runtime.bundleBuildId,runtimeEpoch:runtime.runtimeEpoch,surfaceId:1,surfaceGeneration:1,sequence:++sequence,ackSequence:ack,payload});
async function settle() {
  for(let i=0;i<1000;i++) {
    await Promise.resolve();
    const messages=runtime.step();
    for(const message of messages) {
      ack=message.sequence;const p=message.payload;
      if(p.type==='Diagnostic') assert.fail(JSON.stringify(p));
      if(p.type==='Commit') {
        for(const c of p.commands)if(c.type==='SetProps')committedProps.set(c.nodeId,c.props);
        send({type:'CommitAck',revision:p.revision});
      }
      if(p.type==='MeasureRequest')send({type:'MeasureResult',requestId:p.requestId,nodeId:p.nodeId,width:Math.min(p.maxWidth,Math.max(1,p.text.length*p.fontSize*.6)),height:p.fontSize*1.3,baseline:p.fontSize});
      if(p.type==='InvokeModule'&&p.module==='http') {
        const packet=assembler.accept(JSON.parse(JSON.parse(p.argument).body));
        if(packet) {snapshot=packet;for(const r of packet.commandResults??[])results.set(r.requestId,r);}
        send({type:'ModuleResult',requestId:p.requestId,ok:true,value:JSON.stringify({status:200,body:JSON.stringify({commands:packet?commands.splice(0):[]})})});
      }
      if(p.type==='InvokeModule'&&p.module==='timer'&&Number(p.argument)===1000)pollTimer=p;
      // Commit timeout timers stay pending, as they would on a real host.
      if(p.type==='InvokeModule'&&p.module==='__devtools') {
        const args=JSON.parse(p.argument);
        send({type:'ModuleResult',requestId:p.requestId,ok:!captureFailed,value:captureFailed?'CAPTURE_FAILED':JSON.stringify({chunk:'data:image/png;base64,dGVzdA==',next:0,ox:0,oy:0,ow:320,oh:480})});
      }
    }
    if(!messages.length&&!runtime.hasPendingWork()) return;
  }
  throw new Error('Wasm did not settle');
}
async function command(c,ok=true) {
  const requestId='test-'+sequence;
  commands.push({...c,requestId,expiresAt:Date.now()+10000});
  assert.ok(pollTimer,'poll timer');const timer=pollTimer;pollTimer=undefined;
  send({type:'ModuleResult',requestId:timer.requestId,ok:true,value:''});await settle();
  if(!results.has(requestId)) {
    assert.ok(pollTimer,'result poll timer');const timer=pollTimer;pollTimer=undefined;
    send({type:'ModuleResult',requestId:timer.requestId,ok:true,value:''});await settle();
  }
  const result=results.get(requestId);assert.ok(result,'command acknowledged');assert.equal(result.ok,ok,JSON.stringify(result));return result;
}
try {
  send({type:'Handshake',requiredNodes:['View','Text']});await settle();
  send({type:'CreateSurface',page:'counter',width:320,height:480});await settle();
  assert.ok(snapshot?.nodes.length);assert.ok(snapshot.capabilities.includes('propSchemaV1'));
  const text=snapshot.nodes.find(n=>n.tag==='Text');assert.ok(text);
  const schema=await command({type:'inspectProps',id:text.id});assert.ok(schema.properties.some(p=>p.key==='text'));
  const edited=await command({type:'set',id:text.id,target:'p',key:'text',value:'Wasm remote edit',schemaToken:schema.schemaToken});
  assert.equal(edited.value,'Wasm remote edit');assert.equal(committedProps.get(text.id).text,'Wasm remote edit');
  const button=snapshot.nodes.find(n=>n.component==='Button');assert.ok(button);
  await command({type:'set',id:button.id,target:'p',key:'title',value:'AOT component edit'});
  assert.ok([...committedProps.values()].some(p=>p.text==='AOT component edit'),'rendered component receives edited props');
  const component=snapshot.nodes.find(n=>Object.keys(n.state??{}).includes('state[0]'));assert.ok(component);
  const state=await command({type:'set',id:component.id,target:'s',key:'state[0]',value:9});assert.equal(state.value,9);
  await command({type:'shot',id:0,sample:2});assert.equal(snapshot.screenshot.data,'data:image/png;base64,dGVzdA==');
  captureFailed=true;
  const failed=await command({type:'shot',id:0},false);assert.match(failed.error,/CAPTURE_FAILED/);assert.match(snapshot.screenshot.err,/CAPTURE_FAILED/);
  console.log('PASS: AOT Wasm snapshots, schema, committed host/component/state editing and screenshot success/failure');
  send({type:'DestroySurface'});await settle();
} finally {runtime.dispose();}
