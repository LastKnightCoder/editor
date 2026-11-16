import { collectNodeDocumentResources } from "@tau/collaboration";
import { collaborationImageStorage } from "../../services/collaboration-image-storage";
import type { RuntimeSession } from "./types";
import type { CollaborationManager } from "./index";

export async function flushResources(manager: CollaborationManager) {
  if (manager.syncingResources) return;
  manager.syncingResources = true;
  try {
    for (const session of manager.content.activeSessions()) {
      if (
        session.info.leaving ||
        session.info.status !== "active" ||
        !manager.assets.hasPending(session.info.id)
      )
        continue;
      try {
        await manager.assets.flush(session.info.serverUrl, session.info.id);
        if (
          session.info.status === "active" &&
          !session.info.leaving &&
          !manager.assets.hasPending(session.info.id)
        )
          session.provider?.attach();
      } catch (error) {
        session.info.error = error instanceof Error ? error.message : "资源上传失败";
        manager.content.changed(session);
      }
    }
  } finally {
    manager.syncingResources = false;
  }
}

export async function preserveOwnerImages(
  manager: CollaborationManager,
  session: RuntimeSession,
  references?: Iterable<string>
) {
  if (session.info.mode === "local" || session.info.role !== "owner") return;
  try {
    const preserved = await manager.assets.preserveOwnerImages(
      session.info.serverUrl,
      session.info.id,
      references ?? collectNodeDocumentResources(session.doc),
      async file => {
        const reference = await collaborationImageStorage.save(file);
        if (manager.content.activeSession(session.info.id) !== session)
          throw new Error("作者正文会话已变化");
        return reference;
      }
    );
    if (preserved.length && session.projectionVersion) {
      session.projectionStructure = ++session.projectionVersion.content;
      session.projectionDirty = true;
    }
  } catch (error) {
    throw new Error(`作者图片尚未保存：${error instanceof Error ? error.message : String(error)}`);
  }
  if (session.info.error?.startsWith("作者图片尚未保存：")) {
    session.info.error = undefined;
    manager.content.changed(session);
  }
}
