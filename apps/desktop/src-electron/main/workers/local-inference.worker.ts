import { EmbeddingRuntime } from "../modules/local-inference/runtime";
import type { InferenceReply, InferenceRequest } from "../modules/local-inference/protocol";

const port = process.parentPort;
if (!port) throw new Error("本地推理必须运行在 utilityProcess 中");
const runtime = new EmbeddingRuntime();
const send = (reply: InferenceReply) => port.postMessage(reply);

port.on("message", async ({ data }: { data: InferenceRequest }) => {
  try {
    if (data.kind === "embed") {
      const value = await runtime.embed([data.text], data.modelPath, data.devicePolicy);
      send({ kind: "result", id: data.id, result: { kind: "embed", value } });
    } else {
      await runtime.warmup(data.modelPath, data.devicePolicy);
      send({ kind: "result", id: data.id, result: { kind: "warmup", value: runtime.health() } });
    }
  } catch (error) {
    send({
      kind: "error",
      id: data.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

send({ kind: "ready" });
