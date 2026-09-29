import { getContentById } from "@/commands/content";
import {
  getAllActiveEditingSessions,
  getActiveEditingSessionByContentId,
} from "./active-editor-session";
import { createContentSnapshot } from "./snapshot";
import { putSnapshot } from "./snapshot-store";
import type { ContentSnapshot, ResolvedContentTarget } from "./types";
import { bindDatabaseCommands, type CommandScope } from "@/services/command-context";
import { getChatDatabase } from "@/services/chatDatabase";

export const resolveContentTarget = async (
  payload?: {
    contentId?: number;
  },
  scope?: CommandScope
): Promise<ResolvedContentTarget> => {
  if (payload?.contentId) {
    return {
      contentId: payload.contentId,
      source: "explicit",
    };
  }

  if (scope?.databaseName && scope.databaseName.replace(/\.db$/, "") !== getChatDatabase())
    throw new Error("会话所属数据库不在当前页面，请指定正文 ID");

  // 无显式 contentId 时回退到焦点的编辑会话（编辑器挂载时注册，见 active-editor-session）
  const sessions = getAllActiveEditingSessions();
  const focused =
    [...sessions].filter(s => s.focused).sort((a, b) => b.focusedAt - a.focusedAt)[0] ??
    [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!focused) {
    throw new Error("TARGET_NOT_FOUND: 当前没有激活的编辑目标，请指定正文 ID 或聚焦一个编辑器");
  }

  return {
    contentId: focused.contentId,
    entityType: focused.entityType,
    entityId: focused.entityId,
    sessionId: focused.id,
    tabType: focused.tabType,
    source: "active-session",
  };
};

export const loadSnapshotForContent = async (
  contentId: number,
  scope?: CommandScope
): Promise<{
  snapshot: ContentSnapshot;
  source: "active-session" | "database";
}> => {
  const activeSession =
    !scope?.databaseName || scope.databaseName.replace(/\.db$/, "") === getChatDatabase()
      ? getActiveEditingSessionByContentId(contentId)
      : undefined;
  const content = await bindDatabaseCommands({ getContentById }, scope).getContentById(contentId);
  if (content?.revision) {
    const snapshot = createContentSnapshot(content.content, "database");
    snapshot.revision = content.revision;
    putSnapshot(snapshot);
    return { snapshot, source: "database" };
  }
  if (activeSession) {
    putSnapshot(activeSession.snapshot);
    return {
      snapshot: activeSession.snapshot,
      source: "active-session",
    };
  }

  if (!content) {
    throw new Error(`TARGET_NOT_FOUND: 未找到 content ${contentId}`);
  }

  const snapshot = createContentSnapshot(content.content, "database");
  putSnapshot(snapshot);
  return {
    snapshot,
    source: "database",
  };
};
