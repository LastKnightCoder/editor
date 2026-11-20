import { createHash } from "node:crypto";
import type { SourceBinding } from "@tau/collaboration";

export const localContentHistoryId = (
  source: Pick<SourceBinding, "librarySourceId" | "contentDocumentId"> | undefined
): string | undefined =>
  source?.librarySourceId && source.contentDocumentId
    ? JSON.stringify([source.librarySourceId, source.contentDocumentId])
    : undefined;

/**
 * 本机会话的 documentId：由数据库、内容 id 与内容创建时间派生。
 * 结束共享后会话降级回本机，id 回到同一个值（会话身份可往返）。
 */
export const localSessionId = (databaseName: string, contentId: number, contentCreatedAt: number) =>
  `local:${createHash("sha256")
    .update(JSON.stringify([databaseName, contentId, contentCreatedAt]))
    .digest("hex")}`;
