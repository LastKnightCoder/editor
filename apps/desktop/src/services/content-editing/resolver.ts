import { getActiveTab } from "@/mcp/tab-content/utils";
import { TabType } from "@/types/tab";
import { getCardById } from "@/commands/card";
import { findOneArticle } from "@/commands/article";
import { getProjectItemById } from "@/commands/project";
import { getContentById } from "@/commands/content";
import { getActiveEditingSessionByContentId } from "./active-editor-session";
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
  const commands = bindDatabaseCommands({ getCardById, findOneArticle, getProjectItemById }, scope);
  const active = getActiveTab();
  const activeTab = active?.tab;
  if (!active || !activeTab) {
    throw new Error("TARGET_NOT_FOUND: 当前没有激活的编辑目标");
  }

  if (activeTab.type === "card-detail") {
    const cardId = Number((activeTab.params as { id?: number } | undefined)?.id);
    if (!cardId) {
      throw new Error("TARGET_NOT_FOUND: CardDetail 缺少 card id");
    }
    const card = await commands.getCardById(cardId);
    return {
      contentId: card.contentId,
      entityType: "card",
      entityId: card.id,
      tabId: activeTab.id,
      paneId: active.paneId,
      tabType: TabType.CardDetail,
      source: "active-tab",
    };
  }

  if (activeTab.type === "article-detail") {
    const articleId = Number((activeTab.params as { id?: number } | undefined)?.id);
    if (!articleId) {
      throw new Error("TARGET_NOT_FOUND: ArticleDetail 缺少 article id");
    }
    const article = await commands.findOneArticle(articleId);
    return {
      contentId: article.contentId,
      entityType: "article",
      entityId: article.id,
      tabId: activeTab.id,
      paneId: active.paneId,
      tabType: TabType.ArticleDetail,
      source: "active-tab",
    };
  }

  if (activeTab.type === "project-detail") {
    const itemId = Number((activeTab.params as { itemId?: number } | undefined)?.itemId);
    if (!itemId) {
      throw new Error("UNSUPPORTED_TAB: 项目总览没有可编辑 contentId，请进入具体项目项");
    }
    const item = await commands.getProjectItemById(itemId);
    if (!item) {
      throw new Error(`TARGET_NOT_FOUND: 未找到 project-item ${itemId}`);
    }
    return {
      contentId: item.contentId,
      entityType: "project-item",
      entityId: item.id,
      tabId: activeTab.id,
      paneId: active.paneId,
      tabType: TabType.ProjectDetail,
      source: "active-tab",
    };
  }

  throw new Error(`UNSUPPORTED_TAB: 当前 tab 类型 ${activeTab.type} 暂不支持编辑`);
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
