// Repository demo plugin. Standalone applications register their own extensions.
#include "extensions.h"
#include <arkui/native_interface.h>
#include <memory>
#include <algorithm>
#include <stdexcept>
namespace {
struct Toggle {
  ArkUI_NativeNodeAPI_1* api;
  ArkUI_NodeHandle node;
  anseronui::Emit emit;
  bool value=false;
  void set(bool next) {
    if(value==next)return;
    value=next; ArkUI_NumberValue v{};v.i32=value;ArkUI_AttributeItem item{&v,1,nullptr,nullptr};
    if(api->setAttribute(node,NODE_TOGGLE_VALUE,&item))throw std::runtime_error("TOGGLE_UPDATE_FAILED");
  }
  void changed(bool next) {if(value==next)return;value=next;emit(value?R"({"name":"change","data":{"value":true}})":R"({"name":"change","data":{"value":false}})");}
  static void receive(ArkUI_NodeEvent* event) {
    if(OH_ArkUI_NodeEvent_GetEventType(event)!=NODE_TOGGLE_ON_CHANGE)return;
    auto self=static_cast<Toggle*>(OH_ArkUI_NodeEvent_GetUserData(event));
    auto data=OH_ArkUI_NodeEvent_GetNodeComponentEvent(event);if(self&&data)self->changed(data->data[0].i32!=0);
  }
};
napi_value object(napi_env env,const char* key,bool value) {napi_value o,v;napi_create_object(env,&o);napi_get_boolean(env,value,&v);napi_set_named_property(env,o,key,v);return o;}
__attribute__((constructor)) void registerDemo() {
  anseronui::registerComponent("DemoSwitch",[](anseronui::Emit emit){
    ArkUI_NativeNodeAPI_1* api=nullptr;OH_ArkUI_GetModuleInterface(ARKUI_NATIVE_NODE,ArkUI_NativeNodeAPI_1,api);
    if(!api)throw std::runtime_error("ARKUI_API_UNAVAILABLE");
    auto state=std::make_shared<Toggle>();state->api=api;state->node=api->createNode(ARKUI_NODE_TOGGLE);state->emit=std::move(emit);
    if(!state->node)throw std::runtime_error("TOGGLE_CREATE_FAILED");
    api->addNodeEventReceiver(state->node,Toggle::receive);api->registerNodeEvent(state->node,NODE_TOGGLE_ON_CHANGE,0,state.get());
    anseronui::NativeComponent component;component.node=state->node;
    component.setProps=[state](const std::string& json){
      // The public demo contract contains one boolean; reject malformed payloads.
      auto compact=json;compact.erase(std::remove_if(compact.begin(),compact.end(),[](unsigned char c){return c==' '||c=='\n'||c=='\r'||c=='\t';}),compact.end());
      if(compact=="{\"value\":true}")state->set(true);else if(compact=="{\"value\":false}"||compact=="{}")state->set(false);else throw std::runtime_error("INVALID_ARGUMENT: DemoSwitch.value");
    };
    component.invoke=[state](napi_env env,const std::string& method,const std::string&){
      if(method!="toggle")throw std::runtime_error("UNSUPPORTED: DemoSwitch."+method);state->set(!state->value);return object(env,"value",state->value);
    };
    component.dispose=[state]{state->api->unregisterNodeEvent(state->node,NODE_TOGGLE_ON_CHANGE);state->api->removeNodeEventReceiver(state->node,Toggle::receive);state->api->disposeNode(state->node);};
    return component;
  });
  anseronui::registerModule([](const std::string& module,const std::string& method){return module=="device"&&(method=="info"||method.empty());},[](napi_env env,const std::string&,const std::string&,const std::string&){
    napi_value result,platform;napi_create_object(env,&result);napi_create_string_utf8(env,"harmony",NAPI_AUTO_LENGTH,&platform);napi_set_named_property(env,result,"platform",platform);return result;
  });
}
}
