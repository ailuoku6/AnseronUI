import { BrowserHost } from '@anseronui/render-web';
import { inspectNodes, safeValue, type InspectableHost } from './inspect.js';
import type { DevtoolsLog, DevtoolsNativeCall, DevtoolsNetwork, DevtoolsSnapshot } from './protocol.js';
import { SnapshotAssembler } from './chunks.js';
type ClientOptions = {endpoint?: string; pagerId?: string; intervalMs?: number; page?: string};
const sessions = new WeakMap<object,BrowserDevtoolsSession>();
const logs: DevtoolsLog[] = [];
const network: DevtoolsNetwork[] = [];
let sequence=0;
let transport: typeof fetch;
let installed=false;
const LIMIT=2000, BODY_LIMIT=64*1024;
function keep<T>(buffer:T[],value:T) {buffer.push(value);if(buffer.length>LIMIT)buffer.splice(0,buffer.length-LIMIT);}
const internal = (url:string)=>url.includes('/__anseronui_devtools');
const headers = (value?: HeadersInit)=>Object.fromEntries(new Headers(value).entries());
async function responseText(response:Response):Promise<string> {
  if (!/json|text|xml|javascript|urlencoded/.test(response.headers.get('content-type')??'')) return '[Binary body]';
  const reader=response.body?.getReader(); if(!reader)return '';
  const decoder=new TextDecoder();let result='',size=0;
  try { while(size<BODY_LIMIT){const chunk=await reader.read();if(chunk.done)return result+decoder.decode();const remaining=BODY_LIMIT-size;size+=chunk.value.length;result+=decoder.decode(chunk.value.subarray(0,remaining),{stream:true});} void reader.cancel().catch(()=>{});return result+'\n[Truncated at 64 KiB]'; }
  finally {reader.releaseLock();}
}
function patchGlobals() {
  if(installed)return;installed=true;transport=globalThis.fetch.bind(globalThis);
  for(const level of ['log','info','debug','warn','error'] as const) {
    const original=console[level].bind(console);
    console[level]=(...args:unknown[])=>{keep(logs,{seq:++sequence,level,tag:level,args:args.map(safeValue),ts:Date.now()});original(...args);};
  }
  globalThis.fetch=(input,init)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    if(internal(url))return transport(input,init);
    const started=performance.now();
    const record:DevtoolsNetwork={id:'fetch-'+(++sequence),url:new URL(url,location.href).href,method:init?.method??(input instanceof Request?input.method:'GET'),ts:Date.now(),transport:'fetch'};
    try {record.requestHeaders=headers(init?.headers??(input instanceof Request?input.headers:undefined));
      if(typeof init?.body==='string')record.requestBody=init.body.slice(0,BODY_LIMIT);
      else if(init?.body instanceof URLSearchParams)record.requestBody=init.body.toString().slice(0,BODY_LIMIT);
      else if(input instanceof Request && !['GET','HEAD'].includes(input.method)) void responseText(new Response(input.clone().body,{headers:input.headers})).then(t=>record.requestBody=t).catch(()=>{});
    } catch { /* Inspection must not prevent the original request. */ }
    keep(network,record);
    return transport(input,init).then(response=>{
      Object.assign(record,{status:response.status,ok:response.ok,durationMs:Math.round(performance.now()-started),responseHeaders:headers(response.headers)});
      try {void responseText(response.clone()).then(text=>record.responseBody=text).catch(()=>{});} catch {}
      return response;
    },error=>{Object.assign(record,{error:String(error),ok:false,durationMs:Math.round(performance.now()-started)});throw error;});
  };
  // XHR has a separate path from fetch (including libraries such as axios).
  const xhrRecords=new WeakMap<XMLHttpRequest,DevtoolsNetwork>();
  const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send,setHeader=XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open=function(this: XMLHttpRequest,method:string,url:string|URL,...rest:unknown[]) {
    if(!internal(String(url)))xhrRecords.set(this,{id:'xhr-'+(++sequence),url:new URL(String(url),location.href).href,method,ts:Date.now(),transport:'XMLHttpRequest',requestHeaders:{}});
    else xhrRecords.delete(this);
    return Reflect.apply(open,this,[method,url,...rest]);
  } as typeof open;
  XMLHttpRequest.prototype.setRequestHeader=function(name,value) { const r=xhrRecords.get(this);if(r)r.requestHeaders![name]=value;return setHeader.call(this,name,value); };
  XMLHttpRequest.prototype.send=function(body) {
    const r=xhrRecords.get(this);if(!r)return send.call(this,body);
    const started=performance.now();r.ts=Date.now();if(typeof body==='string')r.requestBody=body.slice(0,BODY_LIMIT);keep(network,r);
    const done=()=>{Object.assign(r,{status:this.status,ok:this.status>=200&&this.status<400,durationMs:Math.round(performance.now()-started)});
      try {r.responseBody=(this.responseType==='json'?JSON.stringify(this.response):this.responseText).slice(0,BODY_LIMIT);r.responseHeaders=Object.fromEntries(this.getAllResponseHeaders().trim().split(/[\r\n]+/).filter(Boolean).map(line=>{const i=line.indexOf(':');return [line.slice(0,i),line.slice(i+1).trim()];}));}catch{} };
    this.addEventListener('loadend',done,{once:true});
    try{return send.call(this,body);}catch(error){this.removeEventListener('loadend',done);Object.assign(r,{error:String(error),ok:false,durationMs:Math.round(performance.now()-started)});throw error;}
  };
}
export class BrowserDevtoolsSession {
  readonly pagerId:string;
  private timer?:number;
  private disposed=false;
  private inFlight=false;
  private seq=0;
  private interval:number;
  private logStart=sequence;
  private componentIds=new Map<string,number>();
  private native:DevtoolsNativeCall[]=[];
  private pending=new Map<number,DevtoolsNativeCall>();
  private assembler=new SnapshotAssembler();
  private coreSnapshot?:DevtoolsSnapshot;
  captureCore(argument:string):boolean {
    try {
      const request=JSON.parse(argument);
      if(!internal(request.url??''))return false;
      const snapshot=this.assembler.accept(JSON.parse(request.body));
      if(snapshot)this.coreSnapshot=snapshot;
      return true;
    }catch{return false;}
  }
  private unload=()=>this.dispose();
  constructor(private host:InspectableHost,private options:ClientOptions={}) {
    patchGlobals(); this.pagerId=options.pagerId??'web-'+crypto.randomUUID();this.interval=Math.max(100,options.intervalMs??1000);
    window.addEventListener('pagehide',this.unload);
  }
  start(){void this.flush();this.timer=window.setInterval(()=>void this.flush(),this.interval);}
  capture(payload: {type:string;requestId?:number;module?:string;method?:string;argument?:string;ok?:boolean;value?:string}) {
    if(payload.type==='InvokeModule' && payload.module!=='http') {
      const r:DevtoolsNativeCall={id:this.pagerId+':'+payload.requestId,module:payload.module??'',method:payload.method??'',args:payload.argument,ts:Date.now()};
      this.pending.set(payload.requestId!,r);keep(this.native,r);
    } else if(payload.type==='ModuleResult' || payload.type==='CancelRequest') {
      const r=this.pending.get(payload.requestId!);if(!r)return;
      r.durationMs=Date.now()-r.ts;if(payload.ok)r.result=payload.value;else r.error=payload.value??'Cancelled';this.pending.delete(payload.requestId!);
    }
  }
  private endpoint(){return this.options.endpoint??location.origin+'/__anseronui_devtools/ingest';}
  private async flush() {
    if(this.disposed||this.inFlight)return;this.inFlight=true;
    try {
      const root=this.host.renderer.root;
      const snapshot:DevtoolsSnapshot={protocol:1,type:'snapshot',pagerId:this.pagerId,page:this.options.page,platform:'web',seq:++this.seq,ts:Date.now(),sampleMs:this.interval,capabilities:['full','sample'],
        device:{platform:'Web',density:devicePixelRatio,pageWidth:root.clientWidth,pageHeight:root.clientHeight},
        nodes:this.coreSnapshot?.nodes??inspectNodes(this.host,this.componentIds),logs:logs.filter(l=>l.seq>this.logStart),network:network.filter(n=>n.ts>=this.started),native:this.native,
        stats:{...this.host.runtime.getStats?.(),...this.host.getPerformanceStats?.()}};
      const response=await transport(this.endpoint(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(snapshot),signal:AbortSignal.timeout(5000)});
      if(!response.ok)return;
      const {commands=[]}=await response.json();
      if (this.disposed) return;
      for(const command of commands) {
        if(command.type==='sample'&&Number.isInteger(command.value)&&command.value>=100&&command.value<=5000){this.interval=command.value;window.clearInterval(this.timer);this.timer=window.setInterval(()=>void this.flush(),this.interval);}
        if(command.type==='full')window.setTimeout(()=>void this.flush(),0);
      }
    }catch{/* Reconnect automatically on the next sample. */}finally{this.inFlight=false;}
  }
  private started=Date.now();
  dispose(){if(this.disposed)return;this.disposed=true;window.clearInterval(this.timer);window.removeEventListener('pagehide',this.unload);
    void transport(this.endpoint(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocol:1,type:'snapshot',pagerId:this.pagerId,ts:Date.now(),seq:++this.seq,destroyed:true}),keepalive:true}).catch(()=>{});}
}
export function installBrowserDevtools(options:ClientOptions={}) {
  patchGlobals();
  const prototype=BrowserHost.prototype as unknown as Record<string|symbol,any>;
  const key=Symbol.for('anseronui.devtools.hostPatched');if(prototype[key])return;prototype[key]=true;
  const mount=prototype.mount,destroy=prototype.destroy,handle=prototype.handle,send=prototype.send;
  prototype.mount=async function(this: InspectableHost,page:string,...args:unknown[]) {
    sessions.get(this)?.dispose();const session=new BrowserDevtoolsSession(this,{...options,page});sessions.set(this,session);
    try{const result=await mount.call(this,page,...args);session.start();return result;}catch(error){session.dispose();throw error;}
  };
  prototype.handle=function(payload:any){
    const session=sessions.get(this);
    // Wasm uses the same injected Core snapshot. Merge it into the browser host
    // session, retaining browser logs/network and avoiding a duplicate page.
    if(payload.type==='InvokeModule' && payload.module==='http' && session?.captureCore(payload.argument)){
      this.send({type:'ModuleResult',requestId:payload.requestId,ok:true,value:JSON.stringify({status:200,body:'{"commands":[]}'})});return;
    }
    session?.capture(payload);return handle.call(this,payload);
  };
  prototype.send=function(payload:any){sessions.get(this)?.capture(payload);return send.call(this,payload);};
  prototype.destroy=async function(...args:unknown[]){sessions.get(this)?.dispose();sessions.delete(this);return destroy.apply(this,args);};
}
export function attachDevtools(host:InspectableHost,options:ClientOptions={}) {sessions.get(host)?.dispose();const session=new BrowserDevtoolsSession(host,options);sessions.set(host,session);session.start();return session;}
