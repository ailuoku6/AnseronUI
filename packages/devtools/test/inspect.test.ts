import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startDevtoolsServer} from '../src/server.ts';
import {devtoolsCLI} from '../../../scripts/devtools-cli.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('CLI searches bounded summaries, filters before pagination, fetches full records, and confirms device edits', async () => {
  const service=await startDevtoolsServer({port:0});
  const server=`http://127.0.0.1:${service.port}`;
  const base=server+'/__anseronui_devtools';
  const post=async(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  let seq=0;
  const ingest=async(extra={})=>(await post('/ingest',{protocol:1,type:'snapshot',pagerId:'7',page:'home',ts:Date.now(),seq:++seq,capabilities:['full','sample','propSchemaV1','state','shot'],...extra})).json();
  try {
    await ingest({logs:Array.from({length:130},(_,seq)=>({seq,level:seq%2?'info':'warn',args:['timeout '+seq],ts:1})),network:[{id:'cb_42',url:'/api/search',method:'POST',status:500,requestBody:'secret body',responseBody:'timeout detail',ts:1}],native:[{id:'nc_1',module:'CalendarModule',method:'open',args:'args detail',result:'ok',ts:1}],nodes:[{id:42,parentId:0,tag:'SearchBar',props:{text:'hello'},rect:{x:0,y:0,width:20,height:20},children:[]}]});
    assert.equal((await devtoolsCLI('sessions',{server})).sessions[0].pagerId,'7');
    const logs=await devtoolsCLI('logs',{server,pager:'7',query:'timeout'});assert.equal(logs.items.length,50);assert.equal(logs.total,130);assert.equal(logs.hasMore,true);
    assert.equal((await devtoolsCLI('logs',{server,pager:'7',level:'warn',limit:'10',offset:'60'})).items.length,5);
    for(const subject of ['network','native','nodes']) assert.equal((await devtoolsCLI(subject,{server,pager:'7',query:subject==='network'?'/api/search':subject==='native'?'CalendarModule':'SearchBar',...(subject==='network'?{status:'500'}:{})})).items.length,1);
    assert.equal((await devtoolsCLI('network',{server,pager:'7'})).items[0].responseBody,undefined);
    for(const [subject,id,field,value] of [['network-detail','cb_42','responseBody','timeout detail'],['native-detail','nc_1','args','args detail'],['log-detail','42','seq',42],['node-detail','42','tag','SearchBar']]) assert.equal((await devtoolsCLI(subject,{server,pager:'7',id})).item[field],value);
    const cli=promisify(execFile);
    const pendingCLI=cli(process.execPath,['scripts/anseronui.mjs','inspect','edit','--server',server,'--pager','7','--id','-3','--target','s','--key','state[0]','--value','-1']);
    let cliCommands:any[]=[];
    for(let i=0;i<100&&!cliCommands.length;i++){cliCommands=(await ingest()).commands;await new Promise(r=>setTimeout(r,5));}
    assert.equal(cliCommands[0]?.id,-3);assert.equal(cliCommands[0]?.value,-1);
    await ingest({commandResults:[{requestId:cliCommands[0].requestId,ok:true,id:-3,value:-1}]});
    assert.equal(JSON.parse((await pendingCLI).stdout).value,-1);
    await assert.rejects(devtoolsCLI('logs',{server,pager:'7',limit:'201'}),/INVALID_PAGINATION/);
    await assert.rejects(devtoolsCLI('nodes',{server,pager:'missing'}),/PAGE_OFFLINE/);
    const pending=devtoolsCLI('edit',{server,pager:'7',id:'42',key:'text',value:'"changed"'});
    let commands:any[]=[];
    // Await an actual queued command; no assumption about fetch scheduling.
    for(let i=0;i<50&&!commands.length;i++) { commands=(await ingest()).commands; await new Promise(r=>setTimeout(r,5)); }
    assert.equal(commands.length,1);assert.equal(commands[0].value,'changed');assert.ok(commands[0].requestId);
    await ingest({commandResults:[{requestId:commands[0].requestId,ok:true,id:42,value:'changed'}]});
    assert.equal((await pending).value,'changed');
    await assert.rejects(devtoolsCLI('edit',{server,pager:'7',id:'42',key:'onClick',value:'"bad"'}),/READ_ONLY_FIELD/);
    const session=service.hub.sessions.get('7')!;
    session.commands.push({type:'set',expiresAt:Date.now()-1});assert.deepEqual((await ingest()).commands,[]);
    const busy=assert.rejects(devtoolsCLI('props',{server,pager:'7',id:'42'}),/PAGE_OFFLINE/);
    for(let i=0;i<50&&!session.commands.length;i++)await new Promise(r=>setTimeout(r,5));
    await ingest({destroyed:true});await busy;
  } finally {await service.close();}
});
