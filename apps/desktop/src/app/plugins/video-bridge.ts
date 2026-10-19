import type { JsonValue } from "@tau/plugins";
import { isElectron, on, off } from "@/electron";
import { withModule } from "@/commands/module-init";
import useSettingStore from "@/stores/useSettingStore";
import type { VideoRendererMessage, VideoRendererReply } from "../../../shared/video-renderer";
import { RendererVideoRegistry } from "./video-registry";

export const rendererVideoRegistry = new RendererVideoRegistry(
  pluginId =>
    (useSettingStore.getState().setting.onlineVideo.configurations[pluginId] ?? {}) as JsonValue
);

/** 主窗口作为视频插件宿主：执行转发来的请求并上报已启用的提供方。 */
export function connectVideoRenderer() {
  if (!isElectron) return () => {};
  const hostSession = crypto.randomUUID();
  const tasks = new Map<string, AbortController>();
  let disposed = false;
  const cancel = (_event: unknown, message: { hostSession: string; requestId: string }) => {
    if (message.hostSession === hostSession) tasks.get(message.requestId)?.abort();
  };
  const receive = async (_event: unknown, message: VideoRendererMessage) => {
    if (disposed || message.hostSession !== hostSession) return;
    const controller = new AbortController();
    tasks.set(message.requestId, controller);
    let reply: VideoRendererReply;
    try {
      reply = {
        requestId: message.requestId,
        hostSession,
        result: await rendererVideoRegistry.execute(message.request, controller.signal),
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
      await window.electron.invoke("plugin-local:video-reply", reply).catch(() => undefined);
  };
  const ready = withModule("plugin-local", async () => {
    if (disposed) return;
    await window.electron.invoke("plugin-local:video-connect", hostSession);
    await publish();
  }).catch(error => console.error("视频插件宿主连接失败", error));
  const publish = () =>
    window.electron
      .invoke("plugin-local:video-publish", hostSession, rendererVideoRegistry.state())
      .catch(() => undefined);
  const stopChanges = rendererVideoRegistry.onChange(() => {
    void ready.then(() => !disposed && publish());
  });
  on("plugin-video:request", receive);
  on("plugin-video:cancel", cancel);
  return () => {
    disposed = true;
    off("plugin-video:request", receive);
    off("plugin-video:cancel", cancel);
    for (const controller of tasks.values()) controller.abort();
    tasks.clear();
    stopChanges();
    void ready
      .then(() => window.electron.invoke("plugin-local:video-release", hostSession))
      .catch(() => undefined);
  };
}
