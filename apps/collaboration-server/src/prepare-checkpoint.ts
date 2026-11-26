import { Worker } from "node:worker_threads";
import { prepareRoomCheckpoint } from "@tau/collaboration/whiteboard-checkpoint";

export const prepareServerCheckpoint: typeof prepareRoomCheckpoint = (state, source) => {
  // 生产入口与工作线程一起打包；源码运行由 tsx 加载同一实现。
  if (import.meta.url.endsWith(".ts")) return prepareRoomCheckpoint(state, source);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./checkpoint-worker.js", import.meta.url), {
      workerData: { state, source },
      transferList: [state.buffer as ArrayBuffer],
    });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", code => reject(new Error(`白板回收线程提前退出（${code}）`)));
  });
};
