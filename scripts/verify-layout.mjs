import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, ".verification/layout");
const flexily = join(root, "packages/flexily");
const cli = join(root, "node_modules/.bin/scriptc");
mkdirSync(output, { recursive: true });
const summary = { compiler: "", platform: process.platform + "-" + process.arch, probes: [], library: null, wasm: null };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: null, timeout: 180000, maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error("Failed: " + [command, ...args].join(" ") + " (" + (result.signal ?? result.status) + ")");
  }
  return result;
}
function same(actual, expected, name) {
  writeFileSync(join(output, name + ".stdout"), actual.stdout);
  writeFileSync(join(output, name + ".stderr"), actual.stderr);
  if (!actual.stdout.equals(expected) || actual.stderr.length !== 0) throw new Error(name + ": stdout/stderr differs");
}
function record(name, expected) {
  const item = { name, lines: expected.toString().trimEnd().split("\n").length, sha256: createHash("sha256").update(expected).digest("hex"), passed: true };
  summary.probes.push(item);
  console.log(JSON.stringify(item));
}

summary.compiler = run(cli, ["--version"]).stdout.toString().trim();
if (summary.compiler !== "0.4.8") throw new Error("Expected locked scriptc 0.4.8, got " + summary.compiler);
run(join(root, "node_modules/.bin/tsc"), ["--noEmit", "-p", "packages/layout/tsconfig.json"]);

// Reconstruct the pinned upstream without changing the adapted checkout.
const provenance = JSON.parse(readFileSync(join(flexily, "UPSTREAM-scriptc-adaptation.json"), "utf8"));
const original = join(output, "upstream");
mkdirSync(original, { recursive: true });
if (existsSync(join(flexily, ".git"))) {
  const archive = run("git", ["-C", flexily, "archive", provenance.commit]).stdout;
  run("tar", ["-x", "-C", original], { input: archive });
} else {
  throw new Error("The pinned Flexily git clone is required to reproduce the upstream differential");
}

for (const name of ["probe-layout", "probe-advanced"]) {
  const historical = join(root, "internal/experiments/flexily-scriptc");
  const probe = readFileSync(join(historical, name + ".ts"), "utf8");
  const entry = join(output, name + ".ts");
  writeFileSync(entry, probe.replaceAll("'./src/index-scriptc.js'", "'../../packages/flexily/src/index-scriptc.js'").replaceAll("'./src/constants.js'", "'../../packages/flexily/src/constants.js'"));
  const upstreamEntry = join(original, name + ".ts");
  writeFileSync(upstreamEntry, probe.replaceAll("'./src/index-scriptc.js'", "'./src/index.js'"));
  const expected = readFileSync(join(historical, name + ".expected.txt"));
  same(run(process.execPath, ["--import", "tsx", upstreamEntry]), expected, name + ".upstream");
  same(run(process.execPath, ["--import", "tsx", entry]), expected, name + ".node");
  const executable = join(output, name + ".exe");
  run(cli, ["build", entry, "--tier", "static-only", "--node-islands", "off", "-o", executable]);
  same(run(executable, []), expected, name + ".native");
  record(name, expected);
}

const engineMain = join(root, "packages/layout/test/engine-main.ts");
const engineExpected = run(process.execPath, ["--import", "tsx", engineMain]).stdout;
const engineExe = join(output, "engine.exe");
run(cli, ["build", engineMain, "--tier", "static-only", "--node-islands", "off", "-o", engineExe]);
same(run(engineExe, []), engineExpected, "engine.native");
record("engine", engineExpected);

const library = join(output, "anseronui-layout.lib.a");
run(cli, ["build", "--lib", "--profile", join(root, "packages/layout/test/library.profile.json"), "-o", library]);
const host = join(output, "library-host");
run(process.env.CC || "clang", [join(root, "packages/layout/test/library-host.c"), library, "-lm", "-o", host]);
same(run(host, []), engineExpected, "engine.library");
summary.library = { compiled: true, hostExecuted: true, passed: true };
if (process.argv.includes("--wasm")) {
  const wasm = join(output, "anseronui-layout.wasm");
  run(cli, ["build", "--lib", "--profile", join(root, "packages/layout/test/library.profile.json"), "-o", wasm], {
    env: { ...process.env, SCRIPTC_TARGET: "wasm32-wasi", ZIG_GLOBAL_CACHE_DIR: join(output, "zig-global"), ZIG_LOCAL_CACHE_DIR: join(output, "zig-local") },
  });
  same(run(process.execPath, ["--disable-warning=ExperimentalWarning", join(root, "packages/layout/test/wasm-host.mjs"), wasm]), engineExpected, "engine.wasm");
  summary.wasm = { compiled: true, wasiExecuted: true, passed: true };
}
writeFileSync(join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log("Layout differential and native library checks passed with scriptc " + summary.compiler);
