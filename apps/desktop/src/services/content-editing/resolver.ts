import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { getCardById } from "@/commands/card";
import { findOneArticle } from "@/commands/article";
import { getDocumentItem } from "@/commands/document";
import { getProjectItemById } from "@/commands/project";
import { getContentById } from "@/commands/content";
import {
  getActiveEditingSession,
  getActiveEditingSessionByContentId,
} from "./active-editor-session";
import { createContentSnapshot } from "./snapshot";
import { putSnapshot } from "./snapshot-store";
import type { ContentSnapshot, ResolvedContentTarget } from "./types";

export const resolveContentTarget = async (payload?: {
  contentId?: number;
}): Promise<ResolvedContentTarget> => {
  if (payload?.contentId) {
    return {
      contentId: payload.contentId,
      source: "explicit",
    };
  }

  const activeSession = getActiveEditingSession();
  if (activeSession) {
    return {
      contentId: activeSession.contentId,
      entityType: activeSession.entityType,
      entityId: activeSession.entityId,
      tabId: activeSession.tabId,
      paneId: activeSession.paneId,
      tabType: activeSession.tabType,
      source: "active-session",
    };
  }

  const state = useTabStore.getState();
  const activePane = state.panes.find(pane => pane.id === state.activePaneId);
  const activeTab = activePane?.tabs.find(tab => tab.id === activePane.activeTabId);
  if (!activePane || !activeTab) {
    throw new Error("TARGET_NOT_FOUND: 当前没有激活的编辑目标");
  }

  if (activeTab.type === TabType.CardDetail) {
    const cardId = Number((activeTab.params as { id?: number } | undefined)?.id);
    if (!cardId) {
      throw new Error("TARGET_NOT_FOUND: CardDetail 缺少 card id");
    }
    const card = await getCardById(cardId);
    return {
      contentId: card.contentId,
      entityType: "card",
      entityId: card.id,
      tabId: activeTab.id,
      paneId: activePane.id,
      tabType: activeTab.type,
      source: "active-tab",
    };
  }

  if (activeTab.type === TabType.ArticleDetail) {
    const articleId = Number((activeTab.params as { id?: number } | undefined)?.id);
    if (!articleId) {
      throw new Error("TARGET_NOT_FOUND: ArticleDetail 缺少 article id");
    }
    const article = await findOneArticle(articleId);
    return {
      contentId: article.contentId,
      entityType: "article",
      entityId: article.id,
      tabId: activeTab.id,
      paneId: activePane.id,
      tabType: activeTab.type,
      source: "active-tab",
    };
  }

  if (activeTab.type === TabType.DocumentDetail) {
    const itemId = Number((activeTab.params as { itemId?: number } | undefined)?.itemId);
    if (!itemId) {
      throw new Error("UNSUPPORTED_TAB: 文档总览没有可编辑 contentId，请进入具体文档项");
    }
    const item = await getDocumentItem(itemId);
    if (!item) {
      throw new Error(`TARGET_NOT_FOUND: 未找到 document-item ${itemId}`);
    }
    return {
      contentId: item.contentId,
      entityType: "document-item",
      entityId: item.id,
      tabId: activeTab.id,
      paneId: activePane.id,
      tabType: activeTab.type,
      source: "active-tab",
    };
  }

  if (activeTab.type === TabType.ProjectDetail) {
    const itemId = Number((activeTab.params as { itemId?: number } | undefined)?.itemId);
    if (!itemId) {
      throw new Error("UNSUPPORTED_TAB: 项目总览没有可编辑 contentId，请进入具体项目项");
    }
    const item = await getProjectItemById(itemId);
    if (!item) {
      throw new Error(`TARGET_NOT_FOUND: 未找到 project-item ${itemId}`);
    }
    return {
      contentId: item.contentId,
      entityType: "project-item",
      entityId: item.id,
      tabId: activeTab.id,
      paneId: activePane.id,
      tabType: activeTab.type,
      source: "active-tab",
    };
  }

  throw new Error(`UNSUPPORTED_TAB: 当前 tab 类型 ${activeTab.type} 暂不支持编辑`);
};

export const loadSnapshotForContent = async (
  contentId: number
): Promise<{
  snapshot: ContentSnapshot;
  source: "active-session" | "database";
}> => {
  const activeSession = getActiveEditingSessionByContentId(contentId);
  const content = await getContentById(contentId);
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
