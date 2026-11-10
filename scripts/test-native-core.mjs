import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
const executable = process.argv[2] ?? '.verification/core-native/probe';
const child = spawn(executable.endsWith('.mjs') ? process.execPath : executable, executable.endsWith('.mjs') ? ['--import','tsx',executable] : [], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
let sequence = 0, ack = 0, revision = 0;
const nodes = new Map();
const modules = [];
async function send(payload) {
  child.stdin.write(payload ? JSON.stringify({ protocolMajor: 1, protocolMinor: 0, bundleBuildId: 'anseronui-demo', runtimeEpoch: 1, surfaceId: 1, surfaceGeneration: 1, sequence: ++sequence, ackSequence: ack, payload }) + '\n' : '\n');
  const line = await lines.next();
  assert(!line.done, 'Native Core terminated before responding');
  const outputs = JSON.parse(line.value);
  if (process.env.ANSERONUI_TRACE) console.error(line.value);
  for (const envelope of outputs) {
    assert.equal(envelope.sequence, ++ack);
    const p = envelope.payload;
    assert.notEqual(p.type, 'Diagnostic', JSON.stringify(p));
    if (p.type === 'Commit') {
      revision = p.revision;
      for (const c of p.commands) {
        if (c.type === 'CreateNode') nodes.set(c.nodeId, {kind:c.kind});
        if (c.type === 'RemoveNode') {
          const remove = id => { for (const [child, props] of nodes) if (props.parent === id) remove(child); nodes.delete(id); };
          remove(c.nodeId);
        }
        if (c.type === 'SetProps') Object.assign(nodes.get(c.nodeId), c.props);
        if (c.type === 'SetFrame') { assert(Object.values(c.frame).every(value => typeof value === 'number' && Number.isFinite(value)), 'Non-finite frame: '+JSON.stringify(c)); nodes.get(c.nodeId).frame = c.frame; }
        if (c.type === 'InsertChild' || c.type === 'MoveChild') nodes.get(c.nodeId).parent = c.parentId;
      }
    }
    if (p.type === 'InvokeModule') modules.push(p);
  }
  return outputs.map(e => e.payload);
}
async function settle(outputs) {
  const queue = [...outputs];
  for(let rounds=0; rounds<1000; rounds++) {
    const p=queue.shift();
    if (!p) {
      const more=await send();
      if (!more.length) return;
      queue.push(...more); continue;
    }
    if(p.type==='InvokeModule' && p.module==='router' && p.method==='getParams') {
      const index = modules.indexOf(p); if (index >= 0) modules.splice(index, 1);
      queue.push(...await send({ type: 'ModuleResult', requestId: p.requestId, ok: true, value: JSON.stringify({ source: 'host', message: '原生参数' }) }));
    }
    if(p.type==='MeasureRequest') queue.push(...await send({type:'MeasureResult',requestId:p.requestId,nodeId:p.nodeId,width:Math.min(p.maxWidth,Math.ceil(p.text.length*p.fontSize*0.6+16)),height:p.fontSize*1.3+12,baseline:p.fontSize}));
    if(p.type==='Commit') queue.push(...await send({type:'CommitAck',revision:p.revision}));
  }
  throw new Error('Core did not settle');
}
const requiredNodes = ['View','Text','RichText','Button','TextInput','ScrollView','Image','Video'];
const handshake = await send({type:'Handshake',requiredNodes});
assert.deepEqual(handshake.find(p => p.type === 'Ready')?.supportedNodes.slice().sort(), [...requiredNodes, "Native"].sort());
await settle(handshake);
const page=process.argv[3] ?? 'counter';
await settle(await send({type:'CreateSurface',page,width:390,height:844}));
function node(field,value) { const match=[...nodes].find(([,props])=>props[field]===value); assert(match,`Missing ${field}=${value}; ${JSON.stringify([...nodes])}`);return match[0]; }
if (page==='counter') {
  node('text','Count: 0');
  await settle(await send({type:'Tap',nodeId:node('title','+1'),revision}));
  node('text','Count: 1');
  node('text', '路由参数: ' + JSON.stringify({ source: 'host', message: '原生参数' }));
  await settle(await send({ type: 'Tap', nodeId: node('title', '打开 Async Form'), revision }));
  const navigation = modules.find(item => item.module === 'router' && item.method === 'push');
  assert(navigation, 'Missing route push');
  assert.deepEqual(JSON.parse(navigation.argument), { page: 'async-form', params: { source: 'counter', count: 1, message: '来自 Counter 的参数', options: { editable: true }, tags: ['路由', '示例'] } });
} else if (page === 'extensions') {
  const byID = id => node('testID', id);
  const scroll = [...nodes].find(([,props]) => props.testID === 'extensions-scroll');
  const content = [...nodes].find(([,props]) => props.parent === scroll[0]);
  assert(content[1].frame.height > scroll[1].frame.height + 1000, 'System examples must extend scrollable content');
  assert(nodes.get(byID('native-info')).frame.height > 20, 'System example buttons retain usable height');
  const native = byID('extension-switch');
  assert.equal(nodes.get(native).kind, 'Native');
  assert.deepEqual(JSON.parse(nodes.get(native).nativeProps), {value:false});
  await settle(await send({type:'Tap',nodeId:node('title','读取平台信息'),revision}));
  let call = modules.shift(); assert.equal(call.module,'device'); assert.equal(call.method,'info');
  assert.deepEqual(JSON.parse(call.argument),{source:'tsx'});
  await settle(await send({type:'ModuleResult',requestId:call.requestId,ok:true,value:'{"platform":"Native test"}'}));
  node('text','平台: Native test');
  await settle(await send({type:'NativeEvent',nodeId:native,revision,event:'nativeComponent',value:'{"name":"change","data":{"value":true}}'}));
  node('text','开关: on');
  await settle(await send({type:'Tap',nodeId:node('title','更新原生属性'),revision}));
  assert.deepEqual(JSON.parse(nodes.get(native).nativeProps),{value:false});
  await settle(await send({type:'Tap',nodeId:node('title','调用原生方法'),revision}));
  call=modules.shift(); assert.equal(call.module,'__view'); assert.equal(call.method,'toggle'); assert.equal(JSON.parse(call.argument).nodeId,native);
  await settle(await send({type:'ModuleResult',requestId:call.requestId,ok:true,value:'{"value":true}'}));
  node('text','状态: ref toggle');
  await settle(await send({type:'Tap',nodeId:node('title','组件 ref 聚焦'),revision}));
  call=modules.shift(); assert.equal(call.method,'focus'); assert.equal(JSON.parse(call.argument).nodeId,byID('extension-input'));
  await settle(await send({type:'ModuleResult',requestId:call.requestId,ok:true,value:'null'}));
  node('text','状态: component focus');
  await settle(await send({type:'Tap',nodeId:node('title','卸载原生组件'),revision}));
  assert(!nodes.has(native));
  await settle(await send({type:'Tap',nodeId:node('title','检查卸载 ref'),revision}));
  node('text','状态: ref cleared / stale rejected');
  // Exercise the typed service facade through real compiled AOT/Wasm code.
  await settle(await send({type:'Tap',nodeId:byID('native-storage'),revision}));
  call=modules.shift(); assert.equal(call.module,'capabilities'); assert.equal(JSON.parse(call.argument).module,'storage');
  await settle(await send({type:'ModuleResult',requestId:call.requestId,ok:true,value:'true'}));
  call=modules.shift(); assert.equal(call.module,'storage'); assert.equal(call.method,'set'); assert.equal(JSON.parse(call.argument).namespace,'showcase');
  await settle(await send({type:'ModuleResult',requestId:call.requestId,ok:true,value:'null'}));
  call=modules.shift(); assert.equal(call.method,'get');
  await settle(await send({type:'ModuleResult',requestId:call.requestId,ok:true,value:JSON.stringify('AOT storage verified')}));
  assert(nodes.get(byID('native-status')).text.includes('AOT storage verified'));
  await settle(await send({type:'Tap',nodeId:byID('native-info'),revision}));
  call=modules.shift(); assert.equal(call.module,'capabilities');
  await settle(await send({type:'ModuleResult',requestId:call.requestId,ok:true,value:'true'}));
  for (const [module,value] of [['app',{name:'demo',version:'1',build:'1',applicationId:'test'}],['device',{platform:'test',version:'1',model:'test'}],['locale',{language:'zh',timezone:'Asia/Shanghai'}]]) {
    call=modules.shift(); assert.equal(call.module,module); assert.equal(call.method,'getInfo');
    await settle(await send({type:'ModuleResult',requestId:call.requestId,ok:true,value:JSON.stringify(value)}));
  }
  assert(nodes.get(byID('native-status')).text.includes('Asia/Shanghai'));
  await settle(await send({type:'Tap',nodeId:node('title','监听网络 / 窗口 / 主题 / 键盘 / 前后台 / 链接 / 传输'),revision}));
  for (let i=0;i<7;i++) {
    const index=modules.findIndex(item=>item.module==='capabilities'); assert(index>=0,'subscription capabilities '+JSON.stringify(modules));
    call=modules.splice(index,1)[0];
    await settle(await send({type:'ModuleResult',requestId:call.requestId,ok:true,value:JSON.parse(call.argument).module==='network'?'true':'false'}));
  }
  call=modules.shift(); assert.equal(call.module,'events'); assert.equal(call.method,'next');
  await settle(await send({type:'ModuleResult',requestId:call.requestId,ok:true,value:'{"connected":true,"type":"wifi"}'}));
  assert(nodes.get(byID('native-events')).text.includes('network'), 'compiled subscription callback: '+nodes.get(byID('native-events')).text);
  call=modules.shift(); assert.equal(call.module,'events'); assert.equal(call.method,'next');
  await settle(await send({type:'ModuleResult',requestId:call.requestId,ok:true,value:'{"connected":false,"type":"none"}'}));
  assert(nodes.get(byID('native-events')).text.includes('false'), 'compiled subscription receives subsequent events');
  await settle(await send({type:'Tap',nodeId:node('title','停止环境监听'),revision}));
  node('text','已停止监听'); modules.length=0;


} else if (page === 'components') {
  assert.deepEqual([...new Set([...nodes.values()].map(props => props.kind))].sort(), requiredNodes.slice().sort());
  const byID = id => node('testID', id);
  const scrollFrame = nodes.get(byID('component-scroll')).frame;
  assert.equal(scrollFrame.y, 112);
  assert.equal(scrollFrame.height, 844 - 112, 'Scroll viewport must fit the surface');
  assert(nodes.get(byID('scroll-footer')).frame.y > scrollFrame.height, 'Content must extend beyond the viewport');
  await settle(await send({type:'Tap',nodeId:byID('component-increment'),revision}));
  node('text','点击: 1');
  await settle(await send({type:'InputChange',nodeId:byID('component-input'),revision,value:'native showcase',inputRevision:1}));
  node('text','输入: native showcase');
  await settle(await send({type:'NativeEvent',nodeId:byID('component-rich'),revision,event:'spanClick',value:'3'}));
  node('text','事件: rich span 3');
  const touch = {x:10,y:10,pageX:10,pageY:10,pointerId:1,touches:[]};
  const targetId = [...nodes].find(([, props]) => props.parent === byID('touch-pad'))[0];
  await settle(await send({type:'NativeEvent',nodeId:byID('touch-pad'),targetId,revision,event:'touchMove',...touch}));
  node('text','移动事件: 1');
  node('text','捕获收到移动: 1');
  node('text','外层收到移动: 0');
  await settle(await send({type:'Tap',nodeId:node('title','允许事件冒泡'),revision}));
  node('title','阻止事件冒泡');
  await settle(await send({type:'NativeEvent',nodeId:byID('touch-pad'),targetId,revision,event:'touchMove',...touch}));
  node('text','移动事件: 2');
  node('text','捕获收到移动: 2');
  node('text','外层收到移动: 1');
  await settle(await send({type:'NativeEvent',nodeId:byID('component-image'),revision,event:'loadSuccess',source:'asset://showcase.png'}));
  node('text','Image: loaded');
  await settle(await send({type:'Tap',nodeId:byID('video-play'),revision}));
  assert.equal(nodes.get(byID('component-video')).playControl, 'play');
  await settle(await send({type:'NativeEvent',nodeId:byID('component-video'),revision,event:'playStateDidChanged',state:'playing'}));
  node('text','Video: playing');
  // Drag a fixed overlay using root coordinates, including a descendant hit target.
  const ball = byID('floating-ball');
  const ballLabel = byID('floating-ball-label');
  const before = {...nodes.get(ball).frame};
  const ballEvent = (event, pageX, pageY, pointerId=41) => ({type:'NativeEvent',nodeId:ball,targetId:ballLabel,revision,event,
    x:28,y:28,pageX,pageY,pointerId,touches:[]});
  await settle(await send(ballEvent('touchDown',before.x+28,before.y+28)));
  await settle(await send(ballEvent('touchMove',before.x-22,before.y+118)));
  assert.equal(nodes.get(ball).frame.x,before.x-50);
  assert.equal(nodes.get(ball).frame.y,before.y+90);
  await settle(await send(ballEvent('touchMove',1000,1000,42))); // other fingers do not steal the drag
  assert.equal(nodes.get(ball).frame.x,before.x-50);
  await settle(await send(ballEvent('touchMove',1000,1000)));
  assert.equal(nodes.get(ball).frame.x,390-56-8);
  assert.equal(nodes.get(ball).frame.y,844-56-8);
  await settle(await send(ballEvent('touchCancel',1000,1000)));
  assert.equal(nodes.get(ballLabel).text,'拖动');
  await settle(await send(ballEvent('touchMove',0,0)));
  assert.equal(nodes.get(ball).frame.x,326,'Cancelled gesture must not move the ball');
  await settle(await send({type:'Resize',width:320,height:600}));
  assert.equal(nodes.get(ball).frame.x,256); assert.equal(nodes.get(ball).frame.y,536);
  await settle(await send({type:'Resize',width:390,height:844}));
  const burstStart = {...nodes.get(ball).frame};
  const burst = await send(ballEvent('touchDown',burstStart.x+28,burstStart.y+28));
  for(let i=1;i<=5;i++) burst.push(...await send(ballEvent('touchMove',burstStart.x+28-i*10,burstStart.y+28-i*10)));
  burst.push(...await send(ballEvent('touchUp',burstStart.x-22,burstStart.y-22)));
  await settle(burst);
  assert.equal(nodes.get(ball).frame.x,burstStart.x-50,'Queued moves retain their coordinates');
  assert.equal(nodes.get(ball).frame.y,burstStart.y-50);
  assert.equal(nodes.get(ballLabel).text,'拖动');
  await settle(await send({type:'Tap',nodeId:byID('layout-mode-toggle'),revision}));
  const frameOf = id => nodes.get(byID(id)).frame;
  const near = (actual,expected) => assert(Math.abs(actual-expected)<0.02, `${actual} != ${expected}`);
  function verifyLayout(width) {
    assert.equal(frameOf('layout-between').width,width);
    for(const [id,x] of [['a',10],['b',(width-40)/2],['c',width-50]]) {
      near(frameOf('layout-between-'+id).x,x); near(frameOf('layout-between-'+id).y,12);
    }
    near(frameOf('layout-column-a').x,(width-70)/2); near(frameOf('layout-column-b').y,46);
    near(frameOf('layout-grow-a').width,(width-28)/3); near(frameOf('layout-grow-b').width,2*(width-28)/3);
    near(frameOf('layout-shrink-a').width,(width-28)/2); near(frameOf('layout-shrink-b').width,(width-28)/2);
    near(frameOf('layout-limits-a').width,80); near(frameOf('layout-limits-b').width,width-108);
    const cols=width===280?3:2;
    for(let i=0;i<6;i++) {
      near(frameOf('layout-wrap-'+(i+1)).x,10+(i%cols)*78);
      near(frameOf('layout-wrap-'+(i+1)).y,10+Math.floor(i/cols)*40);
    }
    near(frameOf('layout-wrap').height,20+(6/cols)*28+(6/cols-1)*12);
    near(frameOf('layout-align-start').y,10); near(frameOf('layout-align-center').y,36);
    near(frameOf('layout-align-end').y,62); near(frameOf('layout-align-stretch').height,76);
    near(frameOf('layout-spacing-child').x,20); near(frameOf('layout-spacing-child').y,16);
    near(frameOf('layout-flow').x,10); near(frameOf('layout-flow').y,10);
    near(frameOf('layout-pin').x,width-64); near(frameOf('layout-pin').y,8);
    near(frameOf('layout-stretch-pin').width,width-20); near(frameOf('layout-stretch-pin').y,64);
    near(frameOf('layout-after-hidden').x,116);
  }
  verifyLayout(280);
  await settle(await send({type:'Tap',nodeId:byID('layout-width-toggle'),revision}));
  verifyLayout(220);
  assert.equal(byID('floating-ball'),ball,'Switching sections must preserve the overlay');
  await settle(await send({type:'Tap',nodeId:byID('animation-mode-toggle'),revision}));
  const animated = byID('animation-layout-box');
  assert.deepEqual(JSON.parse(nodes.get(animated).animation),{duration:900,easing:'easeInOut'});
  assert.equal(nodes.get(animated).frame.width,70);
  await settle(await send({type:'Tap',nodeId:byID('animation-layout-toggle'),revision}));
  assert.equal(nodes.get(animated).frame.width,140);
  assert.equal(nodes.get(animated).opacity,0.65);
  await settle(await send({type:'Tap',nodeId:byID('animation-sequence'),revision}));
  let animationCall=modules.shift(); assert.equal(animationCall.method,'animate');
  assert.equal(JSON.parse(animationCall.argument).nodeId,byID('animation-ref-box'));
  assert.equal(JSON.parse(animationCall.argument).args.style.translateX,150);
  await settle(await send({type:'ModuleResult',requestId:animationCall.requestId,ok:true,value:'{"finished":true}'}));
  animationCall=modules.shift(); assert.equal(animationCall.method,'animate');
  assert.equal(JSON.parse(animationCall.argument).args.options.easing,'spring');
  await settle(await send({type:'ModuleResult',requestId:animationCall.requestId,ok:true,value:'{"finished":true}'}));
  node('text','串行动画完成');
  await settle(await send({type:'Tap',nodeId:byID('animation-repeat-toggle'),revision}));
  assert.equal(JSON.parse(nodes.get(byID('animation-repeat-box')).animation).iterations,-1);
  await settle(await send({type:'Tap',nodeId:byID('animation-sequence'),revision}));
  animationCall=modules.shift();
  await settle(await send({type:'ModuleResult',requestId:animationCall.requestId,ok:true,value:'{"finished":false}'}));
  node('text','已取消'); assert.equal(modules.length,0,'Cancelled sequence must not start the next leg');

} else if (page === 'timers') {
  node('text','计时次数: 0');
  await settle(await send({type:'Tap',nodeId:node('testID','timer-start'),revision}));
  node('text','状态: 等待中');
  let request=modules.shift(); assert.equal(request.module,'timer'); assert.equal(request.argument,'1000');
  await settle(await send({type:'ModuleResult',requestId:request.requestId,ok:true,value:''}));
  node('text','计时次数: 1'); node('text','状态: 已触发');
  await settle(await send({type:'Tap',nodeId:node('testID','timer-start'),revision}));
  request=modules.shift();
  const cancelled=await send({type:'Tap',nodeId:node('testID','timer-cancel'),revision});
  assert(cancelled.some(p=>p.type==='CancelRequest' && p.requestId===request.requestId));
  await settle(cancelled);
  await settle(await send({type:'ModuleResult',requestId:request.requestId,ok:true,value:''}));
  node('text','计时次数: 1'); node('text','状态: 已取消');
  await settle(await send({type:'Tap',nodeId:node('testID','timer-await'),revision}));
  request=modules.shift(); assert.equal(request.argument,'20');
  await settle(await send({type:'ModuleResult',requestId:request.requestId,ok:true,value:''}));
  node('text','计时次数: 2'); node('text','状态: 异步后触发');
  await settle(await send({type:'Tap',nodeId:node('testID','timer-start'),revision}));
  request=modules.shift();
  const destroyed=await send({type:'DestroySurface'});
  assert(destroyed.some(p=>p.type==='CancelRequest' && p.requestId===request.requestId));
  await settle(destroyed);
} else {
  const input=node('placeholder','Task name');
  const updates=[];
  for(let i=1;i<='native task'.length;i++) updates.push(...await send({type:'InputChange',nodeId:input,revision,value:'native task'.slice(0,i),inputRevision:i}));
  // A tap can arrive while text measurement and input commits are still pending.
  updates.push(...await send({type:'Tap',nodeId:node('title','Add task'),revision}));
  await settle(updates);
  node('text','native task');
  await settle(await send({type:'Tap',nodeId:node('title','Wait'),revision}));
  node('text','Status: waiting');
  const timer=modules.shift(); assert.equal(timer.module,'timer');
  await settle(await send({type:'ModuleResult',requestId:timer.requestId,ok:true,value:''}));
  node('text','Status: done');
  await settle(await send({type:'Tap',nodeId:node('title','Load message'),revision}));
  const http=modules.shift(); assert.equal(http.module,'http');
  await settle(await send({type:'ModuleResult',requestId:http.requestId,ok:true,value:'native HTTP'}));
  node('text','Status: native HTTP');
  // Dispose while an async handler is suspended: cancellation must unwind it.
  await settle(await send({type:'Tap',nodeId:node('title','Wait'),revision}));
}
await settle(await send({type:'DestroySurface'}));
child.stdin.end();
const result=await new Promise(resolve=>child.on('exit',(code,signal)=>resolve({code,signal})));
assert.equal(result.code,0,JSON.stringify(result));
console.log(`Native Core ${page}: handshake, layout, events, ACK, modules and disposal passed`);
