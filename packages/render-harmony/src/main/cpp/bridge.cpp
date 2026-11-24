#include <napi/native_api.h>
#include <arkui/native_interface.h>
#include <arkui/native_node.h>
#include <arkui/native_node_napi.h>
#include <arkui/ui_input_event.h>
#include <arkui/native_gesture.h>
#include <arkui/native_interface_focus.h>
#include <hilog/log.h>
#include "anseronui_transport.h"
#include "extensions.h"
#include "touch_policy.h"
#include "input_queue.h"
#include "render_topology.h"
#include "scroll_anchor.h"
#include <atomic>
#include <condition_variable>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
#include <cmath>
#include <algorithm>
#include <chrono>

namespace anseronui {
std::map<std::string,ComponentFactory>& factories(){static std::map<std::string,ComponentFactory> value;return value;}
struct Provider {ModuleSupports supports;ModuleInvoke invoke;};
std::vector<Provider>& providers(){static std::vector<Provider> value;return value;}
void registerComponent(const std::string& name,ComponentFactory factory){if(name.empty()||factories().count(name))throw std::runtime_error("DUPLICATE_COMPONENT");factories().emplace(name,std::move(factory));}
void registerModule(ModuleSupports supports,ModuleInvoke invoke){providers().push_back({std::move(supports),std::move(invoke)});}
}
namespace {
constexpr size_t MAX_BYTES=1048576, MAX_QUEUE=1024;
constexpr float DEFAULT_FONT_SIZE=16.0f;
constexpr uint32_t DEFAULT_LIGHT_TEXT_COLOR=0xff000000u;
constexpr uint32_t DEFAULT_DARK_TEXT_COLOR=0xffffffffu;
constexpr uint32_t DEFAULT_LIGHT_PLACEHOLDER_COLOR=0xff888888u;
constexpr uint32_t DEFAULT_DARK_PLACEHOLDER_COLOR=0xff8e8e93u;
ArkUI_NativeNodeAPI_1 *api;
ArkUI_NativeGestureAPI_1 *gestures;
ArkUI_NativeGestureAPI_2 *gestureInterrupts;
napi_value undefined(napi_env e) { napi_value v; napi_get_undefined(e,&v); return v; }
void check(bool ok,const char *reason) { if (!ok) throw std::runtime_error(reason); }
napi_value property(napi_env e,napi_value o,const char *key) { napi_value v; check(napi_get_named_property(e,o,key,&v)==napi_ok,"INVALID_PROPERTY"); return v; }
bool has(napi_env e,napi_value o,const char *key) { bool b=false; napi_has_named_property(e,o,key,&b); return b; }
std::string str(napi_env e,napi_value v,size_t maximum=MAX_BYTES) { size_t n=0; check(napi_get_value_string_utf8(e,v,nullptr,0,&n)==napi_ok&&n<=maximum,"INVALID_STRING"); std::string s(n+1,'\0'); napi_get_value_string_utf8(e,v,s.data(),s.size(),&n); s.resize(n); return s; }
double number(napi_env e,napi_value v) { double d; check(napi_get_value_double(e,v,&d)==napi_ok&&std::isfinite(d),"INVALID_NUMBER"); return d; }
uint32_t integer(napi_env e,napi_value v,bool zero=false) { double d=number(e,v); check(d==std::floor(d)&&d>=(zero?0:1)&&d<=4294967295.,"INVALID_ID"); return static_cast<uint32_t>(d); }
bool boolean(napi_env e,napi_value v) { bool b; check(napi_get_value_bool(e,v,&b)==napi_ok,"INVALID_BOOLEAN"); return b; }
napi_value jsstr(napi_env e,const std::string &s) { napi_value v; napi_create_string_utf8(e,s.data(),s.size(),&v); return v; }
void put(napi_env e,napi_value o,const char *k,napi_value v) { napi_set_named_property(e,o,k,v); }
void putnum(napi_env e,napi_value o,const char *k,double d) { napi_value v; napi_create_double(e,d,&v); put(e,o,k,v); }
napi_value parse(napi_env e,napi_value s) { napi_value global,json,fn,result; napi_get_global(e,&global); json=property(e,global,"JSON"); fn=property(e,json,"parse"); check(napi_call_function(e,json,fn,1,&s,&result)==napi_ok,"INVALID_JSON"); return result; }
std::vector<napi_value> arguments(napi_env e,napi_callback_info info,size_t n) { std::vector<napi_value> a(n); size_t count=n; napi_get_cb_info(e,info,&count,a.data(),nullptr,nullptr); check(count==n,"INVALID_ARGUMENT_COUNT"); return a; }
void floats(ArkUI_NodeHandle n,ArkUI_NodeAttributeType key,std::initializer_list<float> f) { std::vector<ArkUI_NumberValue> v; for(float x:f){ArkUI_NumberValue a{};a.f32=x;v.push_back(a);} ArkUI_AttributeItem item{v.data(),static_cast<int32_t>(v.size()),nullptr,nullptr};check(api->setAttribute(n,key,&item)==0,"ARKUI_ATTRIBUTE_FAILED"); }
void ints(ArkUI_NodeHandle n,ArkUI_NodeAttributeType key,std::initializer_list<int32_t> f) { std::vector<ArkUI_NumberValue> v;for(int32_t x:f){ArkUI_NumberValue a{};a.i32=x;v.push_back(a);} ArkUI_AttributeItem item{v.data(),static_cast<int32_t>(v.size()),nullptr,nullptr};check(api->setAttribute(n,key,&item)==0,"ARKUI_ATTRIBUTE_FAILED"); }
void text(ArkUI_NodeHandle n,ArkUI_NodeAttributeType key,const std::string &s) { ArkUI_AttributeItem item{nullptr,0,s.c_str(),nullptr};check(api->setAttribute(n,key,&item)==0,"ARKUI_TEXT_FAILED"); }
uint32_t color(const std::string &s) { if(s=="transparent")return 0;check((s.size()==7||s.size()==9)&&s[0]=='#'&&s.find_first_not_of("0123456789abcdefABCDEF",1)==std::string::npos,"INVALID_COLOR"); auto packed=static_cast<uint32_t>(std::stoul(s.substr(1),nullptr,16));return s.size()==9?(packed>>8)|(packed<<24):0xff000000u|packed; }

uint64_t monotonicNs(){return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();}
struct WorkerMetrics {
  std::atomic<bool> enabled{false};
  std::atomic<uint64_t> generation{0},stepNs{0},queueNs{0};
};
struct WorkerOutput {std::string bytes;std::shared_ptr<WorkerMetrics> metrics;uint64_t queued=0,generation=0;};
struct Worker {
  std::shared_ptr<WorkerMetrics> metrics=std::make_shared<WorkerMetrics>();
  napi_threadsafe_function callback=nullptr;
  std::mutex lock; std::condition_variable wake; anseronui::InputQueue inputs{MAX_QUEUE};
  bool stopping=false; bool poisoned=false; std::atomic<bool> failed{false}; std::thread thread;
  explicit Worker(napi_env e,napi_value fn) {
    napi_value name=jsstr(e,"AnseronUICore");
    check(napi_create_threadsafe_function(e,fn,nullptr,name,MAX_QUEUE,1,nullptr,nullptr,nullptr,
      [](napi_env env,napi_value cb,void*,void *raw){std::unique_ptr<WorkerOutput> message(static_cast<WorkerOutput*>(raw));if(!env)return;if(message->queued&&message->generation==message->metrics->generation&&message->metrics->enabled)message->metrics->queueNs.fetch_add(monotonicNs()-message->queued);napi_value arg=jsstr(env,message->bytes),result;napi_call_function(env,undefined(env),cb,1,&arg,&result);},&callback)==napi_ok,"TSFN_CREATE_FAILED");
    thread=std::thread([this]{run();});
  }
  bool emit(std::string s) { auto p=std::make_unique<WorkerOutput>();p->bytes=std::move(s);p->metrics=metrics;p->generation=metrics->generation;if(metrics->enabled)p->queued=monotonicNs(); if(napi_call_threadsafe_function(callback,p.get(),napi_tsfn_nonblocking)!=napi_ok)return false;p.release();return true; }
  void run() {
    AnseronUIContext *ctx=anseronui_open();
    auto fail=[&]{ poisoned=true;failed=true; emit(std::string("!CORE_FAILURE ")+anseronui_error(ctx)); };
    if(!ctx||*anseronui_error(ctx)){fail();}
    while(ctx&&!failed) {
      std::string input;
      { std::unique_lock<std::mutex> guard(lock); wake.wait(guard,[&]{return stopping||!inputs.empty();}); if(stopping&&inputs.empty())break; input=inputs.pop(); }
      if(!anseronui_post(ctx,reinterpret_cast<const uint8_t*>(input.data()),input.size())) {fail();break;}
      for(int budget=0;;++budget){
        uint8_t *bytes=nullptr;size_t length=0;
        const auto generation=metrics->generation.load();const auto started=metrics->enabled?monotonicNs():0;
        const bool stepped=anseronui_step(ctx,&bytes,&length);
        if(started&&generation==metrics->generation&&metrics->enabled)metrics->stepNs.fetch_add(monotonicNs()-started);
        if(!stepped){fail();break;}
        std::string output(reinterpret_cast<char*>(bytes),length);anseronui_free(bytes);
        if(length>MAX_BYTES||!emit(std::move(output))){failed=true;break;}
        if(!anseronui_pending(ctx)){if(*anseronui_error(ctx))fail();break;}
        // Yield to the scheduler, without accepting the next event before this one drains.
        if(budget%64==63)std::this_thread::yield();
        std::lock_guard<std::mutex> guard(lock);if(stopping)break;
      }
    }
    // A poisoned runtime cannot run cleanup. Retire this OS thread permanently;
    // never attach another Core to its TLS state or call generated code again.
    if(ctx&&!poisoned&&!anseronui_close(ctx))emit(std::string("!CORE_CLOSE_FAILURE ")+anseronui_error(ctx));
    napi_release_threadsafe_function(callback,napi_tsfn_release);
  }
  template<class EncodeReplacement>
  uint32_t post(std::string s,std::string key,uint32_t sequence,EncodeReplacement encode) {
    std::lock_guard<std::mutex> guard(lock);check(!stopping&&!failed,"CORE_CLOSED");
    const auto accepted=inputs.push(std::move(s),std::move(key),sequence,encode);
    wake.notify_one();return accepted;
  }
  void stop(){ {std::lock_guard<std::mutex> guard(lock);stopping=true;}wake.notify_one();if(thread.joinable())thread.join(); }
  ~Worker(){stop();}
};
struct Surface;
struct TouchSession {
  uint32_t target=0; anseronui::TouchPolicy policy; bool cancelled=false;
  float x=0,y=0,pageX=0,pageY=0,localOriginX=0,localOriginY=0,rootOriginX=0,rootOriginY=0;
};
struct Node { std::shared_ptr<bool> alive=std::make_shared<bool>(true); Surface *surface=nullptr;uint32_t id=0,parent=0,inputRevision=0;ArkUI_NodeHandle handle=nullptr,container=nullptr;std::string kind;std::string declaredJSON="{}";std::string mediaSource;anseronui::NativeComponent custom;std::set<std::string> events;std::vector<uint32_t> children;bool updating=false;std::string touchAction="auto";std::string accessibilityProps="{}";ArkUI_AccessibilityState *accessibilityState=nullptr;ArkUI_AccessibilityValue *accessibilityValue=nullptr;~Node(){if(accessibilityState)OH_ArkUI_AccessibilityState_Dispose(accessibilityState);if(accessibilityValue)OH_ArkUI_AccessibilityValue_Dispose(accessibilityValue);}bool enabled=true;float x=0,y=0,width=0,height=0,anchor=0,nextAnchor=0;anseronui::ScrollAnchor scrollAnchor; std::map<std::string,std::string> strings; std::map<std::string,double> numbers; std::set<std::string> declared; std::vector<ArkUI_NodeHandle> spans;std::vector<std::pair<std::string,std::string>> spanColors; ArkUI_GestureRecognizer *longPress=nullptr;ArkUI_NodeHandle mediaNode=nullptr; };
std::map<ArkUI_NodeHandle,Node*> rendererNodes;
#ifdef ANSERONUI_SCROLL_TRACE
void removeScrollTrace(Node &n);
#endif
struct Surface { napi_env env; napi_ref event; napi_ref media;ArkUI_NodeContentHandle content;ArkUI_NodeHandle root;uint32_t revision=0;std::string lastCommands;std::map<uint32_t,std::unique_ptr<Node>> nodes;bool dark=false,visible=true;float density=1;std::vector<uint32_t> roots;std::map<uint32_t,TouchSession> touches;
  Surface(napi_env e,napi_value c,napi_value fn,napi_value factory,float scale):env(e),density(scale){napi_create_reference(e,factory,1,&media);check(OH_ArkUI_GetNodeContentFromNapiValue(e,c,&content)==0,"INVALID_NODE_CONTENT");napi_create_reference(e,fn,1,&event);root=api->createNode(ARKUI_NODE_STACK);floats(root,NODE_WIDTH_PERCENT,{1});floats(root,NODE_HEIGHT_PERCENT,{1});ints(root,NODE_ALIGNMENT,{0});check(OH_ArkUI_NodeContent_AddNode(content,root)==0,"ATTACH_FAILED");}
  void notify(napi_value value){napi_value fn,result;napi_get_reference_value(env,event,&fn);napi_call_function(env,undefined(env),fn,1,&value,&result);}
  napi_value mediaCall(const char *method,size_t count,napi_value *args){napi_value object,fn,result;napi_get_reference_value(env,media,&object);fn=property(env,object,method);check(napi_call_function(env,object,fn,count,args,&result)==napi_ok,"MEDIA_CALLBACK_FAILED");return result;}
  Node &get(uint32_t id){auto i=nodes.find(id);check(i!=nodes.end(),"NODE_NOT_FOUND");return *i->second;}
  void detach(Node &n){auto parent=n.parent?get(n.parent).container:root;api->removeChild(parent,n.handle);auto &v=n.parent?get(n.parent).children:roots;v.erase(std::remove(v.begin(),v.end(),n.id),v.end());n.parent=0;}
  void remove(uint32_t id){Node &n=get(id);
#ifdef ANSERONUI_SCROLL_TRACE
    removeScrollTrace(n);
#endif
    *n.alive=false;for(auto it=touches.begin();it!=touches.end();)if(it->second.target==id)it=touches.erase(it);else ++it;if(n.longPress){gestures->removeGestureFromNode(n.handle,n.longPress);gestures->dispose(n.longPress);}for(auto span:n.spans){rendererNodes.erase(span);api->removeChild(n.handle,span);api->disposeNode(span);}auto children=n.children;for(auto child:children)remove(child);detach(n);if(n.mediaNode){api->removeChild(n.handle,n.mediaNode);napi_value arg;napi_create_uint32(env,n.id,&arg);mediaCall("remove",1,&arg);}rendererNodes.erase(n.handle);if(n.custom.dispose)n.custom.dispose();else api->disposeNode(n.handle);if(n.container&&n.container!=n.handle&&!n.custom.dispose)api->disposeNode(n.container);nodes.erase(id);}
  ~Surface(){while(!nodes.empty())remove(nodes.begin()->first);OH_ArkUI_NodeContent_RemoveNode(content,root);api->disposeNode(root);napi_delete_reference(env,event);napi_delete_reference(env,media);}
};
struct Environment {
  std::map<uint32_t,std::shared_ptr<Worker>> workers;
  std::map<uint32_t,std::unique_ptr<Surface>> surfaces;
  uint32_t nextWorker=1,nextSurface=1;
  ~Environment(){for(auto &entry:workers)entry.second->stop();workers.clear();surfaces.clear();}
};
Environment &state(napi_env env){void *data=nullptr;napi_get_instance_data(env,&data);check(data,"ENVIRONMENT_CLOSED");return *static_cast<Environment*>(data);}

float scrollOffset(Node &n) {
  auto *offset=api->getAttribute(n.handle,NODE_SCROLL_OFFSET);
  return offset&&offset->size>1?offset->value[1].f32:0;
}
std::vector<anseronui::ScrollAnchorRow> scrollRows(Node &n) {
  std::vector<anseronui::ScrollAnchorRow> rows;
  if(n.children.empty())return rows;
  auto &document=n.surface->get(n.children.front());
  for(auto id:document.children){auto &row=n.surface->get(id);rows.push_back({id,document.y+row.y,row.height});}
  return rows;
}
void anchorTransform(Node &n) {
  floats(n.container,NODE_TRANSLATE,{0,-n.scrollAnchor.pending,0});
}
void flushAnchor(Node &n) {
  if(n.scrollAnchor.pending==0)return;
  auto *offset=api->getAttribute(n.handle,NODE_SCROLL_OFFSET);
  float x=offset&&offset->size>0?offset->value[0].f32:0,y=scrollOffset(n);
  const float delta=n.scrollAnchor.consume();anchorTransform(n);
  // Only an idle correction may use the controller: it stops native inertia.
  const bool updating=n.updating;n.updating=true;
  ArkUI_NumberValue values[3]{};values[0].f32=x;values[1].f32=y+delta;values[2].i32=0;
  ArkUI_AttributeItem item{values,3,nullptr,nullptr};api->setAttribute(n.handle,NODE_SCROLL_OFFSET,&item);n.updating=updating;
}

#ifdef ANSERONUI_SCROLL_TRACE
struct ScrollTraceFrame { float travel=0;std::map<uint32_t,float> rows; };
std::map<Node*,ScrollTraceFrame> scrollTraceFrames;
void removeScrollTrace(Node &n) {if(n.kind=="ScrollView")OH_ArkUI_UnregisterDrawCallbackOnNodeHandle(n.handle);scrollTraceFrames.erase(&n);}
void traceScrollLayout(void *data) {
  auto &n=*static_cast<Node*>(data);if(!n.declared.count("scrollAnchorOffset"))return;
  auto &previous=scrollTraceFrames[&n];ScrollTraceFrame frame;
  // The controller offset can already belong to the NEXT layout during a
  // callback. Sample the drawn viewport/content positions from the same frame.
  ArkUI_IntOffset viewport{},content{};
  if(OH_ArkUI_NodeUtils_GetPositionWithTranslateInWindow(n.handle,&viewport)!=0||OH_ArkUI_NodeUtils_GetPositionWithTranslateInWindow(n.container,&content)!=0)return;
  const float logical=(viewport.y-content.y)/n.surface->density;
  frame.travel=logical-n.scrollAnchor.applied;
  float error=0,gap=0,cursor=logical;uint32_t matched=0;bool sample=false;
  auto rows=scrollRows(n);std::sort(rows.begin(),rows.end(),[](const auto &a,const auto &b){return a.top<b.top;});
  for(const auto &row:rows)if(row.top+row.height>logical&&row.top<logical+n.height){
    gap=std::max(gap,row.top-cursor);cursor=std::max(cursor,row.top+row.height);
    ArkUI_IntOffset position{};
    if(OH_ArkUI_NodeUtils_GetPositionWithTranslateInWindow(n.surface->get(row.id).handle,&position)!=0)continue;
    const float screen=position.y/n.surface->density;frame.rows[row.id]=screen;
    if(!sample&&previous.rows.count(row.id)){error=screen-previous.rows.at(row.id)+frame.travel-previous.travel;matched=row.id;sample=true;}
  }
  gap=std::max(gap,logical+n.height-cursor);
  OH_LOG_Print(LOG_APP,LOG_WARN,0,"AnseronScroll","frame node=%{public}u y=%{public}.3f travel=%{public}.3f error=%{public}.3f matched=%{public}u rows=%{public}zu gap=%{public}.3f",n.id,logical,frame.travel,error,matched,frame.rows.size(),gap);
  previous=std::move(frame);
}
#endif

void origin(Node &n,float &x,float &y) {
  x=n.x;y=n.y;
  for(auto id=n.parent;id;id=n.surface->get(id).parent) {
    auto &parent=n.surface->get(id);x+=parent.x;y+=parent.y;
    if(parent.kind=="ScrollView") {auto *offset=api->getAttribute(parent.handle,NODE_SCROLL_OFFSET);if(offset&&offset->size>=2){x-=offset->value[0].f32;y-=offset->value[1].f32+parent.scrollAnchor.pending;}}
  }
}
bool descendsFrom(Surface &s,uint32_t target,uint32_t ancestor) {
  for(auto id=target;id;id=s.get(id).parent)if(id==ancestor)return true;
  return false;
}
void sendTouch(Surface &s,uint32_t pointer,TouchSession &session,const char *name) {
  if(!s.visible||!s.nodes.count(session.target))return;
  bool bound=false;for(auto id=session.target;id;id=s.get(id).parent)if(s.get(id).events.count(name)){bound=true;break;}
  if(!bound)return;
  auto e=s.env;napi_value p,touches;napi_create_object(e,&p);napi_create_array(e,&touches);
  put(e,p,"type",jsstr(e,"NativeEvent"));put(e,p,"event",jsstr(e,name));
  putnum(e,p,"nodeId",session.target);putnum(e,p,"targetId",session.target);putnum(e,p,"revision",s.revision);
  putnum(e,p,"pointerId",pointer);putnum(e,p,"x",session.x);putnum(e,p,"y",session.y);putnum(e,p,"pageX",session.pageX);putnum(e,p,"pageY",session.pageY);
  uint32_t index=0;
  for(auto &entry:s.touches) {
    if(entry.second.cancelled||((std::string(name)=="touchUp"||std::string(name)=="touchCancel")&&entry.first==pointer))continue;
    const auto &v=entry.second;napi_value point;napi_create_object(e,&point);putnum(e,point,"pointerId",entry.first);
    putnum(e,point,"x",v.pageX-(session.pageX-session.x));putnum(e,point,"y",v.pageY-(session.pageY-session.y));
    putnum(e,point,"pageX",v.pageX);putnum(e,point,"pageY",v.pageY);napi_set_element(e,touches,index++,point);
  }
  put(e,p,"touches",touches);s.notify(p);
}
void touchEvent(Node &node,const ArkUI_UIInputEvent *input) {
  auto &s=*node.surface;const auto action=OH_ArkUI_UIInputEvent_GetAction(input);
  const auto count=std::min(OH_ArkUI_PointerEvent_GetPointerCount(input),32u);
  uint32_t changed=0;
  if(OH_ArkUI_PointerEvent_GetChangedPointerId(input,&changed)!=0&&count)changed=OH_ArkUI_PointerEvent_GetPointerId(input,0);
  // Native bubbling is replaced by Core's capture/target/bubble traversal.
  OH_ArkUI_PointerEvent_SetStopPropagation(input,true);
  for(uint32_t index=0;index<count;index++) {
    const uint32_t id=OH_ArkUI_PointerEvent_GetPointerId(input,index);
    if(action==UI_TOUCH_EVENT_ACTION_DOWN&&id==changed&&!s.touches.count(id)) {
      TouchSession session;session.target=node.id;
      for(auto *n=&node;n;n=n->parent?&s.get(n->parent):nullptr){session.policy.intersect(n->touchAction);if(n->kind=="ScrollView")break;}
      float px,py;origin(node,px,py);
      session.localOriginX=OH_ArkUI_PointerEvent_GetWindowXByIndex(input,index)-OH_ArkUI_PointerEvent_GetXByIndex(input,index);
      session.localOriginY=OH_ArkUI_PointerEvent_GetWindowYByIndex(input,index)-OH_ArkUI_PointerEvent_GetYByIndex(input,index);
      session.rootOriginX=session.localOriginX-px;session.rootOriginY=session.localOriginY-py;
      if(s.touches.size()<32)s.touches[id]=session;
    }
    auto found=s.touches.find(id);if(found==s.touches.end())continue;
    auto &session=found->second;
    const float wx=OH_ArkUI_PointerEvent_GetWindowXByIndex(input,index),wy=OH_ArkUI_PointerEvent_GetWindowYByIndex(input,index);
    session.x=wx-session.localOriginX;session.y=wy-session.localOriginY;session.pageX=wx-session.rootOriginX;session.pageY=wy-session.rootOriginY;
  }
  if(action==UI_TOUCH_EVENT_ACTION_MOVE){for(auto &entry:s.touches)if(!entry.second.cancelled)sendTouch(s,entry.first,entry.second,"touchMove");return;}
  if(action==UI_TOUCH_EVENT_ACTION_CANCEL){for(auto &entry:s.touches)if(!entry.second.cancelled)sendTouch(s,entry.first,entry.second,"touchCancel");s.touches.clear();return;}
  auto found=s.touches.find(changed);if(found==s.touches.end())return;
  if(!found->second.cancelled)sendTouch(s,changed,found->second,action==UI_TOUCH_EVENT_ACTION_DOWN?"touchDown":"touchUp");
  if(action==UI_TOUCH_EVENT_ACTION_UP)s.touches.erase(found);
}
void bindScrollGesture(Node &node) {
  if(!gestureInterrupts)gestureInterrupts=reinterpret_cast<ArkUI_NativeGestureAPI_2*>(OH_ArkUI_QueryModuleInterfaceByName(ARKUI_NATIVE_GESTURE,"ArkUI_NativeGestureAPI_2"));
  check(gestureInterrupts,"GESTURE_API_UNAVAILABLE");
  check(gestureInterrupts->setGestureInterrupterToNode(node.handle,&node,[](ArkUI_GestureInterruptInfo *info){
    auto *scroll=static_cast<Node*>(OH_ArkUI_GestureInterrupter_GetUserData(info));
    if(!scroll||!OH_ArkUI_GestureInterruptInfo_GetSystemFlag(info)||gestureInterrupts->gestureApi1->getGestureType(OH_ArkUI_GestureInterruptInfo_GetRecognizer(info))!=PAN_GESTURE)return GESTURE_INTERRUPT_RESULT_CONTINUE;
    auto &surface=*scroll->surface;
    for(auto &entry:surface.touches)if(descendsFrom(surface,entry.second.target,scroll->id)&&!entry.second.policy.vertical)return GESTURE_INTERRUPT_RESULT_REJECT;
    // Exactly one cancellation when the native ScrollView takes ownership.
    for(auto &entry:surface.touches)if(!entry.second.cancelled&&descendsFrom(surface,entry.second.target,scroll->id)){
      sendTouch(surface,entry.first,entry.second,"touchCancel");entry.second.cancelled=true;
    }
    return GESTURE_INTERRUPT_RESULT_CONTINUE;
  })==0,"GESTURE_INTERRUPT_FAILED");
}
void eventReceiver(ArkUI_NodeEvent *event){
  // Plugin events carry plugin-owned userData, not a renderer Node.
  const auto kind=OH_ArkUI_NodeEvent_GetEventType(event);
  if(kind!=NODE_ON_CLICK&&kind!=NODE_IMAGE_ON_COMPLETE&&kind!=NODE_IMAGE_ON_ERROR&&kind!=NODE_TOUCH_EVENT&&kind!=NODE_TEXT_INPUT_ON_CHANGE&&kind!=NODE_ON_FOCUS&&kind!=NODE_ON_BLUR&&kind!=NODE_TEXT_INPUT_ON_SUBMIT&&kind!=NODE_SCROLL_EVENT_ON_DID_SCROLL&&kind!=NODE_SCROLL_EVENT_ON_SCROLL_STOP&&kind!=NODE_SCROLL_EVENT_ON_SCROLL_START&&kind!=NODE_SCROLL_EVENT_ON_WILL_SCROLL)return;
  auto found=rendererNodes.find(OH_ArkUI_NodeEvent_GetNodeHandle(event));if(found==rendererNodes.end())return;auto *n=found->second;if(!n||n->updating||!n->surface->visible)return;if(kind==NODE_SCROLL_EVENT_ON_SCROLL_START){n->scrollAnchor.scrolling=true;
#ifdef ANSERONUI_SCROLL_TRACE
    if(n->declared.count("scrollAnchorOffset"))OH_LOG_Print(LOG_APP,LOG_WARN,0,"AnseronScroll","start node=%{public}u",n->id);
#endif
    return;}
  if(kind==NODE_SCROLL_EVENT_ON_WILL_SCROLL){
    // Return the correction through ArkUI's native frame callback. Calling a
    // controller here would abort the drag/fling instead of preserving it.
#ifdef ANSERONUI_SCROLL_TRACE
    if(n->scrollAnchor.pending!=0)OH_LOG_Print(LOG_APP,LOG_WARN,0,"AnseronScroll","consume node=%{public}u delta=%{public}.3f",n->id,n->scrollAnchor.pending);
#endif
    if(n->scrollAnchor.pending!=0){auto *data=OH_ArkUI_NodeEvent_GetNodeComponentEvent(event);if(data){data->data[1].f32+=n->scrollAnchor.consume();anchorTransform(*n);}}
    return;
  }
  if(kind==NODE_SCROLL_EVENT_ON_SCROLL_STOP){n->scrollAnchor.scrolling=false;flushAnchor(*n);
#ifdef ANSERONUI_SCROLL_TRACE
    if(n->declared.count("scrollAnchorOffset"))OH_LOG_Print(LOG_APP,LOG_WARN,0,"AnseronScroll","stop node=%{public}u",n->id);
#endif
  }
  Surface &s=*n->surface;napi_env e=s.env;napi_value p;napi_create_object(e,&p);putnum(e,p,"nodeId",n->id);putnum(e,p,"revision",s.revision);
  std::string type="NativeEvent",name;
  if(kind==NODE_ON_CLICK){auto target=OH_ArkUI_NodeEvent_GetTargetId(event);if(target>=1000){name="spanClick";put(e,p,"value",jsstr(e,std::to_string(target-1000)));}else{type="Tap";name="tap";}}
  else if(kind==NODE_IMAGE_ON_COMPLETE||kind==NODE_IMAGE_ON_ERROR){name=kind==NODE_IMAGE_ON_COMPLETE?"loadSuccess":"loadFailure";put(e,p,"source",jsstr(e,n->strings.count(n->surface->dark&&n->strings.count("dmSrc")?"dmSrc":"src")?n->strings.at(n->surface->dark&&n->strings.count("dmSrc")?"dmSrc":"src"):""));if(kind==NODE_IMAGE_ON_ERROR){auto *data=OH_ArkUI_NodeEvent_GetNodeComponentEvent(event);putnum(e,p,"errorCode",data?data->data[0].i32:0);}}
  else if(kind==NODE_TOUCH_EVENT){auto *input=OH_ArkUI_NodeEvent_GetInputEvent(event);if(input)touchEvent(*n,input);return;}
  else if(kind==NODE_TEXT_INPUT_ON_CHANGE){type="InputChange";name="changeText";auto *v=OH_ArkUI_NodeEvent_GetStringAsyncEvent(event);put(e,p,"value",jsstr(e,v&&v->pStr?v->pStr:""));putnum(e,p,"inputRevision",++n->inputRevision);}
  else if(kind==NODE_ON_FOCUS)name="focus";
  else if(kind==NODE_ON_BLUR)name="blur";
  else if(kind==NODE_TEXT_INPUT_ON_SUBMIT){name="submit";auto *v=api->getAttribute(n->handle,NODE_TEXT_INPUT_TEXT);put(e,p,"value",jsstr(e,v&&v->string?v->string:""));}
  else if(kind==NODE_SCROLL_EVENT_ON_DID_SCROLL||kind==NODE_SCROLL_EVENT_ON_SCROLL_STOP){name=kind==NODE_SCROLL_EVENT_ON_SCROLL_STOP?"scrollEnd":"scroll";auto *v=api->getAttribute(n->handle,NODE_SCROLL_OFFSET);putnum(e,p,"x",v&&v->size>0?v->value[0].f32:0);putnum(e,p,"y",(v&&v->size>1?v->value[1].f32:0)+n->scrollAnchor.pending);putnum(e,p,"scrollAdjustment",n->scrollAnchor.applied);float w=n->width,h=n->height;for(auto id:n->children){auto &c=s.get(id);w=std::max(w,c.x+c.width);h=std::max(h,c.y+c.height);}putnum(e,p,"contentWidth",w);putnum(e,p,"contentHeight",h);}
  if(name.empty()||!n->events.count(name))return;put(e,p,"type",jsstr(e,type));if(type=="NativeEvent")put(e,p,"event",jsstr(e,name));s.notify(p);
}
void registerEvents(Node &n){
  rendererNodes[n.handle]=&n;
  api->registerNodeEvent(n.handle,NODE_TOUCH_EVENT,0,&n);
  api->registerNodeEvent(n.handle,NODE_ON_FOCUS,0,&n);api->registerNodeEvent(n.handle,NODE_ON_BLUR,0,&n);
  if(n.kind=="Image"){api->registerNodeEvent(n.handle,NODE_IMAGE_ON_COMPLETE,0,&n);api->registerNodeEvent(n.handle,NODE_IMAGE_ON_ERROR,0,&n);}
  if(n.kind=="TextInput"){api->registerNodeEvent(n.handle,NODE_TEXT_INPUT_ON_CHANGE,0,&n);api->registerNodeEvent(n.handle,NODE_TEXT_INPUT_ON_SUBMIT,0,&n);}
  if(n.kind=="ScrollView"){api->registerNodeEvent(n.handle,NODE_SCROLL_EVENT_ON_SCROLL_START,0,&n);api->registerNodeEvent(n.handle,NODE_SCROLL_EVENT_ON_WILL_SCROLL,0,&n);api->registerNodeEvent(n.handle,NODE_SCROLL_EVENT_ON_DID_SCROLL,0,&n);api->registerNodeEvent(n.handle,NODE_SCROLL_EVENT_ON_SCROLL_STOP,0,&n);bindScrollGesture(n);
#ifdef ANSERONUI_SCROLL_TRACE
    check(OH_ArkUI_RegisterDrawCallbackOnNodeHandle(n.handle,&n,traceScrollLayout)==0,"SCROLL_TRACE_CALLBACK_FAILED");
#endif
  }

}
void bindLongPress(Node &n) {
  if(n.longPress || !n.events.count("longPress"))return;
  if(!gestures)gestures=reinterpret_cast<ArkUI_NativeGestureAPI_1*>(OH_ArkUI_QueryModuleInterfaceByName(ARKUI_NATIVE_GESTURE,"ArkUI_NativeGestureAPI_1"));
  check(gestures,"GESTURE_API_UNAVAILABLE");
  n.longPress=gestures->createLongPressGesture(1,false,500);
  check(n.longPress,"GESTURE_CREATE_FAILED");
  check(gestures->setGestureEventTarget(n.longPress,GESTURE_EVENT_ACTION_ACCEPT,&n,[](ArkUI_GestureEvent*,void *data){
    auto &node=*static_cast<Node*>(data);if(!node.surface->visible||!node.enabled||!node.events.count("longPress"))return;
    auto &surface=*node.surface;auto env=surface.env;napi_value payload;napi_create_object(env,&payload);
    put(env,payload,"type",jsstr(env,"NativeEvent"));put(env,payload,"event",jsstr(env,"longPress"));
    putnum(env,payload,"nodeId",node.id);putnum(env,payload,"revision",surface.revision);surface.notify(payload);
  })==0,"GESTURE_CALLBACK_FAILED");
  check(gestures->addGestureToNode(n.handle,n.longPress,NORMAL,NORMAL_GESTURE_MASK)==0,"GESTURE_ATTACH_FAILED");
}
std::string stringify(napi_env e,napi_value v){napi_value g,j,f,s;napi_get_global(e,&g);j=property(e,g,"JSON");f=property(e,j,"stringify");check(napi_call_function(e,j,f,1,&v,&s)==napi_ok,"JSON_ENCODE_FAILED");return str(e,s);}
void visual(Node &n) {
  auto number=[&](const char *key,double fallback=0){auto it=n.numbers.find(key);return static_cast<float>(it==n.numbers.end()?fallback:it->second);};
  auto col=[&](const char *base,const char *dark,uint32_t fallback){auto it=n.strings.find(n.surface->dark&&n.strings.count(dark)?dark:base);return it==n.strings.end()?fallback:color(it->second);};
  // ArkUI controls have visible defaults (input underlines,
  // platform padding) that differ from the shared renderer baseline. Apply
  // every baseline value on each snapshot so removed props cannot reintroduce
  // an ArkUI default.
  const bool glass=n.kind=="View"&&number("glassEffect")!=0&&number("glassEffectContainer")==0;
  ints(n.handle,NODE_BACKGROUND_COLOR,{static_cast<int32_t>(col("backgroundColor","dmBackgroundColor",glass?(n.surface->dark?0xcc20242bu:0xccf2f5fau):0))});
  const auto blur=number("backgroundBlurRadius",glass?(n.strings["glassEffectStyle"]=="clear"?12:20):0);
  if(blur>0){
    ArkUI_NumberValue values[4]{};values[0].i32=ARKUI_BLUR_STYLE_COMPONENT_ULTRA_THICK;
    values[1].i32=ARKUI_COLOR_MODE_SYSTEM;values[2].i32=ARKUI_ADAPTIVE_COLOR_DEFAULT;
    values[3].f32=std::clamp(blur/40.0f,0.0f,1.0f);
    ArkUI_AttributeItem item{values,4,nullptr,nullptr};check(api->setAttribute(n.handle,NODE_BACKGROUND_BLUR_STYLE,&item)==0,"BACKGROUND_BLUR_FAILED");
  }else api->resetAttribute(n.handle,NODE_BACKGROUND_BLUR_STYLE);
  ints(n.handle,NODE_BORDER_COLOR,{static_cast<int32_t>(col("borderColor","dmBorderColor",0))});
  if(n.kind=="Text"||n.kind=="TextInput"||n.kind=="RichText") {
    uint32_t fallback=n.surface->dark?DEFAULT_DARK_TEXT_COLOR:DEFAULT_LIGHT_TEXT_COLOR;
    uint32_t value=col("color","dmColor",fallback);
    ints(n.handle,NODE_FONT_COLOR,{static_cast<int32_t>(value)});
    floats(n.handle,NODE_FONT_SIZE,{number("fontSize",DEFAULT_FONT_SIZE)});
    if(n.kind=="Text"||n.kind=="RichText") {
      if(n.numbers.count("lineHeight"))floats(n.handle,NODE_TEXT_LINE_HEIGHT,{number("lineHeight")});else api->resetAttribute(n.handle,NODE_TEXT_LINE_HEIGHT);
    }
    // Core supplies the actual text frame. Keep glyphs centered inside that
    // frame instead of ArkUI's baseline default, which visibly shifts labels
    // in centered tiles and the draggable floating ball.
    if(n.kind=="Text"||n.kind=="RichText") {
      ints(n.handle,NODE_TEXT_VERTICAL_ALIGN,{ARKUI_TEXT_VERTICAL_ALIGNMENT_CENTER});
      ints(n.handle,NODE_TEXT_CONTENT_ALIGN,{ARKUI_TEXT_CONTENT_ALIGN_CENTER});
    }
  }
  if(n.kind=="TextInput") {
    ints(n.handle,NODE_TEXT_INPUT_PLACEHOLDER_COLOR,{static_cast<int32_t>(col("placeholderTextColor","dmPlaceholderTextColor",n.surface->dark?DEFAULT_DARK_PLACEHOLDER_COLOR:DEFAULT_LIGHT_PLACEHOLDER_COLOR))});
    // Match UITextField/EditText/Web input appearance: no native underline,
    // background, border, or implicit horizontal padding.
    ints(n.handle,NODE_TEXT_INPUT_SHOW_UNDERLINE,{0});
    ints(n.handle,NODE_TEXT_INPUT_STYLE,{ARKUI_TEXTINPUT_STYLE_DEFAULT});
    floats(n.handle,NODE_PADDING,{0});
  }
  if(n.kind=="Image") {
    const auto source=n.strings.find(n.surface->dark&&n.strings.count("dmSrc")?"dmSrc":"src");
    if(source!=n.strings.end()&&source->second!=n.mediaSource){n.mediaSource=source->second;auto uri=source->second;if(uri.rfind("asset://",0)==0)uri="resource://RAWFILE/assets/"+uri.substr(8);text(n.handle,NODE_IMAGE_SRC,uri);}
  }
  // Android, iOS, and Web all use cover when Image.resizeMode is omitted.
  // Keep that value after a full SetProps snapshot removes resizeMode.
  if(n.kind=="Image"&&!n.declared.count("resizeMode"))ints(n.handle,NODE_IMAGE_OBJECT_FIT,{1});
  for(size_t index=0;index<n.spans.size();++index){const auto &colors=n.spanColors[index];const auto &value=n.surface->dark&&!colors.second.empty()?colors.second:colors.first;if(!value.empty())ints(n.spans[index],NODE_FONT_COLOR,{static_cast<int32_t>(color(value))});else api->resetAttribute(n.spans[index],NODE_FONT_COLOR);}
  floats(n.handle,NODE_TRANSLATE,{number("translateX"),number("translateY"),0});floats(n.handle,NODE_SCALE,{number("scaleX",1),number("scaleY",1)});floats(n.handle,NODE_ROTATE,{0,0,1,number("rotate"),0});
  floats(n.handle,NODE_OPACITY,{number("opacity",glass?0.88:1)});floats(n.handle,NODE_BORDER_RADIUS,{number("borderRadius")});floats(n.handle,NODE_BORDER_WIDTH,{number("borderWidth")});
  // ArkUI's native shadow path forwards radius/offsets to Rosen in physical
  // pixels (unlike NODE_WIDTH/BORDER_RADIUS). Convert shared layout units once.
  const float shadowOpacity=std::clamp(number("shadowOpacity"),0.0f,1.0f);
  if(shadowOpacity<=0)api->resetAttribute(n.handle,NODE_CUSTOM_SHADOW);
  else {
    ArkUI_NumberValue shadow[7]{};
    shadow[0].f32=std::max(0.001f,number("shadowRadius")*n.surface->density);
    shadow[2].f32=number("shadowOffsetX")*n.surface->density;
    shadow[3].f32=number("shadowOffsetY")*n.surface->density;
    shadow[4].i32=ARKUI_SHADOW_TYPE_COLOR;
    shadow[5].u32=(col("shadowColor","dmShadowColor",0xff000000)&0xffffff)|(static_cast<uint32_t>(std::round(shadowOpacity*255))<<24);
    shadow[6].u32=0; // Only the outside shadow; never tint a transparent box.
    ArkUI_AttributeItem item{shadow,7,nullptr,nullptr};check(api->setAttribute(n.handle,NODE_CUSTOM_SHADOW,&item)==0,"SHADOW_FAILED");
  }
  if(n.kind=="Video")ints(n.handle,NODE_CLIP,{1});
}
void accessibility(Node &n){
  auto e=n.surface->env;auto p=parse(e,jsstr(e,n.accessibilityProps));auto h=n.handle;
  auto flag=[&](const char *key,bool fallback=false){return has(e,p,key)?boolean(e,property(e,p,key)):fallback;};
  auto label=[&](const char *key,ArkUI_NodeAttributeType attr){if(has(e,p,key))text(h,attr,str(e,property(e,p,key)));else api->resetAttribute(h,attr);};
  label("accessibilityLabel",NODE_ACCESSIBILITY_TEXT);label("accessibilityHint",NODE_ACCESSIBILITY_DESCRIPTION);
  const auto role=has(e,p,"accessibilityRole")?str(e,property(e,p,"accessibilityRole")):"";
  const bool excluded=role=="none"||(has(e,p,"accessible")&&!flag("accessible"));
  const bool clickable=flag("accessibilityClickable",n.events.count("tap")),longClickable=flag("accessibilityLongClickable",n.events.count("longPress"));
  const bool explicitNode=flag("accessible")||!role.empty()||has(e,p,"accessibilityLabel")||clickable||longClickable;
  if(flag("accessibilityHidden"))ints(h,NODE_ACCESSIBILITY_MODE,{ARKUI_ACCESSIBILITY_MODE_DISABLED_FOR_DESCENDANTS});
  else if(excluded)ints(h,NODE_ACCESSIBILITY_MODE,{ARKUI_ACCESSIBILITY_MODE_DISABLED});
  else if(explicitNode)ints(h,NODE_ACCESSIBILITY_MODE,{ARKUI_ACCESSIBILITY_MODE_ENABLED});
  else api->resetAttribute(h,NODE_ACCESSIBILITY_MODE);
  const std::map<std::string,int32_t> roles={{"button",ARKUI_NODE_BUTTON},{"text",ARKUI_NODE_TEXT},{"image",ARKUI_NODE_IMAGE},{"checkbox",ARKUI_NODE_CHECKBOX},{"search",ARKUI_NODE_TEXT_INPUT}};
  if(!excluded&&roles.count(role))ints(h,NODE_ACCESSIBILITY_ROLE,{roles.at(role)});else api->resetAttribute(h,NODE_ACCESSIBILITY_ROLE);
  if(!excluded&&explicitNode)ints(h,NODE_ACCESSIBILITY_GROUP,{1});else api->resetAttribute(h,NODE_ACCESSIBILITY_GROUP);
  uint32_t actions=0;if(!excluded&&clickable)actions|=ARKUI_ACCESSIBILITY_ACTION_CLICK;if(!excluded&&longClickable)actions|=ARKUI_ACCESSIBILITY_ACTION_LONG_CLICK;
  if(actions||has(e,p,"accessibilityClickable")||has(e,p,"accessibilityLongClickable"))ints(h,NODE_ACCESSIBILITY_ACTIONS,{static_cast<int32_t>(actions)});else api->resetAttribute(h,NODE_ACCESSIBILITY_ACTIONS);
  if(has(e,p,"accessibilityChecked")||has(e,p,"accessibilitySelected")||has(e,p,"disabled")){
    if(!n.accessibilityState)n.accessibilityState=OH_ArkUI_AccessibilityState_Create();
    OH_ArkUI_AccessibilityState_SetDisabled(n.accessibilityState,flag("disabled"));
    OH_ArkUI_AccessibilityState_SetSelected(n.accessibilityState,flag("accessibilitySelected"));
    OH_ArkUI_AccessibilityState_SetCheckedState(n.accessibilityState,flag("accessibilityChecked")?ARKUI_ACCESSIBILITY_CHECKED:ARKUI_ACCESSIBILITY_UNCHECKED);
    ArkUI_AttributeItem item{};item.object=n.accessibilityState;check(api->setAttribute(h,NODE_ACCESSIBILITY_STATE,&item)==0,"ACCESSIBILITY_STATE_FAILED");
  }else api->resetAttribute(h,NODE_ACCESSIBILITY_STATE);
  if(has(e,p,"accessibilityValue")){
    if(!n.accessibilityValue)n.accessibilityValue=OH_ArkUI_AccessibilityValue_Create();
    auto value=str(e,property(e,p,"accessibilityValue"));OH_ArkUI_AccessibilityValue_SetText(n.accessibilityValue,value.c_str());
    ArkUI_AttributeItem item{};item.object=n.accessibilityValue;check(api->setAttribute(h,NODE_ACCESSIBILITY_VALUE,&item)==0,"ACCESSIBILITY_VALUE_FAILED");
  }else api->resetAttribute(h,NODE_ACCESSIBILITY_VALUE);
}
void props(napi_env e,Node &n,napi_value p,const std::set<std::string> *changed=nullptr){
  auto affects=[&](const std::set<std::string> &fields){if(!changed)return true;for(const auto &key:fields)if(changed->count(key))return true;return false;};
  n.accessibilityProps=stringify(e,p);
  n.updating=true;
  struct Reset {Node &n;~Reset(){n.updating=false;}} reset{n};
  if(n.kind=="Video"&&affects({"src","dmSrc","resizeMode","controls","autoplay","loop","muted","rate","playControl"})){napi_value args[2];napi_create_uint32(e,n.id,&args[0]);args[1]=jsstr(e,stringify(e,p));n.surface->mediaCall("update",2,args);}
  if(n.kind=="Native"&&affects({"nativeProps"})&&n.custom.setProps)n.custom.setProps(has(e,p,"nativeProps")?str(e,property(e,p,"nativeProps")):"{}");
  const std::set<std::string> visualNumbers={"fontSize","lineHeight","translateX","translateY","scaleX","scaleY","rotate","opacity","borderRadius","borderWidth","shadowOpacity","shadowRadius","shadowOffsetX","shadowOffsetY","backgroundBlurRadius"};
  const std::set<std::string> visualStrings={"backgroundColor","color","borderColor","placeholderTextColor","shadowColor","dmBackgroundColor","dmColor","dmBorderColor","dmPlaceholderTextColor","dmShadowColor","src","dmSrc","glassEffectStyle"};
  n.numbers.clear();n.strings.clear();
  napi_value keys;napi_get_property_names(e,p,&keys);uint32_t count;napi_get_array_length(e,keys,&count);check(count<=128,"PROPS_LIMIT");
  for(uint32_t i=0;i<count;i++){
    napi_value key;napi_get_element(e,keys,i,&key);std::string k=str(e,key);auto v=property(e,p,k.c_str());auto h=n.handle;
    if(k=="glassEffect"||k=="glassEffectContainer"){n.numbers[k]=boolean(e,v)?1:0;continue;}
    if(visualNumbers.count(k)){n.numbers[k]=number(e,v);continue;}
    if(visualStrings.count(k)){n.strings[k]=str(e,v);continue;}
    if(changed&&!changed->count(k))continue;
    if(k=="text"||k=="value") {if(n.kind=="TextInput"&&k=="value"){uint32_t rev=has(e,p,"inputRevision")?integer(e,property(e,p,"inputRevision"),true):0;if(rev<n.inputRevision)continue;auto existing=api->getAttribute(h,NODE_TEXT_INPUT_TEXT);if(existing&&existing->string&&str(e,v)==existing->string)continue;}text(h,n.kind=="TextInput"?NODE_TEXT_INPUT_TEXT:NODE_TEXT_CONTENT,str(e,v));}
    else if(k=="placeholder")text(h,NODE_TEXT_INPUT_PLACEHOLDER,str(e,v));
    else if(k=="testID")text(h,NODE_ID,str(e,v));
    else if(k=="accessibilityLabel")text(h,NODE_ACCESSIBILITY_TEXT,str(e,v));
    else if(k=="backgroundColor"||k=="color"||k=="borderColor"||k=="placeholderTextColor")ints(h,k=="backgroundColor"?NODE_BACKGROUND_COLOR:k=="color"?NODE_FONT_COLOR:k=="borderColor"?NODE_BORDER_COLOR:NODE_TEXT_INPUT_PLACEHOLDER_COLOR,{static_cast<int32_t>(color(str(e,v)))});
    else if(k=="fontSize"||k=="opacity"||k=="borderWidth"||k=="borderRadius")floats(h,k=="fontSize"?NODE_FONT_SIZE:k=="opacity"?NODE_OPACITY:k=="borderWidth"?NODE_BORDER_WIDTH:NODE_BORDER_RADIUS,{static_cast<float>(number(e,v))});
    else if(k=="fontWeight")ints(h,NODE_FONT_WEIGHT,{str(e,v)=="bold"?ARKUI_FONT_WEIGHT_BOLD:ARKUI_FONT_WEIGHT_NORMAL});
    else if(k=="fontStyle")ints(h,NODE_FONT_STYLE,{str(e,v)=="italic"?1:0});
    else if(k=="textAlign"){auto a=str(e,v);ints(h,NODE_TEXT_ALIGN,{a=="center"?1:a=="right"?2:0});}
    else if(k=="numberOfLines")ints(h,NODE_TEXT_MAX_LINES,{static_cast<int32_t>(integer(e,v,true))});
    else if(k=="ellipsizeMode")ints(h,NODE_TEXT_OVERFLOW,{str(e,v)=="tail"?ARKUI_TEXT_OVERFLOW_ELLIPSIS:ARKUI_TEXT_OVERFLOW_CLIP});
    else if(k=="visibility")ints(h,NODE_VISIBILITY,{str(e,v)=="hidden"?1:0});
    else if(k=="disabled"||k=="editable")ints(h,NODE_ENABLED,{k=="disabled"?!boolean(e,v):boolean(e,v)});
    else if(k=="overflow")ints(h,NODE_CLIP,{str(e,v)=="hidden"?1:0});
    else if(k=="maxLength")ints(h,NODE_TEXT_INPUT_MAX_LENGTH,{static_cast<int32_t>(integer(e,v,true))});
    else if(k=="secureTextEntry")ints(h,NODE_TEXT_INPUT_TYPE,{boolean(e,v)?7:0});
    else if(k=="keyboardType"){auto t=str(e,v);ints(h,NODE_TEXT_INPUT_TYPE,{has(e,p,"secureTextEntry")&&boolean(e,property(e,p,"secureTextEntry"))?7:t=="email-address"?5:t=="numeric"?2:t=="decimal-pad"?12:t=="phone-pad"?3:0});}
    else if(k=="returnKeyType"){auto t=str(e,v);ints(h,NODE_TEXT_INPUT_ENTER_KEY_TYPE,{t=="done"?6:t=="go"?2:t=="search"?3:t=="send"?4:t=="next"?5:6});}
    else if(k=="textDecorationLine"){auto t=str(e,v);ints(h,n.kind=="RichText"?NODE_TEXT_DECORATION:NODE_TEXT_DECORATION,{t=="underline"?1:t=="line-through"?2:0});}
    else if(k=="touchAction")n.touchAction=str(e,v);
    else if(k=="scrollAnchorOffset")n.nextAnchor=number(e,v);

    else if(k=="placeholderSrc"){auto source=str(e,v);if(source.rfind("asset://",0)==0)source="resource://RAWFILE/assets/"+source.substr(8);text(h,NODE_IMAGE_ALT,source);}
    else if(k=="resizeMode"&&n.kind=="Image"){auto a=str(e,v);ints(h,NODE_IMAGE_OBJECT_FIT,{a=="contain"?0:a=="stretch"?2:1});}
    else if(k=="scrollEnabled")ints(h,NODE_SCROLL_ENABLE_SCROLL_INTERACTION,{boolean(e,v)});
    else if(k=="showsVerticalScrollIndicator")ints(h,NODE_SCROLL_BAR_DISPLAY_MODE,{boolean(e,v)?1:0});
    else if(k=="spans"&&n.kind=="RichText"){
      for(auto span:n.spans){rendererNodes.erase(span);api->removeChild(h,span);api->disposeNode(span);}n.spans.clear();n.spanColors.clear();
      auto spans=parse(e,v);uint32_t length;check(napi_get_array_length(e,spans,&length)==napi_ok&&length<=65536,"INVALID_SPANS");
      for(uint32_t j=0;j<length;j++){napi_value span;napi_get_element(e,spans,j,&span);auto child=api->createNode(ARKUI_NODE_SPAN);check(child,"SPAN_CREATE_FAILED");n.spans.push_back(child);rendererNodes[child]=&n;n.spanColors.push_back({has(e,span,"color")?str(e,property(e,span,"color")):"",has(e,span,"dmColor")?str(e,property(e,span,"dmColor")):""});text(child,NODE_SPAN_CONTENT,str(e,property(e,span,"text")));
        if(has(e,span,"fontSize"))floats(child,NODE_FONT_SIZE,{static_cast<float>(number(e,property(e,span,"fontSize")))});
        if(has(e,span,"color"))ints(child,NODE_FONT_COLOR,{static_cast<int32_t>(color(str(e,property(e,span,n.surface->dark&&has(e,span,"dmColor")?"dmColor":"color"))))});
        if(has(e,span,"fontWeight"))ints(child,NODE_FONT_WEIGHT,{str(e,property(e,span,"fontWeight"))=="bold"?ARKUI_FONT_WEIGHT_BOLD:ARKUI_FONT_WEIGHT_NORMAL});
        if(has(e,span,"fontStyle"))ints(child,NODE_FONT_STYLE,{str(e,property(e,span,"fontStyle"))=="italic"?1:0});
        if(has(e,span,"textDecorationLine")){auto d=str(e,property(e,span,"textDecorationLine"));ints(child,NODE_TEXT_DECORATION,{d=="underline"?1:d=="line-through"?2:0});}
        check(api->addChild(h,child)==0,"SPAN_ATTACH_FAILED");api->registerNodeEvent(child,NODE_ON_CLICK,1000+static_cast<int32_t>(j),&n);
      }
    }
  }
  // SetProps is a full snapshot. Reset removed attributes rather than retaining stale values.
  const std::map<std::string,ArkUI_NodeAttributeType> defaults={{"fontSize",NODE_FONT_SIZE},{"fontWeight",NODE_FONT_WEIGHT},{"fontStyle",NODE_FONT_STYLE},{"textAlign",NODE_TEXT_ALIGN},{"numberOfLines",NODE_TEXT_MAX_LINES},{"ellipsizeMode",NODE_TEXT_OVERFLOW},{"visibility",NODE_VISIBILITY},{"overflow",NODE_CLIP},{"testID",NODE_ID},{"accessibilityLabel",NODE_ACCESSIBILITY_TEXT},{"textDecorationLine",NODE_TEXT_DECORATION}};
  for(auto &entry:defaults)if(n.declared.count(entry.first)&&!has(e,p,entry.first.c_str()))api->resetAttribute(n.handle,entry.second);
  const auto previousDeclared=n.declared; n.declared.clear();for(uint32_t i=0;i<count;i++){napi_value key;napi_get_element(e,keys,i,&key);n.declared.insert(str(e,key));}
  if(!has(e,p,"scrollAnchorOffset"))n.nextAnchor=0;
  if(!has(e,p,"touchAction"))n.touchAction="auto";
  const bool enabled=(!has(e,p,"disabled")||!boolean(e,property(e,p,"disabled")))&&(!has(e,p,"editable")||boolean(e,property(e,p,"editable")));
  if(n.enabled!=enabled){n.enabled=enabled;ints(n.handle,NODE_ENABLED,{n.enabled?1:0});}
  if(n.kind=="TextInput") {
    if(previousDeclared.count("placeholder")&&!has(e,p,"placeholder"))api->resetAttribute(n.handle,NODE_TEXT_INPUT_PLACEHOLDER);
    if(previousDeclared.count("maxLength")&&!has(e,p,"maxLength"))api->resetAttribute(n.handle,NODE_TEXT_INPUT_MAX_LENGTH);
    if((previousDeclared.count("keyboardType")||previousDeclared.count("secureTextEntry"))&&!has(e,p,"keyboardType")&&!has(e,p,"secureTextEntry"))api->resetAttribute(n.handle,NODE_TEXT_INPUT_TYPE);
    if(previousDeclared.count("returnKeyType")&&!has(e,p,"returnKeyType"))api->resetAttribute(n.handle,NODE_TEXT_INPUT_ENTER_KEY_TYPE);
  }
  if(n.kind=="ScrollView") {
    // The scroll viewport must clip hit testing as well as drawing.
    ints(n.handle,NODE_CLIP,{1});
    if(!has(e,p,"scrollEnabled"))ints(n.handle,NODE_SCROLL_ENABLE_SCROLL_INTERACTION,{1});
    if(!has(e,p,"showsVerticalScrollIndicator"))api->resetAttribute(n.handle,NODE_SCROLL_BAR_DISPLAY_MODE);
  }
  if(n.kind=="Image"&&!has(e,p,"placeholderSrc"))api->resetAttribute(n.handle,NODE_IMAGE_ALT);
  if(affects({"accessible","accessibilityLabel","accessibilityRole","accessibilityHint","accessibilityValue","accessibilityHidden","accessibilityChecked","accessibilitySelected","accessibilityClickable","accessibilityLongClickable","disabled"}))accessibility(n);
  if(!changed||affects(visualNumbers)||affects(visualStrings)||affects({"glassEffect","glassEffectContainer","glassEffectInteractive","glassEffectSpacing"}))visual(n);
}
void apply(napi_env e,Surface &s,napi_value p){
  if(str(e,property(e,p,"type"))=="ResetSurface"){while(!s.nodes.empty())s.remove(s.nodes.begin()->first);s.revision=0;s.lastCommands.clear();s.touches.clear();return;}
  uint32_t revision=integer(e,property(e,p,"revision"));auto commands=property(e,p,"commands");const auto signature=stringify(e,commands);if(revision==s.revision){check(signature==s.lastCommands,"CONFLICTING_COMMIT");return;}check(revision>s.revision,"COMMIT_REVISION_MISMATCH");uint32_t length;check(napi_get_array_length(e,commands,&length)==napi_ok&&length<=65536,"COMMAND_LIMIT");
  anseronui::TopologyDraft topology([&](uint32_t id){return s.nodes.count(id)>0;},[&](uint32_t id){if(!id)return anseronui::TopologyEntry{"View",0,s.roots};auto &n=s.get(id);return anseronui::TopologyEntry{n.kind,n.parent,n.children};});
  const std::set<std::string> supported={"View","Text","TextInput","RichText","ScrollView","Image","Video","Native"};
  for(uint32_t i=0;i<length;i++){
    napi_value c;napi_get_element(e,commands,i,&c);auto kind=str(e,property(e,c,"type"));auto id=integer(e,property(e,c,"nodeId"));
    if(kind=="CreateNode"){auto nodeKind=str(e,property(e,c,"kind"));check(supported.count(nodeKind),"UNSUPPORTED_NODE");topology.create(id,nodeKind);if(nodeKind=="Native")check(anseronui::factories().count(str(e,property(e,c,"nativeName"))),"NATIVE_COMPONENT_UNREGISTERED");continue;}
    topology.check(id);
    if(kind=="InsertChild"||kind=="MoveChild")topology.attach(id,integer(e,property(e,c,"parentId"),true),integer(e,property(e,c,"index"),true));
    else if(kind=="DetachChild")topology.detach(id);
    else if(kind=="RemoveNode")topology.remove(id);
    else if(kind=="SetFrame"){auto frame=property(e,c,"frame");number(e,property(e,frame,"x"));number(e,property(e,frame,"y"));check(number(e,property(e,frame,"width"))>=0&&number(e,property(e,frame,"height"))>=0,"INVALID_FRAME");}
    else if(kind=="PatchProps"){
      auto set=property(e,c,"set"),unset=property(e,c,"unset");check(has(e,set,"value")==has(e,set,"inputRevision"),"INVALID_INPUT_PAIR");uint32_t count;check(napi_get_array_length(e,unset,&count)==napi_ok,"INVALID_UNSET");std::set<std::string> keys;
      for(uint32_t j=0;j<count;j++){napi_value key;napi_get_element(e,unset,j,&key);auto name=str(e,key);check(!has(e,set,name.c_str())&&keys.insert(name).second,"INVALID_UNSET");}check(keys.count("value")==keys.count("inputRevision"),"INVALID_INPUT_PAIR");
    }else if(kind=="BindEvent"){boolean(e,property(e,c,"enabled"));str(e,property(e,c,"event"));}
    else check(kind=="SetProps","UNKNOWN_COMMAND");
  }
  // Core may be behind the native viewport. Retain the rows actually visible
  // before this transaction, rather than applying a stale Core anchor blindly.
  for(auto &entry:s.nodes){auto &n=*entry.second;if(n.kind=="ScrollView"&&n.declared.count("scrollAnchorOffset"))n.scrollAnchor.capture(scrollRows(n),scrollOffset(n)+n.scrollAnchor.pending,n.height);}
  std::set<uint32_t> touchedScroll;
  for(uint32_t i=0;i<length;i++){
    napi_value c;napi_get_element(e,commands,i,&c);std::string kind=str(e,property(e,c,"type"));uint32_t id=integer(e,property(e,c,"nodeId"));
    if(kind=="CreateNode"){
      check(!s.nodes.count(id)&&s.nodes.size()<100000,"DUPLICATE_NODE_OR_LIMIT");auto n=std::make_unique<Node>();n->id=id;n->surface=&s;n->kind=str(e,property(e,c,"kind"));
      ArkUI_NodeType t=ARKUI_NODE_STACK;
      if(n->kind=="Text"||n->kind=="RichText")t=ARKUI_NODE_TEXT;else if(n->kind=="TextInput")t=ARKUI_NODE_TEXT_INPUT;else if(n->kind=="ScrollView")t=ARKUI_NODE_SCROLL;else if(n->kind=="Image")t=ARKUI_NODE_IMAGE;else if(n->kind!="Native")check(n->kind=="View"||n->kind=="Video","UNSUPPORTED_NODE");
      if(n->kind=="Native"){
        std::string name=str(e,property(e,c,"nativeName"));auto factory=anseronui::factories().find(name);check(factory!=anseronui::factories().end(),"NATIVE_COMPONENT_UNREGISTERED");Node *raw=n.get();
        n->custom=factory->second([raw,alive=n->alive](const std::string &bytes){if(!*alive)return;auto &surface=*raw->surface;if(!surface.visible||raw->updating||!raw->events.count("nativeComponent"))return;napi_env env=surface.env;napi_value p;napi_create_object(env,&p);put(env,p,"type",jsstr(env,"NativeEvent"));putnum(env,p,"nodeId",raw->id);putnum(env,p,"revision",surface.revision);put(env,p,"event",jsstr(env,"nativeComponent"));put(env,p,"value",jsstr(env,bytes));surface.notify(p);});
        n->handle=n->custom.node;n->container=n->custom.content;check(n->handle,"NATIVE_CREATE_FAILED");
      }
      if(n->kind!="Native"){n->handle=api->createNode(t);n->container=n->handle;}check(n->handle,"NODE_CREATE_FAILED");
      if(n->kind=="Video"){napi_value arg;napi_create_uint32(e,id,&arg);auto frame=s.mediaCall("create",1,&arg);check(OH_ArkUI_GetNodeHandleFromNapiValue(e,frame,&n->mediaNode)==0&&n->mediaNode,"VIDEO_CREATE_FAILED");check(api->addChild(n->handle,n->mediaNode)==0,"VIDEO_ATTACH_FAILED");}
      if(n->kind=="View")ints(n->handle,NODE_ALIGNMENT,{0});
      if(n->kind=="TextInput"){ints(n->handle,NODE_FOCUSABLE,{1});}
      if(n->kind=="ScrollView"){n->container=api->createNode(ARKUI_NODE_STACK);ints(n->container,NODE_ALIGNMENT,{0});api->addChild(n->handle,n->container);}
      registerEvents(*n);s.nodes[id]=std::move(n);
    }else if(kind=="RemoveNode"){for(auto ancestor=s.get(id).parent;ancestor;ancestor=s.get(ancestor).parent)if(s.get(ancestor).kind=="ScrollView")touchedScroll.insert(ancestor);s.remove(id);}
    else {
      Node &n=s.get(id);
      bool anchorChanged=false;
      if(kind=="SetProps")anchorChanged=has(e,property(e,c,"props"),"scrollAnchorOffset")||n.declared.count("scrollAnchorOffset");
      if(kind=="PatchProps"){anchorChanged=has(e,property(e,c,"set"),"scrollAnchorOffset");auto unset=property(e,c,"unset");uint32_t count;napi_get_array_length(e,unset,&count);for(uint32_t j=0;j<count;j++){napi_value key;napi_get_element(e,unset,j,&key);if(str(e,key)=="scrollAnchorOffset")anchorChanged=true;}}
      if(kind=="SetFrame"||kind=="InsertChild"||kind=="MoveChild"||kind=="DetachChild"||anchorChanged) { if(n.kind=="ScrollView")touchedScroll.insert(id); for(auto ancestor=n.parent;ancestor;ancestor=s.get(ancestor).parent)if(s.get(ancestor).kind=="ScrollView")touchedScroll.insert(ancestor); }
      if(kind=="InsertChild"||kind=="MoveChild"){
        uint32_t parent=integer(e,property(e,c,"parentId"),true),index=integer(e,property(e,c,"index"),true);check(parent!=id,"CHILD_CYCLE");for(auto ancestor=parent;ancestor;ancestor=s.get(ancestor).parent)check(ancestor!=id,"CHILD_CYCLE");
        auto &existing=n.parent?s.get(n.parent).children:s.roots;
        if(n.parent==parent&&index<existing.size()&&existing[index]==id)continue;
        s.detach(n);auto &children=parent?s.get(parent).children:s.roots;check(index<=children.size(),"CHILD_INDEX");auto h=parent?s.get(parent).container:s.root;check(h,"NATIVE_CHILDREN_UNSUPPORTED");check(api->insertChildAt(h,n.handle,index)==0,"INSERT_FAILED");children.insert(children.begin()+index,id);n.parent=parent;
        for(auto ancestor=parent;ancestor;ancestor=s.get(ancestor).parent)if(s.get(ancestor).kind=="ScrollView")touchedScroll.insert(ancestor);
      }else if(kind=="SetFrame"){
        auto f=property(e,c,"frame");float x=number(e,property(e,f,"x")),y=number(e,property(e,f,"y")),w=number(e,property(e,f,"width")),h=number(e,property(e,f,"height"));check(w>=0&&h>=0,"INVALID_FRAME");n.x=x;n.y=y;n.width=w;n.height=h;
        // Public layout attributes request ArkUI's normal measure/layout pass.
        // Never call measureNode/layoutNode outside a custom layout callback.
        floats(n.handle,NODE_POSITION,{x,y});floats(n.handle,NODE_WIDTH,{w});floats(n.handle,NODE_HEIGHT,{h});
      }else if(kind=="DetachChild")s.detach(n);
      else if(kind=="PatchProps"){
        auto merged=parse(e,jsstr(e,n.declaredJSON)),set=property(e,c,"set"),unset=property(e,c,"unset");
        napi_value keys;napi_get_property_names(e,set,&keys);uint32_t count;napi_get_array_length(e,keys,&count);
        for(uint32_t j=0;j<count;j++){napi_value key,value;napi_get_element(e,keys,j,&key);napi_get_property(e,set,key,&value);napi_set_property(e,merged,key,value);}
        napi_get_array_length(e,unset,&count);for(uint32_t j=0;j<count;j++){napi_value key;bool removed;napi_get_element(e,unset,j,&key);napi_delete_property(e,merged,key,&removed);}
        napi_value global,json,fn,bytes;napi_get_global(e,&global);json=property(e,global,"JSON");fn=property(e,json,"stringify");napi_call_function(e,json,fn,1,&merged,&bytes);n.declaredJSON=str(e,bytes);
        bool visualOnly=true;std::set<std::string> changed;const std::set<std::string> visualKeys={"opacity","translateX","translateY","scaleX","scaleY","rotate","borderRadius"};
        napi_get_property_names(e,set,&keys);napi_get_array_length(e,keys,&count);
        for(uint32_t j=0;j<count;j++){napi_value key;napi_get_element(e,keys,j,&key);auto name=str(e,key);changed.insert(name);if(!visualKeys.count(name))visualOnly=false;}
        napi_get_array_length(e,unset,&count);for(uint32_t j=0;j<count;j++){napi_value key;napi_get_element(e,unset,j,&key);auto name=str(e,key);changed.insert(name);if(!visualKeys.count(name))visualOnly=false;}
        if(visualOnly){for(const auto &key:visualKeys){if(has(e,merged,key.c_str()))n.numbers[key]=number(e,property(e,merged,key.c_str()));else n.numbers.erase(key);}visual(n);}else props(e,n,merged,&changed);
      }else if(kind=="SetProps")props(e,n,property(e,c,"props"));
      else if(kind=="BindEvent"){auto name=str(e,property(e,c,"event"));if(boolean(e,property(e,c,"enabled")))n.events.insert(name);else n.events.erase(name);if(name=="tap"){api->unregisterNodeEvent(n.handle,NODE_ON_CLICK);if(n.events.count(name))api->registerNodeEvent(n.handle,NODE_ON_CLICK,0,&n);}if(name=="longPress"){bindLongPress(n);if(n.longPress)OH_ArkUI_SetGestureRecognizerEnabled(n.longPress,n.events.count(name)>0);}accessibility(n);}
      else check(false,"UNKNOWN_COMMAND");
    }
  }
  s.revision=revision;s.lastCommands=signature;
  for(auto id:touchedScroll) {if(!s.nodes.count(id))continue;auto &n=s.get(id);if(n.kind!="ScrollView")continue;
    float w=n.width,h=n.height;for(auto id:n.children){auto &c=s.get(id);w=std::max(w,c.x+c.width);h=std::max(h,c.y+c.height);}
    floats(n.container,NODE_WIDTH,{w});floats(n.container,NODE_HEIGHT,{h});
    float delta=n.nextAnchor-n.anchor;n.anchor=n.nextAnchor;
    if(n.declared.count("scrollAnchorOffset"))delta=n.scrollAnchor.reconcile(scrollRows(n),delta);
#ifdef ANSERONUI_SCROLL_TRACE
    if(delta!=0)OH_LOG_Print(LOG_APP,LOG_WARN,0,"AnseronScroll","anchor node=%{public}u delta=%{public}.3f active=%{public}d",n.id,delta,n.scrollAnchor.scrolling);
#endif
    if(delta!=0)n.scrollAnchor.stage(delta,scrollOffset(n),h-n.height);
    if(n.scrollAnchor.scrolling)anchorTransform(n);else flushAnchor(n);
  }
}

template<napi_value(*F)(napi_env,napi_callback_info)> napi_value safe(napi_env e,napi_callback_info i){try{return F(e,i);}catch(const std::exception &ex){bool pending=false;napi_is_exception_pending(e,&pending);if(!pending)napi_throw_error(e,nullptr,ex.what());return undefined(e);}}
napi_value open(napi_env e,napi_callback_info i){auto a=arguments(e,i,1);auto &s=state(e);check(s.nextWorker!=0,"WORKER_ID_EXHAUSTED");uint32_t id=s.nextWorker++;auto w=std::make_shared<Worker>(e,a[0]);s.workers[id]=w;napi_value v;napi_create_uint32(e,id,&v);return v;}
napi_value post(napi_env e,napi_callback_info i){
  auto a=arguments(e,i,4);auto id=integer(e,a[0]);auto &workers=state(e).workers;check(workers.count(id),"WORKER_NOT_FOUND");
  const auto sequence=workers.at(id)->post(str(e,a[1]),str(e,a[2]),integer(e,a[3]),[&](uint32_t retained){
    auto envelope=parse(e,a[1]);putnum(e,envelope,"sequence",retained);
    napi_value global,json,fn,bytes;napi_get_global(e,&global);json=property(e,global,"JSON");fn=property(e,json,"stringify");
    check(napi_call_function(e,json,fn,1,&envelope,&bytes)==napi_ok,"INVALID_JSON");return str(e,bytes);
  });
  napi_value result;napi_create_uint32(e,sequence,&result);return result;
}
napi_value profile(napi_env e,napi_callback_info i){auto a=arguments(e,i,3);auto &workers=state(e).workers;auto id=integer(e,a[0]);check(workers.count(id),"WORKER_NOT_FOUND");auto m=workers.at(id)->metrics;const bool enabled=boolean(e,a[1]);if(boolean(e,a[2])){m->generation++;m->stepNs=0;m->queueNs=0;}m->enabled=enabled;return undefined(e);}
napi_value performance(napi_env e,napi_callback_info i){auto a=arguments(e,i,1);auto &workers=state(e).workers;auto id=integer(e,a[0]);check(workers.count(id),"WORKER_NOT_FOUND");auto m=workers.at(id)->metrics;napi_value result;napi_create_object(e,&result);putnum(e,result,"adapterStepMs",m->stepNs.load()/1000000.);putnum(e,result,"uiQueueMs",m->queueNs.load()/1000000.);return result;}
napi_value close(napi_env e,napi_callback_info i){auto a=arguments(e,i,1);auto &workers=state(e).workers;auto it=workers.find(integer(e,a[0]));if(it!=workers.end()){it->second->stop();workers.erase(it);}return undefined(e);}
napi_value mount(napi_env e,napi_callback_info i){auto a=arguments(e,i,4);float density=number(e,a[3]);check(density>0,"INVALID_DENSITY");auto &s=state(e);check(s.nextSurface!=0,"SURFACE_ID_EXHAUSTED");uint32_t id=s.nextSurface++;s.surfaces[id]=std::make_unique<Surface>(e,a[0],a[1],a[2],density);napi_value v;napi_create_uint32(e,id,&v);return v;}
napi_value commit(napi_env e,napi_callback_info i){auto a=arguments(e,i,2);uint32_t id=integer(e,a[0]);auto &surfaces=state(e).surfaces;check(surfaces.count(id),"SURFACE_NOT_FOUND");auto bytes=str(e,a[1],16777216);check(bytes.size()<=16777216,"MESSAGE_LIMIT");apply(e,*surfaces.at(id),parse(e,a[1]));return undefined(e);}
napi_value unmount(napi_env e,napi_callback_info i){auto a=arguments(e,i,1);state(e).surfaces.erase(integer(e,a[0]));return undefined(e);}
napi_value invokeView(napi_env e,napi_callback_info i){auto a=arguments(e,i,4);auto &surfaces=state(e).surfaces;uint32_t surface=integer(e,a[0]);check(surfaces.count(surface),"SURFACE_NOT_FOUND");auto &n=surfaces.at(surface)->get(integer(e,a[1]));std::string method=str(e,a[2]);auto value=parse(e,a[3]);
  if(method=="accessibilityAnnounce")return undefined(e); // Existence check; ArkTS sends the system event.
  if(method=="accessibilityFocus"){
    for(auto *current=&n;current;current=current->parent?&current->surface->get(current->parent):nullptr){auto *mode=api->getAttribute(current->handle,NODE_ACCESSIBILITY_MODE);if(mode&&mode->size)check(mode->value[0].i32!=ARKUI_ACCESSIBILITY_MODE_DISABLED_FOR_DESCENDANTS&&(current!=&n||mode->value[0].i32!=ARKUI_ACCESSIBILITY_MODE_DISABLED),"NOT_ACCESSIBLE");}
    auto *id=api->getAttribute(n.handle,NODE_ID);std::string target=id&&id->string?id->string:"";
    if(target.empty()){target="anseronui-"+std::to_string(reinterpret_cast<uintptr_t>(n.surface))+"-"+std::to_string(n.id);text(n.handle,NODE_ID,target);}
    return jsstr(e,target);
  }
  if(method=="focus"||method=="blur"){if(n.kind!="TextInput"&&n.custom.invoke)return n.custom.invoke(e,method,str(e,a[3]));check(n.kind=="TextInput","NOT_FOCUSABLE");if(method=="focus"){auto result=OH_ArkUI_FocusRequest(n.handle);check(result==0,("FOCUS_REQUEST_FAILED: "+std::to_string(result)).c_str());}else ints(n.handle,NODE_FOCUS_STATUS,{0});return undefined(e);}
  if(method=="scrollTo"){if(n.kind!="ScrollView"&&n.custom.invoke)return n.custom.invoke(e,method,str(e,a[3]));check(n.kind=="ScrollView","NOT_SCROLLABLE");n.scrollAnchor.consume();anchorTransform(n);n.scrollAnchor.scrolling=false;
#ifdef ANSERONUI_SCROLL_TRACE
  scrollTraceFrames.erase(&n);
#endif
#ifdef ANSERONUI_SCROLL_TRACE
  OH_LOG_Print(LOG_APP,LOG_WARN,0,"AnseronScroll","jump node=%{public}u target=%{public}.3f",n.id,number(e,property(e,value,"y")));
#endif
  ArkUI_NumberValue values[3]{};values[0].f32=number(e,property(e,value,"x"));values[1].f32=number(e,property(e,value,"y"));values[2].i32=has(e,value,"animated")&&boolean(e,property(e,value,"animated"))?250:0;ArkUI_AttributeItem item{values,3,nullptr,nullptr};check(api->setAttribute(n.handle,NODE_SCROLL_OFFSET,&item)==0,"SCROLL_FAILED");return undefined(e);}
  if(method=="measure"){napi_value result;napi_create_object(e,&result);float x,y;origin(n,x,y);putnum(e,result,"x",x);putnum(e,result,"y",y);putnum(e,result,"width",n.width);putnum(e,result,"height",n.height);return result;}
  if(method=="getVisual"){napi_value result;napi_create_object(e,&result);for(auto &v:n.numbers)putnum(e,result,v.first.c_str(),v.second);for(auto &v:n.strings)put(e,result,v.first.c_str(),jsstr(e,v.second));auto *position=api->getAttribute(n.handle,NODE_POSITION);float x=position?position->value[0].f32:n.x,y=position?position->value[1].f32:n.y;auto *width=api->getAttribute(n.handle,NODE_WIDTH);float w=width?width->value[0].f32:n.width;auto *height=api->getAttribute(n.handle,NODE_HEIGHT);float h=height?height->value[0].f32:n.height;putnum(e,result,"x",x);putnum(e,result,"y",y);putnum(e,result,"width",w);putnum(e,result,"height",h);return result;}
  if(method=="setVisual"){napi_value keys;napi_get_property_names(e,value,&keys);uint32_t size;napi_get_array_length(e,keys,&size);check(size<=32,"VISUAL_LIMIT");for(uint32_t j=0;j<size;j++){napi_value key;napi_get_element(e,keys,j,&key);auto k=str(e,key);auto v=property(e,value,k.c_str());if(k=="backgroundColor")n.strings[k]=str(e,v);else if(k=="x"||k=="y"){auto *pos=api->getAttribute(n.handle,NODE_POSITION);float x=pos?pos->value[0].f32:n.x,y=pos?pos->value[1].f32:n.y;floats(n.handle,NODE_POSITION,{k=="x"?static_cast<float>(number(e,v)):x,k=="y"?static_cast<float>(number(e,v)):y});}else if(k=="width"||k=="height")floats(n.handle,k=="width"?NODE_WIDTH:NODE_HEIGHT,{static_cast<float>(number(e,v))});else n.numbers[k]=number(e,v);}visual(n);return undefined(e);}
  if(n.custom.invoke)return n.custom.invoke(e,method,str(e,a[3]));
  throw std::runtime_error("UNSUPPORTED: __view."+method);
}
napi_value mediaEvent(napi_env e,napi_callback_info i){auto a=arguments(e,i,3);auto &surfaces=state(e).surfaces;uint32_t id=integer(e,a[0]);auto surface=surfaces.find(id);if(surface==surfaces.end())return undefined(e);auto node=surface->second->nodes.find(integer(e,a[1]));if(node==surface->second->nodes.end())return undefined(e);auto event=parse(e,a[2]);auto name=str(e,property(e,event,"event"));if(!node->second->events.count(name))return undefined(e);put(e,event,"type",jsstr(e,"NativeEvent"));putnum(e,event,"nodeId",node->first);putnum(e,event,"revision",surface->second->revision);surface->second->notify(event);return undefined(e);}
napi_value appearance(napi_env e,napi_callback_info i){auto a=arguments(e,i,2);auto &surfaces=state(e).surfaces;uint32_t id=integer(e,a[0]);check(surfaces.count(id),"SURFACE_NOT_FOUND");auto &surface=*surfaces.at(id);surface.dark=boolean(e,a[1]);for(auto &entry:surface.nodes)visual(*entry.second);return undefined(e);}
napi_value visibility(napi_env e,napi_callback_info i){auto a=arguments(e,i,2);auto &surfaces=state(e).surfaces;uint32_t id=integer(e,a[0]);check(surfaces.count(id),"SURFACE_NOT_FOUND");auto &s=*surfaces.at(id);s.visible=boolean(e,a[1]);if(!s.visible)s.touches.clear();return undefined(e);}
napi_value supportsModule(napi_env e,napi_callback_info i){auto a=arguments(e,i,2);auto module=str(e,a[0]),method=str(e,a[1]);bool found=false;for(auto &p:anseronui::providers())if(p.supports(module,method)){check(!found,"DUPLICATE_MODULE");found=true;}napi_value v;napi_get_boolean(e,found,&v);return v;}
napi_value invokeModule(napi_env e,napi_callback_info i){auto a=arguments(e,i,3);auto module=str(e,a[0]),method=str(e,a[1]),args=str(e,a[2]);anseronui::Provider *found=nullptr;for(auto &p:anseronui::providers())if(p.supports(module,method)){check(!found,"DUPLICATE_MODULE");found=&p;}check(found,"UNSUPPORTED_MODULE");return found->invoke(e,module,method,args);}
napi_value version(napi_env e,napi_callback_info){napi_value v;napi_create_uint32(e,21,&v);return v;}
napi_value Init(napi_env e,napi_value exports){
  OH_ArkUI_GetModuleInterface(ARKUI_NATIVE_NODE,ArkUI_NativeNodeAPI_1,api);check(api,"ARKUI_API_UNAVAILABLE");api->registerNodeEventReceiver(eventReceiver);
  napi_property_descriptor d[]={
    {"profile",nullptr,safe<profile>,nullptr,nullptr,nullptr,napi_default,nullptr},{"performance",nullptr,safe<performance>,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"visibility",nullptr,safe<visibility>,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"mediaEvent",nullptr,safe<mediaEvent>,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"invokeView",nullptr,safe<invokeView>,nullptr,nullptr,nullptr,napi_default,nullptr},{"appearance",nullptr,safe<appearance>,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"supportsModule",nullptr,safe<supportsModule>,nullptr,nullptr,nullptr,napi_default,nullptr},{"invokeModule",nullptr,safe<invokeModule>,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"open",nullptr,safe<open>,nullptr,nullptr,nullptr,napi_default,nullptr},{"post",nullptr,safe<post>,nullptr,nullptr,nullptr,napi_default,nullptr},{"close",nullptr,safe<close>,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"mount",nullptr,safe<mount>,nullptr,nullptr,nullptr,napi_default,nullptr},{"commit",nullptr,safe<commit>,nullptr,nullptr,nullptr,napi_default,nullptr},{"unmount",nullptr,safe<unmount>,nullptr,nullptr,nullptr,napi_default,nullptr},{"version",nullptr,safe<version>,nullptr,nullptr,nullptr,napi_default,nullptr}};
  napi_define_properties(e,exports,sizeof(d)/sizeof(d[0]),d);
  auto *environment=new Environment();napi_set_instance_data(e,environment,nullptr,nullptr);
  napi_add_env_cleanup_hook(e,[](void *data){delete static_cast<Environment*>(data);},environment);return exports;
}
napi_module module={1,0,nullptr,Init,"anseronui",nullptr,{0}};
}
extern "C" __attribute__((constructor)) void RegisterAnseronUI(){napi_module_register(&module);}
