import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { EXECUTABLE_RUNTIME_SOURCES } from "../../compiler/src/backend/native/runtime-inputs.js";

const exec = promisify(execFile);

test.skipIf(process.platform === "win32").each([false, true])(
  "embedding drains handled rejections without losing unhandled entries (audit=%s)",
  async (audit) => {
    const dir = await mkdtemp(join(tmpdir(), "scriptc-embedding-"));
    const src = import.meta.dirname;
    try {
      const bin = join(dir, "embedding");
      await exec("clang", [
        "-std=c11",
        "-O1",
        "-g",
        "-fno-strict-aliasing",
        "-ffunction-sections",
        "-fdata-sections",
        "-Wno-deprecated-declarations",
        "-pthread",
        "-DSCR_ASYNC_EMBEDDING",
        "-DSCR_THREAD_INSTANCES",
        "-fsanitize=address,undefined",
        ...(audit ? ["-DSCR_RC_AUDIT"] : []),
        ...[
          "scr_async_embed.test.c",
          ...EXECUTABLE_RUNTIME_SOURCES.filter((name) => name !== "scr_async.c"),
        ].map((name) => join(src, name)),
        ...(process.platform === "linux" ? ["-D_GNU_SOURCE", "-lm"] : []),
        process.platform === "darwin" ? "-Wl,-dead_strip" : "-Wl,--gc-sections",
        "-o",
        bin,
      ]);
      for (const threshold of ["1", "256"]) {
        const result = await exec(bin, [], {
          env: {
            ...process.env,
            SCR_CYCLE_THRESHOLD: threshold,
            ASAN_OPTIONS: "detect_leaks=0:halt_on_error=1",
            UBSAN_OPTIONS: "halt_on_error=1",
          },
        });
        expect(result.stdout).toBe(
          "embedding releases handled rejections and preserves delayed handlers\n",
        );
        expect(result.stderr).toBe("");
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
