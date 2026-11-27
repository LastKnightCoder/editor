import {
  isCollaborationResource,
  isVideoResource,
  collectNodeDocumentResources,
  type SharedContent,
  type ContentNode,
} from "@tau/collaboration";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import * as tauri from "../../../services/tauri";
import { localizeFragmentResources, prepareDocumentResources } from "./resources";
import type { RuntimeSession } from "./types";
import type { CollaborationManager } from "./manager";
import { describeError } from "./utils";

export function resourceContext(_manager: CollaborationManager, session: RuntimeSession) {
  return { serverUrl: session.info.serverUrl, documentId: session.info.id };
}

export function assertResourceSession(manager: CollaborationManager, session: RuntimeSession) {
  if (
    manager.sessions.get(session.info.id) !== session ||
    session.info.status !== "active" ||
    session.info.leaving ||
    session.info.frozen
  )
    throw new Error("协作资源会话已变化，请重新打开正文");
}

export async function prepareResource(
  manager: CollaborationManager,
  documentId: string,
  reference: string
): Promise<string> {
  const session = manager.sessions.get(documentId);
  if (!session) throw new Error("协作会话尚未就绪");
  manager.assertResourceSession(session);
  if (session.info.role !== "owner") throw new Error("成员图片必须直接上传协作服务器");
  const mapped = await tauri.collabResource<Record<string, string>>(
    manager.resourceContext(session),
    "prepare",
    [reference],
    true
  );
  manager.assertResourceSession(session);
  await manager.notePendingAssets(session);
  return mapped[reference];
}

export async function uploadSharedResource(
  manager: CollaborationManager,
  documentId: string,
  file: File
): Promise<string> {
  const session = manager.sessions.get(documentId);
  if (!session) throw new Error("协作会话尚未就绪");
  manager.assertResourceSession(session);
  if (session.info.role !== "editor" && !isVideoResource(file.name, file.type))
    throw new Error("作者图片必须使用自己的存储配置");
  const reference = await tauri.uploadResource({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    content: file,
    collaboration: manager.resourceContext(session),
  });
  manager.assertResourceSession(session);
  await manager.notePendingAssets(session);
  return reference;
}

export function resolveResource(
  manager: CollaborationManager,
  documentId: string,
  reference: string
): Promise<string> {
  const session = manager.sessions.get(documentId);
  if (!session) return Promise.reject(new Error("协作会话尚未就绪"));
  return isCollaborationResource(reference)
    ? tauri.collabResource<string>(manager.resourceContext(session), "resolve", [reference])
    : Promise.resolve(reference);
}

export async function prepareFragment(
  manager: CollaborationManager,
  documentId: string,
  sourceId: string,
  content: ContentNode[],
  contracts: ContentContractDictionary
) {
  const session = manager.sessions.get(documentId);
  if (!session) throw new Error("协作会话尚未就绪");
  manager.assertResourceSession(session);
  let value: SharedContent = {
    title: "",
    bannerBg: "",
    bannerPosition: "center",
    content: await localizeFragmentResources(sourceId, content, contracts),
  };
  value = await prepareDocumentResources(manager.resourceContext(session), value, contracts);
  manager.assertResourceSession(session);
  await manager.notePendingAssets(session);
  return value.content;
}

export async function notePendingAssets(manager: CollaborationManager, session: RuntimeSession) {
  session.resourceGeneration = (session.resourceGeneration ?? 0) + 1;
  const pending = await tauri.collabResource<boolean>(manager.resourceContext(session), "pending");
  manager.assertResourceSession(session);
  session.assetsPending ||= pending;
  if (session.assetsPending) {
    manager.pauseProvider(session);
    session.info.pending = true;
  }
  session.resourcesDirty = true;
  await manager.persist(session);
  manager.changed();
  void manager
    .processResources(session)
    .catch(error => console.warn("[collab] 协作资源处理失败", { session: session.info.id }, error));
}

export function processResources(
  manager: CollaborationManager,
  session: RuntimeSession
): Promise<void> {
  if (session.resourceTask) return session.resourceTask;
  session.resourcesDirty = false;
  const task = (async () => {
    await manager.flushCache(session.info.id);
    while (session.assetsPending) {
      const generation = session.resourceGeneration;
      await tauri.collabResource(manager.resourceContext(session), "flush");
      const pending = await tauri.collabResource<boolean>(
        manager.resourceContext(session),
        "pending"
      );
      if (manager.sessions.get(session.info.id) !== session) return;
      session.assetsPending = pending || session.resourceGeneration !== generation;
      if (session.assetsPending) continue;
      session.info.pending = Boolean(session.provider?.hasUnsyncedChanges);
      if (!session.info.leaving && !session.info.frozen) {
        if (session.provider) session.provider.attach();
        else manager.attach(session);
      }
    }
    if (session.info.role === "owner") {
      const references = collectNodeDocumentResources(session.doc).filter(isCollaborationResource);
      if (references.length)
        await tauri.collabResource(manager.resourceContext(session), "localize", references);
      if (session.info.source) await manager.project(session.info.id, undefined, undefined, true);
    }
    if (manager.sessions.get(session.info.id) !== session) return;
    if (session.info.error?.startsWith("协作图片尚未保存：")) session.info.error = undefined;
    await manager.persist(session);
    manager.changed();
  })()
    .catch(failure => {
      session.resourcesDirty = true;
      session.info.error = `协作图片尚未保存：${describeError(failure, "请稍后重试")}`;
      manager.changed();
      throw failure;
    })
    .finally(() => {
      if (session.resourceTask === task) session.resourceTask = undefined;
    });
  session.resourceTask = task;
  return task;
}
