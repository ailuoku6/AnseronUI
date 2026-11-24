import assert from 'node:assert/strict';

// Read measurements of real ArkUI layout positions, not Core's requested
// frames. A retained row must move by the gesture's travel alone; measuring an
// earlier row must not produce an extra screen displacement or stop the fling.
export function verifyHarmonyScrollTrace(log) {
  const frames = [], segments = [], anchors = [], consumed = [];
  let segment;
  for (const line of log.split('\n')) {
    const kind = /AnseronScroll:\s+(frame|anchor|consume|start|stop|jump)\b/.exec(line)?.[1];
    if (!kind) continue;
    const values = Object.fromEntries([...line.matchAll(/(\w+)=(-?[\d.]+)/g)].map(([, key, value]) => [key, Number(value)]));
    // Explicit scrollToIndex replaces the viewport. The initial zero-row
    // measurement pass before that jump is not a scrolling frame.
    if (kind === 'jump') { frames.length = segments.length = anchors.length = consumed.length = 0; segment = undefined; }
    if (kind === 'start') { segment = { frames: [], anchors: [] }; segments.push(segment); }
    if (kind === 'frame') { frames.push(values); segment?.frames.push(values); }
    if (kind === 'anchor') {
      anchors.push(values);
      if (values.active && segment) segment.anchors.push({ ...values, index: segment.frames.length });
    }
    if (kind === 'consume') consumed.push(values);
    if (kind === 'stop') segment = undefined;
  }
  assert.ok(frames.length >= 120, `Missing native frame samples (${frames.length}); build Debug with ANSERONUI_SCROLL_TRACE=1`);
  const matched = frames.filter(frame => frame.matched > 0);
  assert.ok(matched.length >= 100, 'Need retained native rows across at least 100 frames');
  const maxError = Math.max(...matched.map(frame => Math.abs(frame.error)));
  const maxGap = Math.max(...frames.map(frame => frame.gap));
  assert.ok(Number.isFinite(maxError) && maxError <= 1, `Visible anchor jumped by ${maxError} vp`);
  assert.ok(Number.isFinite(maxGap) && maxGap <= 1, `Uncovered viewport: ${maxGap} vp`);
  let forward = 0, backward = 0, continued = 0;
  for (const sample of segments) {
    const deltas = sample.frames.slice(1).map((frame, index) => frame.travel - sample.frames[index].travel);
    const direction = Math.sign(deltas.find(delta => Math.abs(delta) > 0.5) ?? 0);
    if (direction > 0) forward++; else if (direction < 0) backward++;
    assert.ok(deltas.every(delta => direction * delta >= -1), 'Native travel reversed inside a single swipe');
    for (const anchor of sample.anchors) {
      const before = sample.frames.slice(0, anchor.index);
      if (before.length < 2) continue;
      const velocity = before.at(-1).travel - before.at(-2).travel;
      if (Math.abs(velocity) < 1) continue; // A naturally finishing fling may be idle next frame.
      const after = sample.frames.slice(anchor.index, anchor.index + 5);
      const travel = after.filter(frame => Math.sign(velocity) * (frame.travel - before.at(-1).travel) > 0.5);
      assert.ok(travel.length >= 3, 'Anchor correction stopped an active native fling');
      continued++;
    }
  }
  assert.ok(forward >= 2 && backward >= 2, `Need both scroll directions (${forward} forward, ${backward} backward)`);
  assert.ok(anchors.filter(anchor => anchor.active).length >= 2 && consumed.length >= 2, 'Did not exercise frame-based height corrections');
  assert.ok(continued >= 1, 'Did not observe inertia continuing through a height correction');
  return { frames: frames.length, matchedFrames: matched.length, maxAnchorErrorVp: maxError, maxViewportGapVp: maxGap,
    forwardSwipes: forward, backwardSwipes: backward, activeCorrections: anchors.filter(anchor => anchor.active).length,
    frameCorrections: consumed.length, continuedFlings: continued };
}
