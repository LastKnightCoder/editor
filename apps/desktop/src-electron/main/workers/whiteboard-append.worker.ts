import { parentPort, workerData } from "node:worker_threads";
import { prepareAppend, type AppendInput } from "../modules/whiteboard-documents/prepare-append";

void prepareAppend(workerData as AppendInput).then(value => {
  parentPort!.postMessage(value, [value.projection.state.buffer as ArrayBuffer]);
});
