import { readFile } from "node:fs/promises";
import { newQuickJSWASMModule, newVariant, RELEASE_SYNC } from "quickjs-emscripten";
import { runWorker } from "./worker-core.mjs";

// 固定读取受管 worker 同目录的资源，不回退 node_modules 或网络。
const bytes = await readFile(new URL("./quickjs.wasm", import.meta.url));
const wasmBinary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const QuickJS = await newQuickJSWASMModule(newVariant(RELEASE_SYNC, { wasmBinary }));
runWorker(QuickJS, {
  send: message => process.parentPort.postMessage(message),
  onMessage: listener => process.parentPort.on("message", event => listener(event.data)),
});
