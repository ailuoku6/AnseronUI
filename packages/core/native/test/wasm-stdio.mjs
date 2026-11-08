import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { WasmRuntime } from '../../../render-web/src/wasm-runtime.ts';
const runtime=await WasmRuntime.load(new Uint8Array(await readFile('.verification/core-wasm/entry.wasm')), new Uint8Array(await readFile('.verification/core-wasm/framework.wasm')));
for await (const line of createInterface({input:process.stdin})) {
  if(line) runtime.post(JSON.parse(line));
  console.log(JSON.stringify(runtime.step()));
}
runtime.dispose();
