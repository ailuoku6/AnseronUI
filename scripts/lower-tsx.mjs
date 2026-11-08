import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { lowerTSX } from "../packages/ui-compiler/src/index.ts";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: lower-tsx <input.tsx> <output.ts>");
const source = readFileSync(input, "utf8");
const result = lowerTSX(source, input);
if (result.diagnostics.length) {
  for (const item of result.diagnostics) console.error(input + ":" + item.line + ":" + item.column + " " + item.code + ": " + item.message);
  process.exitCode = 1;
} else {
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, result.source);
  console.log(output);
}
