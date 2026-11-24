#pragma once

#include <algorithm>
#include <cstdint>
#include <vector>

namespace anseronui {
struct ScrollAnchorRow { uint32_t id; float top, height; };

// ArkUI's scrollTo AND scrollBy stop the native fling. During a gesture/fling,
// keep the correction in the content transform until onWillScroll can fold it
// into the next native frame. Logical offsets include the pending correction;
// applied excludes it from Core's velocity estimate, even before that frame.
struct ScrollAnchor {
  float pending=0, applied=0;
  bool scrolling=false;
  std::vector<ScrollAnchorRow> visible;

  void capture(const std::vector<ScrollAnchorRow> &rows,float offset,float height) {
    visible.clear();
    for(const auto &row:rows)if(row.top+row.height>offset&&row.top<offset+height)visible.push_back(row);
    std::sort(visible.begin(),visible.end(),[](const auto &a,const auto &b){return a.top<b.top;});
  }
  float reconcile(const std::vector<ScrollAnchorRow> &rows,float proposed) {
    // At rest a zero proposal can be an explicit scrollToIndex measurement.
    // Core owns that target; native anchoring must not shift it a second time.
    if(!scrolling&&proposed==0){visible.clear();return proposed;}
    for(const auto &previous:visible)for(const auto &row:rows)if(row.id==previous.id){
      const float delta=row.top-previous.top;visible.clear();return delta;
    }
    visible.clear();return proposed;
  }
  float stage(float delta,float nativeOffset,float maximum) {
    const float offset=nativeOffset+pending;
    const float correction=std::clamp(offset+delta,0.f,std::max(0.f,maximum))-offset;
    pending+=correction;applied+=correction;return correction;
  }
  float consume() { const float value=pending;pending=0;return value; }
};
}
