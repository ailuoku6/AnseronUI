/** Real AOT hard gate. Build a separate fixture configuration with:
 * node scripts/build-core.mjs native internal/fixtures/fine-grained/config.json
 * node --import tsx scripts/test-fine-grained-aot.mjs native
 * Repeat with wasm. The renderer/measurement transport here is synthetic. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { arch, platform, release, cpus } from 'node:os';
const mode = process.argv[2] ?? 'native';
assert(['native','wasm'].includes(mode));
const child = spawn(mode === 'native' ? '.verification/core-native/probe' : process.execPath, mode === 'wasm' ? ['--import','tsx','packages/core/native/test/wasm-stdio.mjs'] : [], {stdio:['pipe','pipe','inherit']});
const lines = createInterface({input:child.stdout})[Symbol.asyncIterator]();
let generation=1, sequence=0, ack=0, revision=0;
let stats={}, commands=[], nodes=new Map(), bytes=0;
const send = async payload => {
  child.stdin.write((payload ? JSON.stringify({protocolMajor:2,protocolMinor:0,bundleBuildId:'fine-aot',runtimeEpoch:1,surfaceId:1,surfaceGeneration:generation,sequence:++sequence,ackSequence:ack,payload}) : '')+'\n');
  const line=await lines.next(); assert(!line.done,'AOT fixture exited early');
  const messages=JSON.parse(line.value);
  return messages.map(message=>{validateEnvelope(message);assert.equal(message.sequence,++ack); bytes+=Buffer.byteLength(JSON.stringify(message)); return message.payload;});
};
// Runtime transport limits are enforced by the shared protocol assembler.
const { CommitAssembler, validateEnvelope } = await import('../packages/protocol/src/index.ts');
let assembler=new CommitAssembler();
async function settle(payload) {
  const queue=await send(payload);
  for(let i=0;i<10000;i++) {
    const raw=queue.shift();
    if(!raw) {const more=await send(); if(!more.length)return; queue.push(...more); continue;}
    const p=assembler.accept(raw); if(!p)continue;
    assert.notEqual(p.type,'Diagnostic',JSON.stringify(p));
    if(p.type==='RuntimeStats')stats=p.values;
    if(p.type==='Commit') {
      revision=p.revision;commands.push(...p.commands);
      for(const c of p.commands) {
        if(c.type==='CreateNode')nodes.set(c.nodeId,{});
        if(c.type==='PatchProps')Object.assign(nodes.get(c.nodeId),c.set);
      }
      queue.push(...await send({type:'CommitAck',revision}));
    }
  }
  throw new Error('AOT fixture did not settle');
}
const report=[];
let templateReport;
try {
  for(const count of [100,1000,10000]) {
    const start=performance.now(); await settle({type:'CreateSurface',page:'fine-'+count,width:390,height:844});
    const coldMs=performance.now()-start;
    const target=[...nodes].find(([,p])=>p.testID==='fine-target')[0];
    for(let warm=0;warm<3;warm++)await settle({type:'Tap',nodeId:target,revision});
    const samples=[];let observed;let maxUpdateBytes=0;
    for(let i=0;i<12;i++) {
      await settle({type:'InspectRuntime',enabled:true,reset:true});commands=[];bytes=0;
      const started=performance.now();await settle({type:'Tap',nodeId:target,revision});samples.push(performance.now()-started);
      await settle({type:'InspectRuntime'});
      maxUpdateBytes=Math.max(maxUpdateBytes,bytes);
      assert(bytes<8192,'Leaf update traffic grew beyond the fixed message budget');
      assert(stats.coreRequestUnits<800,'Leaf update Core request grew beyond the fixed budget');
      assert.equal(commands.length,1); assert.equal(commands[0].type,'PatchProps'); assert.deepEqual(Object.keys(commands[0].set),['opacity']);
      assert.equal(stats.logicalEvaluations,1);assert.equal(stats.scopeVisits,2);assert.equal(stats.reconciledNodes,1);assert.equal(stats.coreSyncNodes,1);assert.equal(stats.layoutVisited,0);assert.equal(stats.commitLogEntries,4);
      observed={scopeVisits:stats.scopeVisits,coreSyncNodes:stats.coreSyncNodes,layoutVisited:stats.layoutVisited,ackEntries:stats.commitLogEntries,coreRequestUnits:stats.coreRequestUnits};
    }
    samples.sort((a,b)=>a-b);
    report.push({mountedBranches:count,coldMs,p50Ms:samples[6],p95Ms:samples[11],maxUpdateOutputBytes:maxUpdateBytes,...observed});
    await settle({type:'DestroySurface'}); generation++;sequence=0;ack=0;nodes.clear();assembler=new CommitAssembler();
  }
  await settle({type:'CreateSurface',page:'fine-template',width:390,height:844});
  assert.equal(nodes.size,1001);
  const target=[...nodes].find(([,p])=>p.testID==='fine-template-target')[0];
  for(let warm=0;warm<3;warm++)await settle({type:'Tap',nodeId:target,revision});
  for(let i=0;i<12;i++) {
    await settle({type:'InspectRuntime',enabled:true,reset:true}); commands=[];bytes=0;
    await settle({type:'Tap',nodeId:target,revision});
    await settle({type:'InspectRuntime'});
    assert.equal(stats.logicalEvaluations,1);
    assert.equal(stats.scopeVisits,2);
    assert.equal(stats.dynamicSlotsChecked,2);
    assert.equal(stats.reconciledNodes,1);
    assert.equal(stats.coreSyncNodes,1);
    assert.equal(stats.layoutVisited,0);
    assert.equal(commands.length,1);
    assert.equal(commands[0].type,'PatchProps');
    assert.deepEqual(Object.keys(commands[0].set),['opacity']);
    assert(bytes<8192);
    templateReport={mountedNodes:nodes.size,logicalEvaluations:stats.logicalEvaluations,
      scopeVisits:stats.scopeVisits,dynamicSlotsChecked:stats.dynamicSlotsChecked,
      reconciledNodes:stats.reconciledNodes,coreSyncNodes:stats.coreSyncNodes,
      layoutVisited:stats.layoutVisited,updateOutputBytes:bytes};
  }
  await settle({type:'DestroySurface'});
} finally { child.stdin.end(); }
const code=await new Promise(resolve=>child.once('exit',resolve));assert.equal(code,0);
mkdirSync('.verification/performance',{recursive:true});writeFileSync('.verification/performance/fine-'+mode+'.json',JSON.stringify({mode,renderer:'synthetic',host:{platform:platform(),arch:arch(),release:release(),cpu:cpus()[0]?.model,node:process.version},samplesPerSize:12,report,templateReport},null,2)+'\n');
console.log(JSON.stringify({mode,report,templateReport},null,2));
