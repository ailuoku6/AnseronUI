import { BrowserReferenceHost } from '@anseronui/render-web';
import { Button, Text, View, definePage, useServices, useState } from '@anseronui/ui';
function CounterCard() {
 const [count,setCount]=useState(0);
 return <View style={{flexDirection:'column',gap:8}}><Text>计数：{count}</Text><Button title="计数 +1" onClick={()=>{setCount(v=>v+1);console.info('counter increment',count+1);}} /></View>;
}
function DebugActions() {
 const services=useServices();const [result,setResult]=useState('等待操作');
 return <View style={{flexDirection:'column',gap:12}}>
 <Button title="生成四种级别日志" onClick={()=>{console.info('info: 页面加载完成');console.debug('debug: 组件更新');console.error('error: 测试错误');console.log('print: AnseronUI');}}/>
 <Button title="发送 HTTP POST" onClick={async()=>{const r=await services.http.request({url:'/api/echo',method:'POST',headers:{'Content-Type':'application/json','X-Test':'devtools'},body:JSON.stringify({message:'hello'})});setResult(JSON.stringify(r));}}/>
 <Button title="发送 XHR 请求" onClick={()=>{const xhr=new XMLHttpRequest();xhr.open('GET','/api/echo?xhr=1');xhr.onload=()=>setResult(xhr.responseText);xhr.send();}}/>
 <Button title="调用设备模块" onClick={async()=>{setResult(JSON.stringify(await services.device.getInfo()));}}/>
 <Text>{result}</Text></View>;
}
function CounterPage(){return <View style={{flexDirection:'column',padding:24,gap:16}}><Text style={{fontSize:22}}>Counter 调试页面</Text><CounterCard/><DebugActions/></View>;}
function NetworkPage(){return <View style={{flexDirection:'column',padding:24,gap:16}}><Text style={{fontSize:22}}>Network 调试页面</Text><DebugActions/></View>;}
const page=new URLSearchParams(location.search).get('page')==='network'?definePage('network',NetworkPage):definePage('counter',CounterPage);
const root=document.getElementById('app')!;const host=new BrowserReferenceHost(root,page);
void host.mount(page.name,root.clientWidth,root.clientHeight);
