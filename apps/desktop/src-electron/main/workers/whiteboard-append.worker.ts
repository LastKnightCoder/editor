import { parentPort } from "node:worker_threads";
import { prepareAppend, type AppendInput } from "../modules/whiteboard-documents/prepare-append";
import type { AppendWorkerResult } from "../modules/whiteboard-documents/append-worker";

parentPort?.on("message", (input: AppendInput) => {
  void prepareAppend(input).then(
    value => {
      parentPort?.postMessage({ ok: true, value } satisfies AppendWorkerResult, [
        value.projection.state.buffer as ArrayBuffer,
      ]);
    },
    error => {
      parentPort?.postMessage({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      } satisfies AppendWorkerResult);
    }
  );
});
