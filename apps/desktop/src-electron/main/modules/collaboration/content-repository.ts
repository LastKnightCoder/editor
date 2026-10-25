import type Database from "better-sqlite3";
import type { CollaborationSession, SourceBinding, SourceType } from "@tau/collaboration";
import { SOURCE_TYPES } from "@tau/collaboration";
import { findCollaborationBinding } from "../collaboration-guard";

const parseSourceType = (value: string | undefined | null): SourceType | undefined =>
  SOURCE_TYPES.includes(value as SourceType) ? (value as SourceType) : undefined;

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
