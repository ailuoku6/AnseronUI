import { readFileSync } from "node:fs";
import { WASI } from "node:wasi";

const file = process.argv[2];
if (!file) throw new Error("Usage: node --disable-warning=ExperimentalWarning wasm-host.mjs module.wasm");
const wasi = new WASI({ version: "preview1", args: [], env: {}, preopens: {}, returnOnExit: true });
let instance;
const module = await WebAssembly.compile(readFileSync(file));
instance = await WebAssembly.instantiate(module, {
  wasi_snapshot_preview1: wasi.wasiImport,
  scriptc: {
    panic(pointer, length) {
      const message = new TextDecoder().decode(new Uint8Array(instance.exports.memory.buffer, pointer, length));
      throw new Error("scriptc panic: " + message);
    },
  },
});
wasi.initialize(instance);
const api = instance.exports;
api.anseronui_layout_init();
const pointerSlot = api.scriptc_alloc(4);
const lengthSlot = api.scriptc_alloc(4);
if (!pointerSlot || !lengthSlot) throw new Error("Wasm output slot allocation failed");
try {
  for (let i = 0; i < 16; i++) {
    api.anseronui_layout_probe(45 + i * 7.25, 40 + i, i % 2 === 0 ? 1 : 2, pointerSlot, lengthSlot);
    // Every allocating call can grow memory; re-read its buffer afterward.
    const view = new DataView(api.memory.buffer);
    const pointer = view.getUint32(pointerSlot, true);
    const length = view.getUint32(lengthSlot, true);
    const result = new TextDecoder().decode(new Uint8Array(api.memory.buffer, pointer, length));
    console.log(result);
    api.anseronui_layout_reset();
    api.anseronui_layout_collect();
  }
} finally {
  api.scriptc_free(pointerSlot);
  api.scriptc_free(lengthSlot);
}
