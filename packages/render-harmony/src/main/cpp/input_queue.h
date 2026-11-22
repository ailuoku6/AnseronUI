#ifndef ANSERONUI_HARMONY_INPUT_QUEUE_H
#define ANSERONUI_HARMONY_INPUT_QUEUE_H
#include <cstdint>
#include <deque>
#include <stdexcept>
#include <string>
#include <utility>

namespace anseronui {
// The worker mutex guards every operation. Only the unconsumed tail can be
// replaced: other pointers, inputs and lifecycle messages are ordering barriers.
class InputQueue {
  struct Input { std::string bytes, key; uint32_t sequence; };
  std::deque<Input> inputs;
  const size_t limit;
public:
  explicit InputQueue(size_t limit): limit(limit) {}
  bool empty() const { return inputs.empty(); }
  template<class EncodeReplacement>
  uint32_t push(std::string bytes, std::string key, uint32_t sequence, EncodeReplacement encode) {
    if (!key.empty() && !inputs.empty() && inputs.back().key == key) {
      const auto retained = inputs.back().sequence;
      // Encode first so a failed replacement leaves the original queue intact.
      inputs.back().bytes = encode(retained);
      return retained;
    }
    if (inputs.size() >= limit) throw std::runtime_error("CORE_QUEUE_LIMIT");
    inputs.push_back({std::move(bytes), std::move(key), sequence});
    return sequence;
  }
  std::string pop() {
    auto bytes = std::move(inputs.front().bytes);
    inputs.pop_front();
    return bytes;
  }
};
}
#endif
