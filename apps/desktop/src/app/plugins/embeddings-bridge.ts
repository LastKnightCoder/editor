import { isElectron, on, off } from "@/electron";
import { withModule } from "@/commands/module-init";
import type {
  EmbeddingsRendererMessage,
  EmbeddingsRendererReply,
} from "../../../shared/embeddings-renderer";
import { rendererEmbeddingsRegistry } from "./embeddings-registry";

/** 渲染端嵌入宿主：响应主进程的一次性嵌入请求，并上报可用 provider 集合。 */
export function connectEmbeddingsRenderer() {
  if (!isElectron) return () => {};
  const hostSession = crypto.randomUUID();
  const tasks = new Map<string, AbortController>();
  let disposed = false;
  const publish = () => {
    if (disposed) return;
    void window.electron
      .invoke(
        "plugin-local:embeddings-changed",
        hostSession,
        rendererEmbeddingsRegistry.providers()
      )
      .catch(() => undefined);
  };
  const stopChanges = rendererEmbeddingsRegistry.onChange(publish);
  const cancel = (_event: unknown, message: { hostSession: string; requestId: string }) => {
    if (message.hostSession === hostSession) tasks.get(message.requestId)?.abort();
  };
  const receive = async (_event: unknown, message: EmbeddingsRendererMessage) => {
    if (disposed || message.hostSession !== hostSession) return;
    const controller = new AbortController();
    tasks.set(message.requestId, controller);
    let reply: EmbeddingsRendererReply;
    try {
      reply = {
        requestId: message.requestId,
        hostSession,
        result: await rendererEmbeddingsRegistry.execute(message.request, controller.signal),
      };
    } catch (error) {
      reply = {
        requestId: message.requestId,
        hostSession,
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : "Error",
      };
    } finally {
      tasks.delete(message.requestId);
    }
    if (!disposed)
      await window.electron.invoke("plugin-local:embeddings-reply", reply).catch(() => undefined);
  };
  on("plugin-embeddings:request", receive);
  on("plugin-embeddings:cancel", cancel);
  const ready = withModule("plugin-local", async () => {
    if (!disposed)
      await window.electron.invoke(
        "plugin-local:embeddings-connect",
        hostSession,
        rendererEmbeddingsRegistry.providers()
      );
  }).catch(error => console.error("嵌入宿主连接失败", error));
  return () => {
    disposed = true;
    off("plugin-embeddings:request", receive);
    off("plugin-embeddings:cancel", cancel);
    for (const controller of tasks.values()) controller.abort();
    tasks.clear();
    stopChanges();
    void ready
      .then(() => window.electron.invoke("plugin-local:embeddings-release", hostSession))
      .catch(() => undefined);
  };
}
