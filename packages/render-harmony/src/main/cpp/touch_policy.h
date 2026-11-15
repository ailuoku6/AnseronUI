#ifndef ANSERONUI_HARMONY_TOUCH_POLICY_H
#define ANSERONUI_HARMONY_TOUCH_POLICY_H
#include <string>
namespace anseronui {
struct TouchPolicy {
  bool horizontal = true;
  bool vertical = true;
  void intersect(const std::string &action) {
    horizontal = horizontal && action != "none" && action != "pan-y";
    vertical = vertical && action != "none" && action != "pan-x";
  }
};
}
#endif
