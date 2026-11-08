import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(".");
const sandbox = resolve(".verification/anseronui-cli-test");
function run(...args) {
  return spawnSync(process.execPath, ["scripts/anseronui.mjs", ...args], { cwd: root, encoding: "utf8" });
}

test("CLI creates and checks a new app, and scaffolds existing app integration", () => {
  rmSync(sandbox, { recursive: true, force: true });
  mkdirSync(sandbox, { recursive: true });
  const created = join(sandbox, "new-app");
  const create = run("create", created, "--name", "new-app");
  assert.equal(create.status, 0, create.stderr || create.stdout);
  const check = run("check", "--config", join(created, "anseronui.config.json"));
  assert.equal(check.status, 0, check.stderr || check.stdout);
  assert.ok(existsSync(join(created, "src/pages/home.tsx")));
  assert.ok(existsSync(join(created, "web/vite.config.ts")));
  const config = JSON.parse(readFileSync(join(created, "anseronui.config.json"), "utf8"));
  assert.deepEqual(config.pages.map(page => page.name), ["home", "details"]);
  assert.match(readFileSync(join(created, "web/main.ts"), "utf8"), /handleBackPress/);
  const generatedPackage = JSON.parse(readFileSync(join(created, "package.json"), "utf8"));
  assert.equal(typeof generatedPackage.scripts["build:ios"], "string");
  assert.equal(typeof generatedPackage.scripts["build:android"], "string");
  const existing = join(sandbox, "existing-app"); mkdirSync(existing);
  const integrate = run("integrate", existing, "--name", "existing-app");
  assert.equal(integrate.status, 0, integrate.stderr || integrate.stdout);
  assert.ok(existsSync(join(existing, "anseronui.config.json")));
  assert.ok(existsSync(join(existing, "ANSERONUI_INTEGRATION.md")));
  rmSync(sandbox, { recursive: true, force: true });
});
