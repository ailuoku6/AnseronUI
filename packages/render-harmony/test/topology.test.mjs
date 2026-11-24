import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('native topology preflight isolates drafts, rejects cycles and preserves detached descendants', () => {
  const directory = mkdtempSync(join(tmpdir(), 'harmony-topology-'));
  try {
    const executable = join(directory, 'topology');
    const build = spawnSync(process.env.CXX ?? 'c++', ['-std=c++17', '-x', 'c++', '-', '-I', resolve('packages/render-harmony/src/main/cpp'), '-o', executable], { encoding: 'utf8', input: `
#include "render_topology.h"
#include <cassert>
int main() {
  using namespace anseronui;
  std::map<uint32_t,TopologyEntry> graph={{0,{"View",0,{1}}},{1,{"View",0,{2}}},{2,{"View",1,{3}}},{3,{"Text",2,{}}}};
  int reads=0;
  auto draft=[&]{return TopologyDraft([&](uint32_t id){return graph.count(id)>0;},[&](uint32_t id){reads++;return graph.at(id);});};
  auto failed=[](auto operation){try{operation();return false;}catch(const std::runtime_error&){return true;}};
  auto paint=draft();for(int i=0;i<10000;i++)paint.check(3);assert(reads==0);
  auto cycle=draft();assert(failed([&]{cycle.attach(1,2,0);}));assert(graph.at(0).children==std::vector<uint32_t>{1});
  auto leaf=draft();assert(failed([&]{leaf.attach(1,3,0);}));
  auto remove=draft();remove.remove(1);assert(failed([&]{remove.check(3);}));assert(graph.count(3));
  auto retained=draft();retained.detach(2);retained.remove(1);retained.attach(2,0,0);retained.check(3);
  auto order=draft();order.create(4,"View");order.attach(4,1,1);order.attach(2,1,1);
  assert(failed([&]{order.attach(4,1,10);}));assert(failed([&]{order.create(3,"View");}));
  assert(graph.at(1).children==std::vector<uint32_t>{2});
}
` });
    assert.equal(build.status, 0, build.stderr);
    const run = spawnSync(executable, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
