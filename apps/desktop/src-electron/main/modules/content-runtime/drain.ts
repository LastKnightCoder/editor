import { contentRevision, unregisterContentSession } from "../collaboration/content-sessions";
import databaseModule from "../database";
import type { DocumentDrain, DocumentDrainScope } from "../durable-document-lifecycle";
import type { RuntimeSession } from "../collaboration/types";
import { matchesDocumentScope } from "./content-session-lifecycle";
import type { ContentSessionRuntime } from "./index";

export function sessionsForDrain(runtime: ContentSessionRuntime, scope: DocumentDrainScope) {
  return [...runtime.sessions.values()].filter(
    session =>
      (scope.reason === "quit" || session.info.source) &&
      (scope.reason !== "database-sync" || session.info.mode === "local") &&
      matchesDocumentScope(
        { databaseName: scope.databaseName },
        { databaseName: session.info.source?.databaseName }
      ) &&
      (scope.windowId === undefined ||
        [...runtime.views.values()].some(
          view => view.documentId === session.info.id && view.windowId === scope.windowId
        ))
  );
}

export function hasViews(runtime: ContentSessionRuntime, scope: DocumentDrainScope) {
  return runtime.lifecycle.hasOpening(scope) || runtime.sessionsForDrain(scope).length > 0;
}

export function drainDatabase(
  runtime: ContentSessionRuntime,
  scope: DocumentDrainScope
): Promise<DocumentDrain> {
  return runtime.lifecycle.drain(scope, () => runtime.prepareSessionDrain(scope));
}

export async function prepareSessionDrain(
  runtime: ContentSessionRuntime,
  scope: DocumentDrainScope
): Promise<DocumentDrain> {
  const affected = runtime.sessionsForDrain(scope).map(session => {
    const source = session.info.source;
    return {
      session,
      source,
      database: source && databaseModule.getDatabase(source.databaseName),
    };
  });
  if (affected.some(({ session }) => runtime.draining.has(session)))
    throw new Error("正文正在保存并关闭，请稍后重试");
  for (const { session } of affected) runtime.draining.add(session);
  const resumed: RuntimeSession[] = [];
  const resume = () => {
    for (const session of resumed) {
      if (runtime.sessions.get(session.info.id) !== session || !session.info.frozen) continue;
      runtime.unfreeze(session);
      session.provider?.attach();
      runtime.sharedEffects?.attach(session);
    }
  };
  const release = () => {
    for (const { session } of affected) runtime.draining.delete(session);
  };
  const rollback = () => {
    release();
    resume();
  };
  try {
    for (const { session, source, database } of affected) {
      if (!session.info.frozen) {
        resumed.push(session);
        await runtime.freeze(session);
      } else if (session.drainingViews?.size) throw new Error("正文仍有未确认输入，不能退出");
      const check = () => {
        if (
          runtime.sessions.get(session.info.id) !== session ||
          session.info.source !== source ||
          (source &&
            (databaseModule.getDatabase(source.databaseName) !== database ||
              database?.open === false))
        )
          throw new Error("保存期间资料库或正文会话已变化，请重试");
      };
      check();
      session.provider?.detach();
      if (session.dirty || session.cacheWriteFailed) {
        runtime.store.compact(session.info.id, session.doc);
        session.dirty = false;
        session.cacheWriteFailed = false;
      }
      if (source && database?.open) {
        const head = runtime.storage.source(database, source.databaseName, source.contentId).head();
        const matches =
          head?.createdAt === source.contentCreatedAt &&
          (!source.librarySourceId || source.librarySourceId === head.librarySourceId) &&
          (!source.contentDocumentId || source.contentDocumentId === head.documentId);
        if (!matches) {
          // 来源变化时只确认日志耐久，避免把旧正文投影到新库。
          runtime.store.metadata(session.info);
          const cached = runtime.store.load(session.info.id);
          try {
            if (contentRevision({ ...session, doc: cached.doc }) !== contentRevision(session))
              throw new Error("正文缓存尚未完整保存，不能关闭资料库");
          } finally {
            cached.doc.destroy();
          }
          console.warn("[collaboration:drain-source-mismatch] 已保存缓存，跳过不同来源的主库投影", {
            databaseName: source.databaseName,
            documentId: session.info.id,
            contentId: source.contentId,
          });
          continue;
        }
      }
      await runtime.project(session);
      check();
      if (session.info.mode === "local" && database?.open && session.projectionDirty) {
        // 等到的保存可能在最后一批排空输入前就捕获了候选。
        await runtime.project(session);
        check();
        if (session.projectionDirty) throw new Error("正文仍有未保存的修改，请重试");
      }
    }
    return {
      commit: () => {
        release();
        if (scope.reason === "quit") return;
        if (scope.reason === "database-sync" && scope.replace) {
          for (const session of resumed)
            if (runtime.sessions.get(session.info.id) === session)
              runtime.frozenForDownload.add(session);
        } else {
          if (scope.reason === "database-change" && scope.windowId !== undefined) {
            const drainedIds = new Set(affected.map(({ session }) => session.info.id));
            for (const [id, view] of runtime.views)
              if (view.windowId === scope.windowId && drainedIds.has(view.documentId))
                runtime.removeView(id);
          }
          resume();
        }
        if (scope.reason === "window-close" || scope.windowId !== undefined) return;
        for (const { session } of affected) unregisterContentSession(session);
      },
      rollback,
    };
  } catch (failure) {
    rollback();
    throw failure;
  }
}
