import { useState, useEffect, useMemo, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { getAllProjectItems, getWebLinksByIds } from "@/commands";
import useRssStore, { RssStatus } from "@/stores/useRssStore";
import useReadLaterStore from "@/stores/useReadLaterStore";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import type { SidebarSelection, UnifiedArticleItem } from "../types";
import {
  useUnifiedRssEntries,
  useUnifiedReadLaterItems,
} from "./useUnifiedArticleList";
import {
  resolveArticleProjectTargets,
  type ArticleProjectTarget,
} from "../utils/articleProjectTargets";

export interface FeedViewState {
  selection: SidebarSelection;
  articles: UnifiedArticleItem[];
  selectedArticle: UnifiedArticleItem | null;
  projectArticleToAdd: UnifiedArticleItem | null;
  articleProjectTargets: Record<string, ArticleProjectTarget>;
  isLoading: boolean;
  isRefreshing: boolean;
  addDialogOpen: boolean;
  isSelectedInReadLater: boolean;
}

export interface FeedViewActions {
  setSelection: (sel: SidebarSelection) => void;
  selectArticle: (id: string | null) => void;
  toggleStar: (article: UnifiedArticleItem) => void;
  markRead: (article: UnifiedArticleItem) => void;
  markAllRead: () => void;
  toggleReadLater: (article: UnifiedArticleItem) => Promise<void>;
  archiveItem: (article: UnifiedArticleItem) => void;
  unarchiveItem: (article: UnifiedArticleItem) => void;
  deleteItem: (article: UnifiedArticleItem) => void;
  addToProject: (article: UnifiedArticleItem) => void;
  closeProjectInsertModal: () => void;
  refreshArticleProjectTargets: () => Promise<void>;
  openProjectTarget: (target: ArticleProjectTarget) => void;
  refreshCurrent: () => void;
  refreshAll: () => void;
  setAddDialogOpen: (open: boolean) => void;
}

export default function useFeedViewState(): FeedViewState & FeedViewActions {
  const [selection, setSelection] = useState<SidebarSelection>({
    kind: "smart",
    group: "all",
  });
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(
    null,
  );
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [isSelectedInReadLater, setIsSelectedInReadLater] = useState(false);
  const [projectArticleToAdd, setProjectArticleToAdd] =
    useState<UnifiedArticleItem | null>(null);
  const [articleProjectTargets, setArticleProjectTargets] = useState<
    Record<string, ArticleProjectTarget>
  >({});
  const projectTargetRequestRef = useRef(0);

  const rssStore = useRssStore();
  const readLaterStore = useReadLaterStore();
  const navigateTo = useTabStore((state) => state.navigateTo);

  const isReadLaterMode =
    selection.kind === "smart" && selection.group === "readlater";

  useEffect(() => {
    if (rssStore.status === RssStatus.UN_INIT) {
      rssStore.init();
    }
  }, [rssStore.status]);

  useEffect(() => {
    if (isReadLaterMode) {
      readLaterStore.init();
    }
  }, [isReadLaterMode]);

  useEffect(() => {
    if (isReadLaterMode) return;

    if (selection.kind === "subscription") {
      rssStore.loadEntries(selection.feedId);
    } else if (selection.kind === "smart") {
      if (selection.group === "unread") {
        rssStore.loadUnreadEntries();
      } else if (selection.group === "starred") {
        rssStore.loadStarredEntries();
      } else if (selection.group === "all") {
        rssStore.loadAllEntries();
      }
    } else if (selection.kind === "category") {
      rssStore.loadCategoryEntries(selection.category);
    }
  }, [selection, isReadLaterMode]);

  useEffect(() => {
    setSelectedArticleId(null);
  }, [selection]);

  const rssArticles = useUnifiedRssEntries(rssStore.entries);
  const readLaterArticles = useUnifiedReadLaterItems(readLaterStore.items);

  const articles = isReadLaterMode ? readLaterArticles : rssArticles;

  const selectedArticle = useMemo(
    () => articles.find((a) => a.id === selectedArticleId) || null,
    [articles, selectedArticleId],
  );

  useEffect(() => {
    if (selectedArticle?.source === "rss") {
      readLaterStore
        .checkExists("rss_entry", selectedArticle.sourceId)
        .then(setIsSelectedInReadLater);
    } else {
      setIsSelectedInReadLater(false);
    }
  }, [selectedArticle?.id]);

  const refreshArticleProjectTargets = useMemoizedFn(async () => {
    const requestId = projectTargetRequestRef.current + 1;
    projectTargetRequestRef.current = requestId;
    const articlesWithUrl = articles.filter((article) => article.url);
    if (articlesWithUrl.length === 0) {
      if (projectTargetRequestRef.current === requestId) {
        setArticleProjectTargets({});
      }
      return;
    }

    try {
      const projectItems = await getAllProjectItems();
      const webviewItems = projectItems.filter(
        (item) => item.refType === "web-link" && item.refId,
      );
      const webLinks = await getWebLinksByIds([
        ...new Set(webviewItems.map((item) => item.refId)),
      ]);
      if (projectTargetRequestRef.current === requestId) {
        setArticleProjectTargets(
          resolveArticleProjectTargets(articlesWithUrl, webviewItems, webLinks),
        );
      }
    } catch (error) {
      console.error("[FeedView] 加载文章项目文档状态失败:", error);
      if (projectTargetRequestRef.current === requestId) {
        setArticleProjectTargets({});
      }
    }
  });

  useEffect(() => {
    void refreshArticleProjectTargets();
  }, [articles, refreshArticleProjectTargets]);

  const isLoading = isReadLaterMode
    ? readLaterStore.loading
    : rssStore.entriesStatus === RssStatus.LOADING;

  const selectArticle = useMemoizedFn((id: string | null) => {
    setSelectedArticleId(id);
    if (id && !isReadLaterMode) {
      const article = articles.find((a) => a.id === id);
      if (article && article.source === "rss" && !article.isRead) {
        rssStore.markRead(article.sourceId);
      }
    }
  });

  const toggleStar = useMemoizedFn((article: UnifiedArticleItem) => {
    if (article.source === "rss") {
      rssStore.toggleStar(article.sourceId);
    } else {
      if (article.isStarred) {
        readLaterStore.unstarItem(article.sourceId);
      } else {
        readLaterStore.starItem(article.sourceId);
      }
    }
  });

  const markRead = useMemoizedFn((article: UnifiedArticleItem) => {
    if (article.source === "rss") {
      rssStore.markRead(article.sourceId);
    }
  });

  const markAllRead = useMemoizedFn(() => {
    if (selection.kind === "subscription") {
      rssStore.markAllRead(selection.feedId);
    }
  });

  const archiveItem = useMemoizedFn((article: UnifiedArticleItem) => {
    if (article.source === "readlater") {
      readLaterStore.archiveItem(article.sourceId);
    }
  });

  const unarchiveItem = useMemoizedFn((article: UnifiedArticleItem) => {
    if (article.source === "readlater") {
      readLaterStore.unarchiveItem(article.sourceId);
    }
  });

  const toggleReadLater = useMemoizedFn(async (article: UnifiedArticleItem) => {
    if (article.source !== "rss") return;
    const exists = await readLaterStore.checkExists(
      "rss_entry",
      article.sourceId,
    );
    if (exists) {
      await readLaterStore.removeBySource("rss_entry", article.sourceId);
      setIsSelectedInReadLater(false);
    } else {
      await readLaterStore.addItem({
        sourceType: "rss_entry",
        sourceId: article.sourceId,
        title: article.title,
        url: article.url || undefined,
        excerpt: article.excerpt || undefined,
        content: article.content || undefined,
      });
      setIsSelectedInReadLater(true);
    }
  });

  const deleteItem = useMemoizedFn((article: UnifiedArticleItem) => {
    if (article.source === "readlater") {
      readLaterStore.removeItem(article.sourceId);
    }
  });

  const addToProject = useMemoizedFn((article: UnifiedArticleItem) => {
    if (!article.url) return;
    setProjectArticleToAdd(article);
  });

  const closeProjectInsertModal = useMemoizedFn(() => {
    setProjectArticleToAdd(null);
  });

  const openProjectTarget = useMemoizedFn((target: ArticleProjectTarget) => {
    navigateTo(
      TabType.ProjectDetail,
      {
        id: target.projectId,
        itemId: target.itemId,
      },
      `项目 - ${target.title}`,
    );
  });

  const refreshCurrent = useMemoizedFn(() => {
    if (selection.kind === "subscription") {
      rssStore.refreshFeed(selection.feedId);
    } else if (!isReadLaterMode) {
      rssStore.refreshAll();
    }
  });

  const refreshAll = useMemoizedFn(() => {
    rssStore.refreshAll();
  });

  return {
    selection,
    articles,
    selectedArticle,
    projectArticleToAdd,
    articleProjectTargets,
    isLoading,
    isRefreshing: rssStore.isRefreshing,
    addDialogOpen,
    isSelectedInReadLater,
    setSelection,
    selectArticle,
    toggleStar,
    markRead,
    markAllRead,
    toggleReadLater,
    archiveItem,
    unarchiveItem,
    deleteItem,
    addToProject,
    closeProjectInsertModal,
    refreshArticleProjectTargets,
    openProjectTarget,
    refreshCurrent,
    refreshAll,
    setAddDialogOpen,
  };
}
