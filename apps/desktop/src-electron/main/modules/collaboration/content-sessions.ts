import { mapNodeResources } from "@tau/db-schema/content-resources";
import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import {
  replaceText,
  NODE_DOCUMENT_VERSION,
  ASSET_PREFIX,
  isLocalAssetReference,
  NODE_DOCUMENT_MAX_BYTES,
  NodeTree,
  readNodeDocument,
  type ContentNode,
  type SourceBinding,
} from "@tau/collaboration";
import type { RuntimeSession } from "./types";
import { applySegmentEdits } from "@/entity/text-edits";
import type { NodeAttributePatcher, TextPatcher, ParagraphPatcher } from "../content-node-patches";
export { minimalTextEdit } from "@/entity/text-edits";
import { minimalTextEdit } from "@/entity/text-edits";
import { nodeText } from "../content-node-patches";
import { ContentDocumentTable, type ContentDocumentWrite } from "../tables/content-document";
import { ContentIdentityTable } from "../tables/content-identity";
import { bindingMatches } from "./content-repository";
import { findCollaborationBinding } from "../collaboration-guard";
export type { NodeAttributePatcher, TextPatcher } from "../content-node-patches";

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
    | { create_time: number }
    | undefined;
  const binding = findCollaborationBinding(db, contentId);
  const matches =
    session.info.mode === "local"
      ? !binding
      : Boolean(
          binding &&
          binding.document_id === session.info.id &&
          binding.server_url === session.info.serverUrl
        );
  const source = session.info.source;
  let identityMatches =
    !source?.librarySourceId ||
    source.librarySourceId === ContentIdentityTable.library(db)?.sourceId;
  if (identityMatches && source?.contentDocumentId) {
    const document = db
      .prepare("SELECT document_id,format_version FROM content_documents WHERE content_id=?")
      .get(contentId) as { document_id: string; format_version: number } | undefined;
    if (document && document.format_version !== 2) throw new Error("正文数据格式不兼容");
    identityMatches = source.contentDocumentId === document?.document_id;
  }
  if (
    !row ||
    !source ||
    row.create_time !== source.contentCreatedAt ||
    !matches ||
    !identityMatches
  ) {
    sessions.get(db)?.delete(contentId);
    return;
  }
  return session;
}

export function contentRevision(session: RuntimeSession) {
  return createHash("sha256").update(Y.encodeStateAsUpdate(session.doc)).digest("hex");
}

export function readSessionContent(session: RuntimeSession) {
  return readNodeDocument(session.doc);
}

/** 主库读取和复制返回可解析资源路径，不把原房间的资源标识带到新正文。 */
export function readLocalSessionContent(session: RuntimeSession) {
  const value = readSessionContent(session);
  const contracts = session.doc
    .getMap("node-tree:contracts")
    .toJSON() as import("@tau/db-schema/content-contracts").ContentContractDictionary;
  const visit = (node: ContentNode): ContentNode => {
    if (!node.children) return node;
    const definition = contracts[String(node.tauContract)];
    return {
      ...mapNodeResources(node, definition?.resources, reference => {
        if (!isLocalAssetReference(reference) && !reference.startsWith(ASSET_PREFIX))
          return reference;
        const path = session.assets?.resolveLocalFile(reference, session.info.id);
        if (!path) throw new Error("正文资源尚未在本机就绪，请下载后重试复制或导出");
        return path;
      }),
      children: node.children.map(visit),
    };
  };
  return { ...value, content: value.content.map(visit) };
}

function patchNodeSession(
  session: RuntimeSession,
  patcher: NodeAttributePatcher,
  textPatcher?: TextPatcher,
  paragraphPatcher?: ParagraphPatcher
): number {
  const candidate = new Y.Doc({ gc: false });
  Y.applyUpdate(candidate, Y.encodeStateAsUpdate(session.doc));
  const before = Y.encodeStateVector(candidate);
  const tree = new NodeTree(candidate);
  const origin = "content-patch";
  let patched = 0;
  const segmentsOf = (id: string) => {
    const segments: Array<{
      text: string;
      write: (index: number, remove: number, insert: string) => void;
    }> = [];
    let offset = 0;
    for (const span of tree.spans(id)) {
      const start = offset;
      offset += span.length;
      if (typeof span.value === "string") {
        segments.push({
          text: span.value,
          write: (index, remove, insert) => {
            if (remove) tree.deleteText(id, start + index, remove, origin);
            if (insert) tree.insertText(id, start + index, insert, origin, span.attributes);
          },
        });
      } else segments.push(...segmentsOf(span.value.node));
    }
    return segments;
  };
  const walk = (id: string, parent: Record<string, unknown>, childIndex: number) => {
    const node = tree.nodeSnapshot(id);
    const { children, collabId, ...attributes } = node;
    const patch = patcher(attributes, {
      identityKey: `node:${id}`,
      firstText: nodeText(children?.find(child => Array.isArray(child.children))),
    });
    if (
      patch &&
      Object.entries(patch).some(
        ([key, value]) => JSON.stringify(attributes[key]) !== JSON.stringify(value)
      )
    ) {
      tree.setProperties(id, patch, origin);
      patched++;
    }
    let index = 0;
    const edits: Array<() => void> = [];
    let offset = 0;
    for (const span of tree.spans(id)) {
      const start = offset;
      offset += span.length;
      if (typeof span.value !== "string") {
        walk(span.value.node, attributes, index++);
        continue;
      }
      const next = textPatcher?.(span.value);
      const edit = next == null ? null : minimalTextEdit(span.value, next);
      if (edit)
        edits.push(() => {
          if (edit.remove) tree.deleteText(id, start + edit.index, edit.remove, origin);
          if (edit.insert)
            tree.insertText(id, start + edit.index, edit.insert, origin, span.attributes);
          patched++;
        });
    }
    edits.reverse().forEach(write => write());
    if (node.type === "paragraph" && paragraphPatcher) {
      const segments = segmentsOf(id);
      patched += applySegmentEdits(
        segments,
        paragraphPatcher(segments.map(segment => segment.text).join(""), parent, childIndex)
      );
    }
  };
  try {
    candidate.transact(() => {
      let index = 0;
      for (const span of tree.spans(null))
        if (typeof span.value !== "string") walk(span.value.node, {}, index++);
    }, origin);
    if (patched) {
      if (Y.encodeStateAsUpdate(candidate).byteLength > NODE_DOCUMENT_MAX_BYTES)
        throw new Error("正文超过容量限制");
      if (!session.persistNodeUpdate) throw new Error("正文持久化服务尚未就绪");
      const update = Y.encodeStateAsUpdate(candidate, before);
      session.retainNodeState?.(candidate);
      session.persistNodeUpdate(update);
      Y.applyUpdate(session.doc, update, "renderer-persisted");
    }
    return patched;
  } finally {
    tree.dispose();
    candidate.destroy();
  }
}

function assertSessionWritable(session: RuntimeSession) {
  if (session.info.frozen || session.info.leaving || session.info.status !== "active")
    throw new Error("CONTENT_SESSION_LOCKED: 内容正在切换或已停止协作");
}

/**
 * 在会话文档上就地修改（一次事务，CRDT 增量操作），与正在进行的编辑合并；
 * 返回改动的元素 / 文本段数。不整篇替换，因此不打断光标与撤销栈。
 */
export function patchSessionNodes(
  session: RuntimeSession,
  patcher: NodeAttributePatcher,
  textPatcher?: TextPatcher,
  paragraphPatcher?: ParagraphPatcher
): number {
  assertSessionWritable(session);
  if (session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
    throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
  return patchNodeSession(session, patcher, textPatcher, paragraphPatcher);
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

export function projectContractContent(
  db: Database.Database,
  source: SourceBinding,
  session: RuntimeSession,
  value: ContentDocumentWrite,
  expectedRevision: string | undefined,
  count: number
): boolean {
  return db.transaction(() => {
    const row = db
      .prepare("SELECT create_time,content FROM contents WHERE id=?")
      .get(source.contentId) as { create_time: number; content: string } | undefined;
    if (!row || row.create_time !== source.contentCreatedAt) throw new Error("原内容关联已变化");
    const local = session.info.mode === "local";
    if (
      local
        ? Boolean(findCollaborationBinding(db, source.contentId))
        : !bindingMatches(db, source, session.info.id, session.info.serverUrl)
    )
      throw new Error("正文会话绑定已变化，停止回写");
    const previous = ContentDocumentTable.read(db, source.contentId);
    if (
      (source.librarySourceId &&
        source.librarySourceId !== ContentIdentityTable.library(db)?.sourceId) ||
      (source.contentDocumentId && source.contentDocumentId !== previous?.documentId)
    )
      throw new Error("资料库或正文身份已变化，已暂停原会话写入");
    if (!previous) throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
    if (previous.documentId !== value.documentId)
      throw new Error("正文身份已变化，请重新打开当前正文");
    if (
      row.content === JSON.stringify(value.content) &&
      JSON.stringify(previous.contracts) === JSON.stringify(value.contracts)
    )
      return false;
    if (previous.revision !== expectedRevision)
      throw new Error("正文投影修订冲突，已保留原缓存并暂停写入");
    ContentDocumentTable.commit(db, source.contentId, value, { expectedRevision, count });
    db.prepare(
      "INSERT INTO operation(operation_time,operation_id,operation_content_type,operation_action) VALUES (?,?,'content','update')"
    ).run(Date.now(), source.contentId);
    return true;
  })();
}
