import { isElectron, on, off } from "@/electron";
import { withModule } from "@/commands/module-init";
import type { ImagesRendererMessage, ImagesRendererReply } from "../../../shared/images-renderer";
import { rendererImagesRegistry } from "./images-registry";

export function connectImagesRenderer() {
  if (!isElectron) return () => {};
  const hostSession = crypto.randomUUID();
  const tasks = new Map<string, AbortController>();
  const sessions = new Set<string>();
  let disposed = false;
  const stopChanges = rendererImagesRegistry.onChange(() => {
    void window.electron.invoke("plugin-local:images-changed", hostSession).catch(() => undefined);
  });
  const unsubscribe = rendererImagesRegistry.onClose(session => {
    sessions.delete(session);
    void window.electron
      .invoke("plugin-local:images-closed", { session, hostSession })
      .catch(() => undefined);
  });
  const cancel = (_event: unknown, message: { hostSession: string; requestId: string }) => {
    if (message.hostSession === hostSession) tasks.get(message.requestId)?.abort();
  };
  const close = (_event: unknown, message: { hostSession: string; session: string }) => {
    if (message.hostSession !== hostSession) return;
    rendererImagesRegistry.close(message.session);
    sessions.delete(message.session);
  };
  const receive = async (_event: unknown, message: ImagesRendererMessage) => {
    if (disposed || message.hostSession !== hostSession) return;
    const controller = new AbortController();
    tasks.set(message.requestId, controller);
    let reply: ImagesRendererReply;
    try {
      reply = {
        requestId: message.requestId,
        hostSession,
        result: await rendererImagesRegistry.execute(message.request, controller.signal),
      };
      if (message.request.kind === "open") sessions.add(message.request.session);
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
      await window.electron.invoke("plugin-local:images-reply", reply).catch(() => undefined);
  };
  on("plugin-images:request", receive);
  on("plugin-images:cancel", cancel);
  on("plugin-images:close", close);
  const ready = withModule("plugin-local", async () => {
    if (!disposed) await window.electron.invoke("plugin-local:images-connect", hostSession);
  }).catch(error => console.error("图片宿主连接失败", error));
  return () => {
    disposed = true;
    off("plugin-images:request", receive);
    off("plugin-images:cancel", cancel);
    off("plugin-images:close", close);
    for (const controller of tasks.values()) controller.abort();
    for (const session of sessions) rendererImagesRegistry.close(session);
    tasks.clear();
    sessions.clear();
    unsubscribe();
    stopChanges();
    void ready
      .then(() => window.electron.invoke("plugin-local:images-release", hostSession))
      .catch(() => undefined);
  };
}
