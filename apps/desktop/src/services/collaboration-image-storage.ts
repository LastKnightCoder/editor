import { isElectron, on, off } from "@/electron";
import { withModule } from "@/commands/module-init";
import { collaborationCommands } from "@/commands/contracts/collaboration";
import { uploadResource } from "@/hooks/useUploadResource";
import useSettingStore from "@/stores/useSettingStore";
import type { OwnerImageRequest, OwnerImageReply } from "../../shared/collaboration-image-storage";

export function connectCollaborationImageStorage() {
  if (!isElectron) return () => {};
  const hostSession = crypto.randomUUID();
  const tasks = new Map<string, AbortController>();
  let disposed = false;
  const cancel = (_event: unknown, message: { requestId: string; hostSession: string }) => {
    if (message.hostSession === hostSession) tasks.get(message.requestId)?.abort();
  };
  const receive = async (_event: unknown, message: OwnerImageRequest) => {
    if (disposed || message.hostSession !== hostSession) return;
    const controller = new AbortController();
    tasks.set(message.requestId, controller);
    let reply: OwnerImageReply;
    try {
      if (!useSettingStore.getState().inited) throw new Error("作者的存储配置尚未加载完成");
      const file = new File([message.file.bytes.slice().buffer as ArrayBuffer], message.file.name, {
        type: message.file.mime,
      });
      reply = {
        requestId: message.requestId,
        hostSession,
        reference: await uploadResource(file, controller.signal),
      };
    } catch (error) {
      reply = {
        requestId: message.requestId,
        hostSession,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      tasks.delete(message.requestId);
    }
    if (!disposed) await collaborationCommands.ownerImageReply.call(reply).catch(() => undefined);
  };
  on("collaboration:owner-image-store", receive);
  on("collaboration:owner-image-cancel", cancel);
  const ready = withModule("collaboration", async () => {
    if (!disposed) await collaborationCommands.ownerImageConnect.call(hostSession);
  }).catch(error => console.error("作者图片存储连接失败", error));
  return () => {
    disposed = true;
    off("collaboration:owner-image-store", receive);
    off("collaboration:owner-image-cancel", cancel);
    for (const controller of tasks.values()) controller.abort();
    tasks.clear();
    void ready
      .then(() => collaborationCommands.ownerImageRelease.call(hostSession))
      .catch(() => undefined);
  };
}
