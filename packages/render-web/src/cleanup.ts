/** Run every release action, then report the first failure to the owner. */
export function cleanupAll(actions: Iterable<() => void>): void {
  let failed = false, failure: unknown;
  for (const action of actions) {
    try { action(); } catch (error) { if (!failed) { failed = true; failure = error; } }
  }
  if (failed) throw failure;
}
