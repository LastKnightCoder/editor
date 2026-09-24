import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import {
  createSharedDocument,
  getBody,
  getFields,
  readSharedContent,
  replaceText,
  validateDocument,
  type ContentNode,
  type SourceBinding,
} from "@tau/collaboration";
import type { RuntimeSession } from "./types";

const sessions = new Map<Database.Database, Map<number, RuntimeSession>>();

export function registerContentSession(
  db: Database.Database,
  contentId: number,
  session: RuntimeSession
) {
  if (!sessions.has(db)) sessions.set(db, new Map());
  sessions.get(db)!.set(contentId, session);
}

export function unregisterContentSession(session: RuntimeSession) {
  for (const [db, entries] of sessions) {
    for (const [id, value] of entries) if (value === session) entries.delete(id);
    if (!entries.size) sessions.delete(db);
  }
}

export function contentSession(db: Database.Database, contentId: number) {
  const session = sessions.get(db)?.get(contentId);
  if (!session) return;
  const row = db.prepare("SELECT create_time FROM contents WHERE id=?").get(contentId) as
    { create_time: number } | undefined;
  if (row?.create_time !== session.info.source?.contentCreatedAt) {
    sessions.get(db)?.delete(contentId);
    return;
  }
  return session;
}

export function contentRevision(session: RuntimeSession) {
  return createHash("sha256").update(Y.encodeStateAsUpdate(session.doc)).digest("hex");
}

export function replaceSessionContent(
  session: RuntimeSession,
  content: ContentNode[],
  expectedRevision?: string
) {
  if (session.info.frozen || session.info.leaving || session.info.status !== "active")
    throw new Error("CONTENT_SESSION_LOCKED: 内容正在切换或已停止协作");
  if (!expectedRevision || expectedRevision !== contentRevision(session))
    throw new Error("CONTENT_VERSION_CONFLICT: 内容已变化，请重新读取后重试");
  const value = readSharedContent(session.doc);
  // 整篇替换可能携带私有块（getContentById 物化后的真实节点），
  // 收集剥离结果并合并回会话，避免用户对私有块的修改被静默丢弃。
  const replacements = new Map<string, ContentNode>();
  const replacement = createSharedDocument(
    { ...value, content },
    session.info.mode === "local" ? undefined : replacements,
    session.info.mode
  );
  try {
    if (session.info.mode !== "local") validateDocument(replacement);
    // 在现有文档上替换，保留会话身份和其他视图的增量订阅。
    session.doc.transact(() => {
      const body = getBody(session.doc);
      body.delete(0, body.length);
      for (const [id, fields] of getFields(replacement))
        getFields(session.doc).set(id, fields.clone());
      body.applyDelta(
        getBody(replacement)
          .toDelta()
          .map((part: { insert: unknown; attributes?: Record<string, unknown> }) => ({
            ...part,
            insert: part.insert instanceof Y.AbstractType ? part.insert.clone() : part.insert,
          }))
      );
    }, "content-replacement");
    if (replacements.size) {
      for (const [id, node] of replacements) session.privateNodes.set(id, node);
      session.projectionDirty = true;
    }
  } finally {
    replacement.destroy();
  }
}

export function canonicalContentTitle(db: Database.Database, contentId: number) {
  // 协作标题为空时返回 undefined，让调用方回退到自己传入的标题，避免空串清空标题。
  const title = contentSession(db, contentId)?.doc.getText("title").toString();
  return title || undefined;
}

/**
 * 将用户显式修改的标题写回协作会话。标题以协作会话为真源，
 * 不回写会在投影时被旧协作标题覆盖（表现为重命名静默失效）。
 */
export function setCanonicalContentTitle(db: Database.Database, contentId: number, title: string) {
  if (!title) return;
  const session = contentSession(db, contentId);
  if (!session || session.info.frozen || session.info.leaving) return;
  const text = session.doc.getText("title");
  if (text.toString() === title) return;
  // doc 更新会置位 projectionDirty，投影时经 projectContentTitle 同步共享该内容的全部条目并广播
  session.doc.transact(() => replaceText(text, title), "content-title-rename");
}

export function findContentTitle(db: Database.Database, contentId: number) {
  for (const table of ["articles", "project_item"]) {
    const row = db
      .prepare(`SELECT title FROM ${table} WHERE content_id=? ORDER BY id LIMIT 1`)
      .get(contentId) as { title: string } | undefined;
    if (row?.title) return row.title;
  }
  return "";
}

export function projectContentTitle(db: Database.Database, contentId: number, title: string) {
  const changed: { channel: string; field: string; id: number }[] = [];
  db.transaction(() => {
    for (const [table, entity, field] of [
      ["articles", "article", "articleId"],
      ["project_item", "project-item", "projectItemId"],
    ]) {
      const rows = db
        .prepare(`SELECT id FROM ${table} WHERE content_id=? AND title<>?`)
        .all(contentId, title) as { id: number }[];
      const now = Date.now();
      for (const { id } of rows) {
        db.prepare(`UPDATE ${table} SET title=?,update_time=? WHERE id=?`).run(title, now, id);
        db.prepare(
          "INSERT INTO operation(operation_time,operation_id,operation_content_type,operation_action) VALUES (?,?,?,'update')"
        ).run(now, id, entity);
        changed.push({ channel: `${entity}:updated`, field, id });
      }
    }
  })();
  return changed;
}

export function projectLocalContent(
  db: Database.Database,
  source: SourceBinding,
  content: ContentNode[],
  count: number
) {
  const row = db
    .prepare("SELECT create_time,content FROM contents WHERE id=?")
    .get(source.contentId) as { create_time: number; content: string } | undefined;
  if (!row || row.create_time !== source.contentCreatedAt) throw new Error("原内容关联已变化");
  const json = JSON.stringify(content);
  if (row.content === json) return false;
  db.transaction(() => {
    const now = Date.now();
    db.prepare("UPDATE contents SET content=?,count=?,update_time=? WHERE id=?").run(
      json,
      count,
      now,
      source.contentId
    );
    db.prepare(
      "INSERT INTO operation(operation_time,operation_id,operation_content_type,operation_action) VALUES (?,?,'content','update')"
    ).run(now, source.contentId);
  })();
  return true;
}
