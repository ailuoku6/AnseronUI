#pragma once
#include <algorithm>
#include <cstdint>
#include <functional>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace anseronui {
struct TopologyEntry { std::string kind; uint32_t parent; std::vector<uint32_t> children; };
// A transaction overlay over the renderer's committed graph. Paint validation
// only checks node existence; structural edits copy the affected child lists.
class TopologyDraft {
  std::function<bool(uint32_t)> exists;
  std::function<TopologyEntry(uint32_t)> read;
  std::map<uint32_t, TopologyEntry> edits;
  std::set<uint32_t> removed;
  static void require(bool value) { if (!value) throw std::runtime_error("INVALID_RENDER_TOPOLOGY"); }
  TopologyEntry &entry(uint32_t id) {
    require(!removed.count(id));
    auto found = edits.find(id);
    if (found != edits.end()) return found->second;
    require(id == 0 || exists(id));
    return edits.emplace(id, read(id)).first->second;
  }
  void erase(uint32_t id) {
    auto children = entry(id).children;
    for (auto child : children) erase(child);
    removed.insert(id); edits.erase(id);
  }
public:
  TopologyDraft(std::function<bool(uint32_t)> contains, std::function<TopologyEntry(uint32_t)> lookup)
      : exists(std::move(contains)), read(std::move(lookup)) {}
  void check(uint32_t id) const { require(id && !removed.count(id) && (edits.count(id) || exists(id))); }
  void create(uint32_t id, const std::string &kind) {
    require(id && !exists(id) && !edits.count(id) && !removed.count(id));
    edits.emplace(id, TopologyEntry{kind, 0, {}});
  }
  void detach(uint32_t id) {
    check(id); auto &node = entry(id); auto &children = entry(node.parent).children;
    children.erase(std::remove(children.begin(), children.end(), id), children.end()); node.parent = 0;
  }
  void attach(uint32_t id, uint32_t parent, uint32_t index) {
    check(id);
    if (parent) { check(parent); const auto &kind = entry(parent).kind; require(kind == "View" || kind == "ScrollView" || kind == "Native"); }
    for (auto ancestor = parent; ancestor; ancestor = entry(ancestor).parent) require(ancestor != id);
    detach(id); auto &children = entry(parent).children; require(index <= children.size());
    children.insert(children.begin() + index, id); entry(id).parent = parent;
  }
  void remove(uint32_t id) { detach(id); erase(id); }
};
}
