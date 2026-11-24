import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('native VirtualList anchors use the live viewport and preserve travel across pending frames', () => {
  const directory = mkdtempSync(join(tmpdir(), 'harmony-scroll-anchor-'));
  try {
    const executable = join(directory, 'scroll-anchor');
    const build = spawnSync(process.env.CXX ?? 'c++', ['-std=c++17', '-x', 'c++', '-', '-I', resolve('packages/render-harmony/src/main/cpp'), '-o', executable], { encoding: 'utf8', input: `
#include "scroll_anchor.h"
#include <cassert>
#include <cmath>
using namespace anseronui;
bool near(float a,float b){return std::abs(a-b)<.001f;}
int main() {
  ScrollAnchor anchor;
  anchor.scrolling=true;
  std::vector<ScrollAnchorRow> before={{1,900,100},{2,1000,120},{3,1120,140},{4,1260,100}};
  // Native has scrolled back to row 1 while Core still thinks row 3 is first.
  // Measuring row 2 moves row 3, but must not move native's retained row 1.
  anchor.capture(before,950,300);
  assert(near(anchor.reconcile({{1,900,100},{2,1000,150},{3,1150,140},{4,1290,100}},30),0));
  // Conversely, an underestimated row above the LIVE viewport must compensate,
  // even when Core proposed zero. Child order need not match visual order.
  anchor.capture({{3,1120,140},{1,900,100},{2,1000,120}},1050,200);
  assert(near(anchor.reconcile({{1,900,180},{2,1080,120},{3,1200,140}},0),80));
  anchor.scrolling=true;
  float native=1050;
  anchor.stage(80,native,10000);
  assert(near(native+anchor.pending-anchor.applied,1050));
  // Multiple measurement commits before a native frame accumulate once.
  anchor.stage(25,native,10000);
  assert(near(anchor.pending,105));assert(near(anchor.applied,105));
  // Native frame moves back 40 vp and consumes correction without scrollTo.
  const float frame=-40+anchor.consume();native+=frame;
  assert(near(native+anchor.pending-anchor.applied,1010));
  assert(near(anchor.consume(),0));assert(anchor.scrolling);
  // A removed first visible row falls back to the next retained visible row.
  anchor.capture(before,950,300);
  assert(near(anchor.reconcile({{2,900,120},{3,1020,140}},500),-100));
  // If the whole window is replaced, Core's proposal is the only anchor left.
  anchor.capture(before,950,300);
  assert(near(anchor.reconcile({{20,2000,100}},75),75));
  // An idle explicit jump owns its measured target, even when the old native
  // viewport happens to intersect retained rows that move during measurement.
  anchor.scrolling=false;anchor.capture(before,1050,200);
  assert(near(anchor.reconcile({{1,900,180},{2,1080,120},{3,1200,140}},0),0));
  // Boundary clamping reports only the correction actually applied. It also
  // handles an idle correction/explicit jump consuming pending work once.
  ScrollAnchor edge;
  assert(near(edge.stage(-50,10,1000),-10));assert(near(edge.applied,-10));
  assert(near(edge.consume(),-10));
  assert(near(edge.stage(100,990,1000),10));assert(near(edge.applied,0));
  assert(near(edge.consume(),10));assert(near(edge.consume(),0));
  ScrollAnchor empty;assert(near(empty.stage(100,0,-10),0));
}
` });
    assert.equal(build.status, 0, build.stderr);
    const run = spawnSync(executable, [], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
