import { on, off, isElectron } from "@/electron";
import type { SyncRendererMessage, SyncRendererReply } from "../../../shared/sync-renderer";
import { rendererSyncRegistry } from "./sync-registry";

export function connectSyncRenderer() {
  if (!isElectron) return () => {};
  const receive = async (_event: unknown, message: SyncRendererMessage) => {
    let reply: SyncRendererReply;
    try {
      reply = { requestId: message.requestId, result: await rendererSyncRegistry.execute(message) };
    } catch (error) {
      reply = {
        requestId: message.requestId,
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : "Error",
      };
    }
    // 回复不属于业务命令作用域，任务取消后仍须释放等待方。
    await window.electron.invoke("plugin-local:sync-reply", reply).catch(() => undefined);
  };
  on("plugin-sync:request", receive);
  return () => {
    off("plugin-sync:request", receive);
    void window.electron.invoke("plugin-local:sync-release-window").catch(() => undefined);
  };
}
