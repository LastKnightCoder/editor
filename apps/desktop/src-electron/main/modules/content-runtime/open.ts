import { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  SOURCE_TYPES,
  createNodeDocument,
  type CollaborationSession,
  type ContentSessionSnapshot,
  type ContentSessionTarget,
  type SourceBinding,
} from "@tau/collaboration";
import databaseModule from "../database";
import ContentTable from "../tables/content";
import { findContentTitle, registerContentSession } from "../collaboration/content-sessions";
import { localContentHistoryId, localSessionId } from "../collaboration/session-identity";
import { recoverContentDrafts } from "./recovery";
import { importClosedContentHistory } from "./closed-content-history";
import type { ContentOpenContext } from "./sharing";
import type { ContentDatabase, ContentSessionRuntime } from "./index";

export function open(
  runtime: ContentSessionRuntime,
  event: ContentOpenContext,
  target: ContentSessionTarget
) {
  return runtime.beginOpen(event, target);
}

export function openForDatabase(
  runtime: ContentSessionRuntime,
  db: Database.Database,
  contentId: number
) {
  const name = [...databaseModule.databases].find(([, connection]) => connection === db)?.[0];
  if (!name) throw new Error("资料库连接已变化，请重新打开正文");
  return runtime.open({ db, name }, { contentId });
}

export function resumeLocalOpen(
  runtime: ContentSessionRuntime,
  event: ContentOpenContext,
  target: ContentSessionTarget,
  check: () => void
) {
  return runtime.beginOpen(event, target, check);
}

export function beginOpen(
  runtime: ContentSessionRuntime,
  event: ContentOpenContext,
  target: ContentSessionTarget,
  parentCheck?: () => void
) {
  parentCheck?.();
  if (target.sourceType && !SOURCE_TYPES.includes(target.sourceType))
    throw new Error("不支持的内容来源，请升级客户端");
  if (!Number.isSafeInteger(target.contentId) || target.contentId <= 0)
    throw new Error("内容 ID 不合法");
  const binding = runtime.databaseForEvent(event);
  const { db, name } = binding;
  const windowId = "sender" in event ? BrowserWindow.fromWebContents(event.sender)?.id : undefined;
  return runtime.lifecycle.open(
    db,
    { databaseName: name, windowId },
    target.contentId,
    async active => {
      const check = () => {
        parentCheck?.();
        active();
        if (
          !db.open ||
          databaseModule.getDatabase(name) !== db ||
          runtime.databaseForEvent(event).db !== db
        )
          throw new Error("资料库已切换，请重新打开内容");
      };
      check();
      const snapshot = await runtime.openContent(event, target, binding, check);
      check();
      return snapshot;
    },
    parentCheck !== undefined
  );
}

export async function openContent(
  runtime: ContentSessionRuntime,
  event: ContentOpenContext,
  target: ContentSessionTarget,
  { db, name }: ContentDatabase,
  check: () => void
): Promise<ContentSessionSnapshot> {
  const { contentId } = target;
  const repository = runtime.storage.source(db, name, contentId);
  if (repository.shared()) return runtime.openSharedContent(event, target, check);
  await repository.repair(check);
  check();
  if (repository.shared()) return runtime.openSharedContent(event, target, check);

  const head = repository.head();
  if (!head) throw new Error("内容不存在");
  const id = localSessionId(db.name, contentId, head.createdAt);
  const historyId = localContentHistoryId({
    librarySourceId: head.librarySourceId,
    contentDocumentId: head.documentId ?? undefined,
  });
  if (head.documentId && historyId)
    importClosedContentHistory(
      db,
      runtime.store.db,
      runtime.store.history,
      head.documentId,
      historyId
    );
  const hasViews = () => [...runtime.views.values()].some(view => view.documentId === id);
  // 重新打开正文后的第一次编辑另开一条历史，不并入上次打开时的记录
  if (historyId && !hasViews()) runtime.store.history.seal(historyId);
  const matches = (source: SourceBinding, current: typeof head | undefined) =>
    current &&
    source.contentCreatedAt === current.createdAt &&
    (!source.librarySourceId || source.librarySourceId === current.librarySourceId) &&
    (!source.contentDocumentId || source.contentDocumentId === current.documentId);
  let session =
    runtime.sessions.get(id) ??
    runtime.restoreDemotion({ db, name }, id) ??
    runtime.loadCached(id, undefined, info => {
      if (info.mode === "local" && info.source && !matches(info.source, head))
        throw new Error("资料库或正文身份已变化");
    });
  const source = session?.info.source;
  if (session) runtime.idleClosures.delete(session);
  if (session?.info.mode === "local" && source) {
    if (!matches(source, head)) {
      runtime.releaseReplacedSession(session);
      return runtime.openContent(event, target, { db, name }, check);
    }
    const recovered = session;
    if (!hasViews() && !session.info.frozen) {
      if (
        runtime.contentState &&
        source.librarySourceId &&
        source.contentDocumentId &&
        source.projectionRevision === head.revision
      ) {
        await recoverContentDrafts(
          runtime.store,
          runtime.contentState,
          session.info,
          session.doc,
          () => {
            try {
              check();
            } catch {
              return false;
            }
            if (
              runtime.sessions.get(id) !== recovered ||
              recovered.info.source !== source ||
              recovered.info.frozen ||
              hasViews() ||
              repository.shared()
            )
              return false;
            const latest = repository.head();
            return Boolean(
              matches(source, latest) &&
              latest?.revision === head.revision &&
              source.projectionRevision === head.revision
            );
          }
        );
      }
      check();
      if (repository.shared()) return runtime.openSharedContent(event, target, check);
      const latest = repository.head();
      if (
        runtime.sessions.get(id) !== session ||
        session.info.source !== source ||
        !matches(source, latest)
      )
        throw new Error("正文在打开期间已变化，请重试");
      if (
        latest?.revision &&
        source.projectionRevision !== latest.revision &&
        !hasViews() &&
        !session.info.frozen
      ) {
        // 先保全未投影输入，有修订冲突时再备份缓存并从主库重建。
        try {
          await runtime.project(session);
        } catch (error) {
          check();
          if (repository.shared()) return runtime.openSharedContent(event, target, check);
          if (runtime.sessions.get(id) !== session || session.info.source !== source)
            throw new Error("正文在打开期间已变化，请重试");
          if (repository.head()?.revision === source.projectionRevision) throw error;
          console.warn(`[collaboration] 正文 ${contentId} 的缓存落后于主库，已备份后按主库重建`);
          runtime.releaseReplacedSession(session, "主库在缓存之后被改写");
          return runtime.openContent(event, target, { db, name }, check);
        }
      }
    }
    check();
    if (repository.shared()) return runtime.openSharedContent(event, target, check);
    if (
      runtime.sessions.get(id) !== session ||
      session.info.source !== source ||
      !matches(source, repository.head())
    )
      throw new Error("正文在打开期间已变化，请重试");
  }
  if (!session) {
    const stored = repository.snapshot();
    if (!stored) throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
    if (!head.librarySourceId) throw new Error("正文缺少资料库来源身份");
    const source: SourceBinding = {
      ...target,
      databaseName: name,
      contentCreatedAt: head.createdAt,
      librarySourceId: head.librarySourceId,
      contentDocumentId: stored.documentId,
      projectionRevision: stored.revision,
    };
    const title =
      target.sourceType !== "card" && target.sourceTitle !== undefined
        ? target.sourceTitle
        : findContentTitle(db, contentId);
    const value = { title, content: stored.content, bannerBg: "", bannerPosition: "center" };
    const prepared = await runtime.assets.prepareLocalDocument(id, value, stored.contracts);
    check();
    const doc = await createNodeDocument(
      { documentId: id, baselineId: randomUUID(), epoch: 0 },
      prepared,
      stored.contracts,
      { allowLocalResources: true }
    );
    try {
      check();
      if (repository.shared()) return runtime.openSharedContent(event, target, check);
      if (runtime.sessions.has(id)) return runtime.openContent(event, target, { db, name }, check);
      const latest = repository.head();
      if (!matches(source, latest) || latest?.revision !== stored.revision)
        throw new Error("正文在打开期间已变化，请重试");
      const info: CollaborationSession = {
        id,
        mode: "local",
        source,
        title,
        ownerId: "local",
        role: "owner",
        status: "active",
        members: [],
        updatedAt: Date.now(),
        serverUrl: "",
        connection: "connected",
        pending: false,
        leaving: false,
      };
      runtime.store.create(info, doc);
      session = runtime.restore(info, doc);
    } finally {
      if (runtime.sessions.get(id)?.doc !== doc) doc.destroy();
    }
  }
  if (session.info.source?.contentCreatedAt !== head.createdAt) throw new Error("原内容关联已变化");
  registerContentSession(db, contentId, session);
  ContentTable.ensureTaskIds(db, contentId);
  return {
    documentId: id,
    mode: session.info.mode || "shared",
    title: session.doc.getText("title").toString(),
    frozen: Boolean(session.info.frozen),
    source: session.info.source,
  };
}
