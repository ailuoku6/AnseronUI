import test from 'node:test';
import assert from 'node:assert/strict';
import { loadETS } from './load-ets.mjs';
const flush = async () => { for(let i=0;i<16;i++) await Promise.resolve(); };
function fixture() {
  const events=[],players=[],opened=[],closed=[],builders=[]; let rawOpen=async path=>({fd:1,offset:0,length:100});
  class Player {
    state='idle'; duration=8000; callbacks=new Map(); released=false; seeks=[];
    on(name,fn){this.callbacks.set(name,fn);} emit(name,value){this.callbacks.get(name)?.(value);}
    transition(state){this.state=state;this.emit('stateChange',state);}
    set fdSrc(value){this.transition('initialized');} set url(value){this.transition('initialized');}
    async prepare(){this.transition('prepared');} async play(){this.transition('playing');}
    async pause(){this.transition('paused');} async release(){this.released=true;this.state='released';}
    seek(value){this.seeks.push(value);} setVolume(value){this.volume=value;} setPlaybackRate(value){this.rate=value;}
  }
  class Builder { constructor(){builders.push(this);} build(fn,state){this.state=state;} update(state){this.state=state;} getFrameNode(){return {};} dispose(){this.disposed=true;} }
  class Surface {}
  class State {constructor(id,surface){this.id=id;this.surface=surface;this.time=0;this.duration=0;}}
  const {HarmonyMedia}=loadETS('HarmonyMedia',{'@kit.ArkUI':{BuilderNode:Builder},'@kit.MediaKit':{media:{createAVPlayer:async()=>{const p=new Player();players.push(p);return p;},VideoScaleType:{VIDEO_SCALE_TYPE_FIT:0,VIDEO_SCALE_TYPE_FIT_CROP:1,VIDEO_SCALE_TYPE_SCALED_ASPECT:2}}},'@kit.AbilityKit':{},'@kit.BasicServicesKit':{},'./HarmonyVideoSurface':{SurfaceController:Surface,VideoState:State,videoBuilder(){}}},{wrapBuilder:fn=>fn});
  const context={resourceManager:{getRawFd:async path=>{opened.push(path);return rawOpen(path);},closeRawFd:async path=>closed.push(path)}};
  const media=new HarmonyMedia({getHostContext:()=>context},(node,event)=>events.push({node,...event}));
  media.create(1); const surface=builders[0].state.surface; surface.created('surface1');
  const update=props=>media.update(1,JSON.stringify({src:'asset://movie.mp4',controls:false,playControl:'play',...props}));
  return {media,events,players,opened,closed,builders,surface,update,setRawOpen:fn=>rawOpen=fn};
}
test('media emits actual first frame once and millisecond progress; pause/resume/stop obey latest intent',async()=>{
  const f=fixture();f.update({muted:true,rate:1.5});await flush();const p=f.players[0];
  assert.equal(p.state,'playing');assert.equal(p.volume,0);assert.equal(p.rate,1.5);
  assert.equal(f.events.filter(e=>e.event==='firstFrameDidDisplay').length,0);
  p.emit('startRenderFrame');p.emit('startRenderFrame');p.emit('timeUpdate',1250);
  assert.equal(f.events.filter(e=>e.event==='firstFrameDidDisplay').length,1);
  assert.equal(f.events.at(-1).x,1250);assert.equal(f.events.at(-1).duration,8000);
  f.media.visible(false);await flush();assert.equal(p.state,'paused');
  f.media.visible(true);await flush();assert.equal(p.state,'playing');
  f.update({playControl:'pause'});await flush();f.media.visible(false);f.media.visible(true);await flush();assert.equal(p.state,'paused');
  f.update({playControl:'stop'});await flush();assert.equal(p.seeks.at(-1),0);
  f.media.dispose();await flush();assert.equal(p.released,true);assert.deepEqual(f.closed,['assets/movie.mp4']);
  const count=f.events.length;p.emit('timeUpdate',3000);assert.equal(f.events.length,count);
});
test('paused media decodes a preview frame after prepare', async () => {
  const f = fixture(); f.update({ playControl: 'pause' }); await flush();
  assert.equal(f.players[0].seeks[0], 1);
  f.media.dispose(); await flush();
});
test('rapid source and surface changes serialize raw-file handles and discard stale callbacks',async()=>{
  const f=fixture();let resolveOpen;f.setRawOpen(()=>new Promise(resolve=>{resolveOpen=resolve;}));
  f.update({});await flush();assert.equal(f.opened.length,1);const stale=f.players[0];
  f.surface.removed();f.surface.created('surface2');f.update({src:'asset://second.mp4'});
  f.setRawOpen(async()=>({fd:2,offset:0,length:200}));resolveOpen({fd:1,offset:0,length:100});await flush();
  assert.deepEqual(f.opened,['assets/movie.mp4','assets/second.mp4']);assert.deepEqual(f.closed,['assets/movie.mp4']);
  assert.equal(f.players.at(-1).state,'playing');const count=f.events.length;stale.emit('error',{code:99});assert.equal(f.events.length,count);
  f.media.remove(1);await flush();assert.deepEqual(f.closed,['assets/movie.mp4','assets/second.mp4']);
});
test('disposal during raw-file acquisition closes the late descriptor without emitting errors',async()=>{
  const f=fixture();let resolveOpen;f.setRawOpen(()=>new Promise(resolve=>{resolveOpen=resolve;}));f.update({});await flush();
  f.media.dispose();resolveOpen({fd:1,offset:0,length:100});await flush();assert.equal(f.events.length,0);assert.deepEqual(f.closed,['assets/movie.mp4']);assert.equal(f.players[0].released,true);
});
test('visibility restored during asynchronous pause reconciles to the latest playing intent', async () => {
  const f=fixture();f.update({});await flush();const p=f.players[0];let finishPause;
  p.pause=()=>new Promise(resolve=>{finishPause=()=>{p.transition('paused');resolve();};});
  f.media.visible(false);f.media.visible(true);finishPause();await flush();assert.equal(p.state,'playing');
  f.media.dispose();await flush();
});
