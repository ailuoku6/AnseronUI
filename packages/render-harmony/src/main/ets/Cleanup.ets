/** A failing OS or extension release must not interrupt page teardown. */
export function cleanup(action: () => void): void {
  try { action(); } catch (error) { console.error('AnseronUI resource cleanup failed: ' + String(error)); }
}
