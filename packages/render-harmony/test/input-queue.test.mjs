import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('native worker queue bounds motion backlog and preserves sequence and ordering barriers', () => {
  const directory = mkdtempSync(join(tmpdir(), 'harmony-input-queue-'));
  try {
    const executable = join(directory, 'input-queue');
    const build = spawnSync(process.env.CXX ?? 'c++', ['-std=c++17', '-x', 'c++', '-', '-I', resolve('packages/render-harmony/src/main/cpp'), '-o', executable], {
      encoding: 'utf8', input: `
#include "input_queue.h"
#include <cassert>
int main() {
  anseronui::InputQueue queue(3);
  uint32_t sequence = 0;
  auto post = [&](std::string value, std::string key) {
    const auto proposed = sequence + 1;
    sequence = queue.push(std::to_string(proposed) + ":" + value, key, proposed,
      [&](uint32_t retained) { return std::to_string(retained) + ":" + value; });
  };
  post("down", "");
  assert(queue.pop() == "1:down"); // Already consumed inputs cannot be replaced.
  post("active", "move:7:8:1");
  assert(queue.pop() == "2:active");
  for (int i = 0; i < 500; ++i) post(std::to_string(i), "move:7:8:1");
  assert(sequence == 3);
  post("up", ""); post("next", "move:7:8:1");
  assert(queue.pop() == "3:499"); assert(queue.pop() == "4:up");
  assert(queue.pop() == "5:next"); assert(queue.empty());
  post("pointer1", "move:7:8:1"); post("pointer2", "move:7:8:2");
  post("target2", "move:7:9:2");
  bool limited = false;
  try { post("node2", "move:9:9:2"); } catch (const std::runtime_error &) { limited = true; }
  assert(limited && sequence == 8);
  post("latest", "move:7:9:2"); // Coalescing works even at capacity.
  assert(sequence == 8);
  bool failed = false;
  try { queue.push("bad", "move:7:9:2", 9, [](uint32_t) -> std::string { throw std::runtime_error("encode"); }); }
  catch (const std::runtime_error &) { failed = true; }
  assert(failed);
  assert(queue.pop() == "6:pointer1"); assert(queue.pop() == "7:pointer2");
  assert(queue.pop() == "8:latest");
  for (const auto &barrier : {"cancel", "ack", "measure", "visibility", "destroy"}) {
    post("before", "move:7:8:1"); post(barrier, ""); post("after", "move:7:8:1");
    assert(queue.pop().find(":before") != std::string::npos);
    assert(queue.pop().find(std::string(":") + barrier) != std::string::npos);
    assert(queue.pop().find(":after") != std::string::npos);
  }
}
` });
    assert.equal(build.status, 0, build.stderr);
    const run = spawnSync(executable, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
