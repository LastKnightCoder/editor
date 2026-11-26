import { parentPort, workerData } from "node:worker_threads";
import { prepareRoomCheckpoint } from "@tau/collaboration/whiteboard-checkpoint";
const result = await prepareRoomCheckpoint(workerData.state, workerData.source);
if (!parentPort) throw new Error("白板回收缺少工作线程端口");
parentPort.postMessage(result, result ? [result.state.buffer as ArrayBuffer] : []);
