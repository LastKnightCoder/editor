import { isElectron, on, off } from "@/electron";
import { withModule } from "@/commands/module-init";
import type { TTSRendererMessage, TTSRendererReply } from "../../../shared/tts-renderer";
import { rendererTTSRegistry } from "./tts-registry";

export function connectTTSRenderer() {
  if (!isElectron) return () => {};
  const hostSession = crypto.randomUUID();
  const tasks = new Map<string, AbortController>();
  const sessions = new Set<string>();
  let disposed = false;
  const cancel = (_event: unknown, message: { hostSession: string; requestId: string }) => {
    if (message.hostSession === hostSession) tasks.get(message.requestId)?.abort();
  };
  const close = (_event: unknown, message: { hostSession: string; session: string }) => {
    if (message.hostSession !== hostSession) return;
    rendererTTSRegistry.close(message.session);
    sessions.delete(message.session);
  };
  const receive = async (_event: unknown, message: TTSRendererMessage) => {
    if (disposed || message.hostSession !== hostSession) return;
    const controller = new AbortController();
    tasks.set(message.requestId, controller);
    if (message.request.kind === "open") sessions.add(message.request.session);
    let reply: TTSRendererReply;
    try {
      reply = {
        requestId: message.requestId,
        hostSession,
        result: await rendererTTSRegistry.execute(message.request, controller.signal),
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
      await window.electron.invoke("plugin-local:tts-reply", reply).catch(() => undefined);
  };
  on("plugin-tts:request", receive);
  on("plugin-tts:cancel", cancel);
  on("plugin-tts:close", close);
  const ready = withModule("plugin-local", async () => {
    if (!disposed) await window.electron.invoke("plugin-local:tts-connect", hostSession);
  }).catch(error => console.error("语音宿主连接失败", error));
  return () => {
    disposed = true;
    off("plugin-tts:request", receive);
    off("plugin-tts:cancel", cancel);
    off("plugin-tts:close", close);
    for (const controller of tasks.values()) controller.abort();
    for (const session of sessions) rendererTTSRegistry.close(session);
    tasks.clear();
    sessions.clear();
    void ready
      .then(() => window.electron.invoke("plugin-local:tts-release", hostSession))
      .catch(() => undefined);
  };
}
