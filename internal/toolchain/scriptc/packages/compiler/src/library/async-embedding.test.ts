/*
 * Modified by AnseronUI contributors in 2026 for async embedding.
 * Distributed under Apache-2.0; see the scriptc LICENSE and
 * internal/toolchain/async-embedding.patch in the AnseronUI distribution.
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "vitest";
import { loadLibraryProfile } from "./library-profile.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function profile(extra: Record<string, unknown>) {
  const directory = mkdtempSync(join(tmpdir(), "async-embedding-"));
  directories.push(directory);
  const path = join(directory, "profile.json");
  writeFileSync(join(directory, "entry.ts"), "export function step(): void {}\n");
  writeFileSync(
    path,
    JSON.stringify({
      profile_format: 1,
      name: "embedding",
      entry: "entry.ts",
      emission: "llvm",
      abi: {
        prefix: "app_",
        init_symbol: "app_init",
        sink_register_symbol: "app_sink",
        collect_symbol: null,
        result_reset_symbol: null,
      },
      exports: [{ export: "step", symbol: "app_step", params: [], returns: "void" }],
      ...extra,
    }),
  );
  return loadLibraryProfile(path);
}
test("async embedding is explicit and versioned", () => {
  const legacy = profile({});
  expect(legacy.ok).toBe(true);
  if (legacy.ok) expect(legacy.profile.asyncEmbedding).toBeUndefined();
  const enabled = profile({ async_embedding: { version: 1 } });
  expect(enabled.ok).toBe(true);
  if (enabled.ok) expect(enabled.profile.asyncEmbedding).toBe(true);
  expect(profile({ async_embedding: { version: 2 } }).ok).toBe(false);
  expect(profile({ async_embedding: { version: 1, blocking: true } }).ok).toBe(false);
});
test("embedding scheduler symbols cannot collide with user exports", () => {
  for (const symbol of ["app_async_step", "app_async_pending", "app_shutdown"]) {
    expect(
      profile({
        async_embedding: { version: 1 },
        exports: [{ export: "step", symbol, params: [], returns: "void" }],
      }).ok,
    ).toBe(false);
  }
});
