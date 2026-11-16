import type { IpcMainInvokeEvent } from "electron";
import type * as Y from "yjs";
import type {
  CollaborationSession,
  ContentSessionSnapshot,
  ContentSessionTarget,
  ScopedContentResult,
  ScopedContentSubmission,
  SourceBinding,
} from "@tau/collaboration";
import type { RuntimeSession } from "../collaboration/types";
import type { PreparedSharedReplacement } from "../collaboration/shared-content-replacement";
import type { CollaborationLocalStore } from "../collaboration/local-store";
import { contentRevision } from "../collaboration/content-sessions";
import { localSessionId } from "../collaboration/session-identity";
import databaseModule from "../database";
import type { ScopedWriteOptions } from "./agent/suggestion-service";
import {
  contentDemotionKey,
  readContentDemotion,
  stageContentDemotion,
  type StagedContentDemotion,
} from "./local-content-demotion";
import type { ContentDatabase, ContentSessionRuntime } from ".";

export type ContentOpenContext = IpcMainInvokeEvent | ContentDatabase;

export interface PreparedContentShare {
  documentId: string;
  baselineId: string;
  state: string;
  revision: string;
  serverUrl: string;
}

export type PublishedContentShare = Pick<
  PreparedContentShare,
  "documentId" | "baselineId" | "serverUrl"
> & { epoch: number };

export interface SharedContentBridge {
  open(
    event: ContentOpenContext,
    target: ContentSessionTarget,
    check: () => void
  ): Promise<ContentSessionSnapshot>;
  find(id: string): RuntimeSession | undefined;
  findContent(workspaceId: string, contentId: number): RuntimeSession | undefined;
  readAgentState(session: RuntimeSession): Promise<Uint8Array>;
  submitAgentEdit(
    session: RuntimeSession,
    request: ScopedContentSubmission,
    updateHash: string,
    check: () => void,
    options: ScopedWriteOptions
  ): Promise<ScopedContentResult>;
  broadcastPresence(documentId: string, update: Uint8Array): void;
  removeWindowViews(id: number): void;
}

export interface LocalContentSharingAccess {
  connectSharing(bridge: SharedContentBridge): () => void;
  open(event: ContentOpenContext, target: ContentSessionTarget): Promise<ContentSessionSnapshot>;
  resumeLocalOpen: SharedContentBridge["open"];
  getSession(id: string): RuntimeSession;
  find(id: string): RuntimeSession | undefined;
  prepareShare(session: RuntimeSession): Promise<void>;
  pendingShare(id: string): PreparedContentShare | null;
  rememberShare(id: string, value: PreparedContentShare): void;
  cancelShare(session: RuntimeSession): void;
  save(session: RuntimeSession): Promise<void>;
  finishPublishedShare(
    id: string,
    source: SourceBinding,
    published: PublishedContentShare
  ): Promise<void>;
  stageDemotion(info: CollaborationSession, doc: Y.Doc): void;
  restoreDemotion(context: ContentDatabase, id: string): RuntimeSession | undefined;
  presenceSnapshot(session: RuntimeSession): Uint8Array;
  scheduleSuggestionValidation(
    workspaceId: string,
    contentId: number,
    document: () => Y.Doc | undefined
  ): void;
}

export interface SharedSessionEffects {
  attach(session: RuntimeSession): void;
  broadcastState(): void;
  flushResources(): void;
  preserveOwnerImages(session: RuntimeSession): Promise<void>;
  retryReplacement(
    session: RuntimeSession,
    intentHash: string,
    checkScope: () => void,
    onAccepted?: () => void
  ): Promise<boolean>;
  submitReplacement(
    session: RuntimeSession,
    prepared: PreparedSharedReplacement,
    checkRevision: () => void,
    checkScope: () => void,
    onAccepted?: () => void
  ): Promise<void>;
  scheduleSuggestionValidation: LocalContentSharingAccess["scheduleSuggestionValidation"];
}

export function connectSharing(runtime: ContentSessionRuntime, sharing: SharedContentBridge) {
  runtime.sharing = sharing;
  return () => {
    if (runtime.sharing === sharing) runtime.sharing = undefined;
  };
}

export async function openSharedContent(
  runtime: ContentSessionRuntime,
  event: ContentOpenContext,
  target: ContentSessionTarget,
  check: () => void
) {
  if (!runtime.sharing) {
    const { default: modules } = await import("../../module-init/ModuleInitManager");
    const ready = await modules.initModule("collaboration");
    if (!ready.success) throw new Error("COLLABORATION_UNAVAILABLE: " + ready.error);
  }
  check();
  if (!runtime.sharing) throw new Error("COLLABORATION_UNAVAILABLE: 共享服务尚未就绪");
  return runtime.sharing.open(event, target, check);
}

export async function readSharedAgentState(
  runtime: ContentSessionRuntime,
  session: RuntimeSession
): Promise<Uint8Array> {
  if (!runtime.sharing) throw new Error("COLLABORATION_UNAVAILABLE: 共享服务尚未就绪");
  return runtime.sharing.readAgentState(session);
}

export async function submitSharedAgentEdit(
  runtime: ContentSessionRuntime,
  session: RuntimeSession,
  request: ScopedContentSubmission,
  updateHash: string,
  check: () => void,
  options: ScopedWriteOptions
): Promise<import("@tau/collaboration").ScopedContentResult> {
  if (!runtime.sharing) throw new Error("COLLABORATION_UNAVAILABLE: 共享服务尚未就绪");
  return runtime.sharing.submitAgentEdit(session, request, updateHash, check, options);
}

export function install(runtime: ContentSessionRuntime, info: CollaborationSession, doc: Y.Doc) {
  runtime.store.create(info, doc);
  return runtime.restore(info, doc);
}

export function stageDemotion(
  runtime: ContentSessionRuntime,
  info: CollaborationSession,
  doc: Y.Doc
) {
  if (runtime.sessions.has(info.id)) throw new Error("本机正文仍在编辑，请稍后重试");
  runtime.store.db.transaction(() => {
    // 冷缓存保全后让位，避免旧会话 ID 在安装前重新载入旧正文。
    runtime.store.discard(info.id, "结束共享时发现旧本机缓存");
    stageContentDemotion(runtime.store, info, doc);
  })();
}

export function restoreDemotion(
  runtime: ContentSessionRuntime,
  { db, name }: ContentDatabase,
  id: string
): RuntimeSession | undefined {
  const key = contentDemotionKey(id);
  const plan = runtime.store.get<StagedContentDemotion | null>(key, null);
  if (!plan) return;
  const source = plan.info?.source;
  if (!db.open || databaseModule.getDatabase(name) !== db || source?.databaseName !== name) return;
  if (plan.info.id !== id || plan.info.mode !== "local" || runtime.sessions.has(id))
    throw new Error("结束共享的本机会话身份已变化");
  const repository = runtime.storage.source(db, name, source.contentId);
  if (repository.shared()) return;
  const head = repository.head();
  if (
    !head ||
    id !== localSessionId(db.name, source.contentId, head.createdAt) ||
    head.createdAt !== source.contentCreatedAt ||
    !head.librarySourceId ||
    head.librarySourceId !== source.librarySourceId ||
    !head.documentId ||
    head.documentId !== source.contentDocumentId ||
    !head.revision ||
    head.revision !== source.projectionRevision
  ) {
    // 较新的主库内容已经取代交接候选，继续按当前主库重建。
    runtime.store.delete(key);
    return;
  }
  const doc = readContentDemotion(plan, id);
  try {
    runtime.store.db.transaction(() => {
      runtime.store.create(plan.info, doc);
      runtime.store.delete(key);
    })();
    return runtime.restore(plan.info, doc);
  } finally {
    if (runtime.sessions.get(id)?.doc !== doc) doc.destroy();
  }
}

export async function finishPublishedShare(
  runtime: ContentSessionRuntime,
  id: string,
  source: SourceBinding,
  published: PublishedContentShare
) {
  const pending = runtime.pendingShare(id);
  if (
    !pending ||
    pending.documentId !== published.documentId ||
    pending.serverUrl !== published.serverUrl ||
    pending.baselineId !== published.baselineId ||
    published.epoch !== 0
  )
    return;

  const active = runtime.sessions.get(id);
  let cached: ReturnType<CollaborationLocalStore["load"]> | undefined;
  if (!active && runtime.store.db.prepare("SELECT 1 FROM sessions WHERE id=?").get(id)) {
    try {
      // 核对冻结候选时只读冷缓存，避免把已经交接的正文重新注册为本机会话。
      cached = runtime.store.load(id);
    } catch {
      return;
    }
  }
  try {
    const original = active ?? cached;
    if (original) {
      const binding = original.info.source;
      if (
        original.info.mode !== "local" ||
        (active && !active.info.frozen) ||
        !binding ||
        binding.databaseName.replace(/\.db$/, "") !== source.databaseName.replace(/\.db$/, "") ||
        binding.contentId !== source.contentId ||
        binding.contentCreatedAt !== source.contentCreatedAt ||
        !source.librarySourceId ||
        binding.librarySourceId !== source.librarySourceId ||
        !source.contentDocumentId ||
        binding.contentDocumentId !== source.contentDocumentId ||
        contentRevision(original) !== pending.revision
      )
        return;
    }
  } finally {
    cached?.doc.destroy();
  }

  const clearCandidate = () => runtime.store.delete(`publishing:${id}`);
  if (active) await runtime.removeSession(active, clearCandidate);
  else {
    runtime.removeStoredSession(id, clearCandidate);
    runtime.assets.removeDocumentCache(id);
  }
}
