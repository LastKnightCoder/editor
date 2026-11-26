import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { CompactInput } from "../../workers/whiteboard-compact.worker";

export function runCheckpointWorker(
  input: CompactInput,
  signal?: AbortSignal
): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, "whiteboard-compact-worker.js"), {
      workerData: input,
      transferList:
        "state" in input && !("kind" in input) ? [input.state.buffer as ArrayBuffer] : [],
    });
    const cancel = () => void worker.terminate().catch(reject);
    signal?.addEventListener("abort", cancel, { once: true });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", code => {
      signal?.removeEventListener("abort", cancel);
      if (signal?.aborted) resolve(null);
      else reject(new Error(`白板清理线程退出（${code}）`));
    });
  });
}
