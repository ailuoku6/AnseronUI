#ifndef ANSERONUI_HARMONY_EXTENSIONS_H
#define ANSERONUI_HARMONY_EXTENSIONS_H
#include <arkui/native_node.h>
#include <napi/native_api.h>
#include <functional>
#include <string>

namespace anseronui {
// Register at library initialization. All callbacks run on the ArkUI main thread.
// JSON arguments and event bytes are borrowed for the duration of the callback.
struct NativeComponent {
  ArkUI_NodeHandle node = nullptr;
  ArkUI_NodeHandle content = nullptr; // nullptr rejects children.
  std::function<void(const std::string&)> setProps;
  std::function<napi_value(napi_env,const std::string&,const std::string&)> invoke;
  std::function<void()> dispose;
};
using Emit = std::function<void(const std::string&)>;
using ComponentFactory = std::function<NativeComponent(Emit)>;
using ModuleSupports = std::function<bool(const std::string&,const std::string&)>;
using ModuleInvoke = std::function<napi_value(napi_env,const std::string&,const std::string&,const std::string&)>;
// Return a JSON-compatible NAPI value or Promise. Rejections propagate as ModuleResult errors.
void registerComponent(const std::string& name,ComponentFactory factory);
void registerModule(ModuleSupports supports,ModuleInvoke invoke);
}
#endif
