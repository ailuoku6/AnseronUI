import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { LIB_RUNTIME_SOURCES } from "../../compiler/src/backend/native/runtime-inputs.js";

const exec = promisify(execFile);

test.skipIf(process.platform === "win32").each([false, true])(
  "library reset drains pools and collector storage across threads (audit=%s)",
  async (audit) => {
    const dir = await mkdtemp(join(tmpdir(), "scriptc-library-cleanup-"));
    const src = import.meta.dirname;
    try {
      const bin = join(dir, "library-cleanup");
      await exec("clang", [
        "-std=c11",
        "-O1",
        "-g",
        "-fno-strict-aliasing",
        "-ffunction-sections",
        "-fdata-sections",
        "-Wno-deprecated-declarations",
        "-pthread",
        "-DSCR_LIB",
        "-DSCR_THREAD_INSTANCES",
        "-fsanitize=address,undefined",
        ...(audit ? ["-DSCR_RC_AUDIT"] : []),
        "-include",
        join(src, "scr_library.test-alloc.h"),
        ...["scr_library.test.c", ...LIB_RUNTIME_SOURCES].map((name) => join(src, name)),
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
        expect(result.stdout).toBe("library sessions release all tracked allocations\n");
        expect(result.stderr).toBe("");
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
