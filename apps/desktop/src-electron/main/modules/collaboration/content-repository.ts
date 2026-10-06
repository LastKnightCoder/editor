import type Database from "better-sqlite3";
import type {
  CollaborationSession,
  ContentNode,
  SourceBinding,
  SourceType,
} from "@tau/collaboration";
import { PRIVATE_BLOCKS, SOURCE_TYPES } from "@tau/collaboration";
import { findCollaborationBinding } from "../collaboration-guard";

const parseSourceType = (value: string | undefined | null): SourceType | undefined =>
  SOURCE_TYPES.includes(value as SourceType) ? (value as SourceType) : undefined;

export function restorePrivateNodes(
  db: Database.Database,
  source: SourceBinding,
  privateNodes: Map<string, ContentNode>
) {
  const row = db
    .prepare("SELECT content,create_time FROM contents WHERE id=?")
    .get(source.contentId) as { content: string; create_time: number } | undefined;
  if (!row || row.create_time !== source.contentCreatedAt)
    throw new Error("原内容身份已变化，停止恢复本地组件");
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as ContentNode;
    if (PRIVATE_BLOCKS.has(String(node.type))) {
      // 本地 contents 是会话内存数据的投影，只补充缺失的条目，不用旧投影覆盖新数据。
      if (typeof node.collabId === "string" && !privateNodes.has(node.collabId))
        privateNodes.set(node.collabId, structuredClone(node));
      else if (privateNodes.size === 0)
        throw new Error("旧内容缺少本地组件关联标识，请重新发起共享");
      return;
    }
    Object.values(node).forEach(visit);
  };
  visit(JSON.parse(row.content || "[]"));
}

export function restoreContentBinding(
  db: Database.Database,
  databaseName: string,
  documentId: string,
  serverUrl: string
): SourceBinding | undefined {
  const row = db
    .prepare(
      `SELECT b.* FROM collaboration_bindings b JOIN contents c
    ON c.id=b.content_id AND c.create_time=b.content_created_at
    WHERE b.document_id=? AND b.server_url=?`
    )
    .get(documentId, serverUrl) as
    | {
        content_id: number;
        content_created_at: number;
        source_type?: string;
        source_id?: number;
        source_title?: string;
      }
    | undefined;
  return row
    ? {
        databaseName,
        contentId: row.content_id,
        contentCreatedAt: row.content_created_at,
        sourceType: parseSourceType(row.source_type),
        sourceId: row.source_id,
        sourceTitle: row.source_title,
      }
    : undefined;
}

/** 原内容仍由这份共享绑定（内容未被删除重建、绑定未改指其它共享 / 服务） */
export function bindingMatches(
  db: Database.Database,
  source: SourceBinding,
  documentId: string,
  serverUrl: string
): boolean {
  const original = db
    .prepare("SELECT create_time FROM contents WHERE id=?")
    .get(source.contentId) as { create_time: number } | undefined;
  const binding = findCollaborationBinding(db, source.contentId);
  return Boolean(
    original &&
    original.create_time === source.contentCreatedAt &&
    binding &&
    binding.document_id === documentId &&
    binding.server_url === serverUrl
  );
}

export function writeContentProjection(
  db: Database.Database,
  source: SourceBinding,
  documentId: string,
  serverUrl: string,
  content: ContentNode[],
  count: number
) {
  const original = db
    .prepare("SELECT create_time,content FROM contents WHERE id=?")
    .get(source.contentId) as { create_time: number; content: string } | undefined;
  if (!original || !bindingMatches(db, source, documentId, serverUrl)) {
    throw new Error("原内容关联已变化，已暂停回写；请重新发起共享");
  }
  const json = JSON.stringify(content);
  if (original.content === json) return false;
  const now = Date.now();
  db.transaction(() => {
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

export type ClosedResharePlan = { action: "rebuild" } | { action: "reject"; reason: string };

/**
 * 结束共享后的残留会话（服务器文档已删、绑定未清）会挡住重新发起：创建流程按
 * 「恢复共享」处理并对已删文档重新签码，必然失败。pending（本机有未同步改动）时
 * 不能静默丢弃，仍需用户到协作页清理；否则可先写回本地、拆残留后重建。
 */
export function planClosedReshare(
  session: Pick<CollaborationSession, "status" | "pending">
): ClosedResharePlan | null {
  if (session.status !== "closed") return null;
  return session.pending
    ? {
        action: "reject",
        reason: "这份内容的共享已结束但本机还有未同步改动，请先在协作页清理后再重新发起",
      }
    : { action: "rebuild" };
}
