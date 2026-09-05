import { useState, useEffect, useMemo, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { getAllProjectItems, getWebLinksByIds } from "@/commands";
import { BILIBILI_FOLLOWINGS_DYNAMIC_FEED_URL } from "@/commands/rss";
import useRssStore, { RssStatus } from "@/stores/useRssStore";
import useReadLaterStore from "@/stores/useReadLaterStore";
import useTabStore from "@/stores/useTabStore";
import useTabParams from "@/hooks/useTabParams";
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
  articleTotal: number;
  hasMoreArticles: boolean;
  articleSearch: string;
  isLoading: boolean;
  isRefreshing: boolean;
  addDialogOpen: boolean;
  isSelectedInReadLater: boolean;
  showBilibiliFollowingsSubscribe: boolean;
}

export interface FeedViewActions {
  setSelection: (sel: SidebarSelection) => void;
  selectArticle: (id: string | null) => void;
  toggleStar: (article: UnifiedArticleItem) => void;
  markRead: (article: UnifiedArticleItem) => void;
  markUnread: (article: UnifiedArticleItem) => void;
  markAllRead: () => void;
  loadMoreArticles: () => Promise<void>;
  setArticleSearch: (search: string) => void;
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
  subscribeBilibiliFollowings: () => Promise<void>;
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

  // 通过 Tab 参数携带的待打开 RSS 条目 ID（由首页 RSS 面板等外部入口注入）
  const { entryId: pendingEntryId } = useTabParams(TabType.Feed);
  const pendingEntryIdRef = useRef<number | null>(null);

  const rssStore = useRssStore();
  const readLaterStore = useReadLaterStore();
  const navigateTo = useTabStore((state) => state.navigateTo);

  const isReadLaterMode =
    selection.kind === "smart" && selection.group === "readlater";
  const bilibiliFollowingsFeed = useMemo(
    () =>
      rssStore.feeds.find(
        (feed) => feed.url === BILIBILI_FOLLOWINGS_DYNAMIC_FEED_URL,
      ) || null,
    [rssStore.feeds],
  );
  const bilibiliFollowingsSubscription = useMemo(
    () =>
      bilibiliFollowingsFeed
        ? rssStore.subscriptions.find(
            (subscription) => subscription.feedId === bilibiliFollowingsFeed.id,
          ) || null
        : null,
    [bilibiliFollowingsFeed, rssStore.subscriptions],
  );
  const showBilibiliFollowingsSubscribe =
    selection.kind === "bilibili-followings" && !bilibiliFollowingsSubscription;

  const reloadCurrentSelection = useMemoizedFn(() => {
    if (isReadLaterMode) {
      readLaterStore.init();
      return;
    }

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
    } else if (selection.kind === "bilibili-followings") {
      if (bilibiliFollowingsSubscription) {
        rssStore.loadEntries(bilibiliFollowingsSubscription.feedId);
      } else {
        rssStore.clearEntries();
      }
    }
  });

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
    if (isReadLaterMode || rssStore.status !== RssStatus.SUCCESS) return;
    reloadCurrentSelection();
  }, [
    selection,
    isReadLaterMode,
    bilibiliFollowingsSubscription?.feedId,
    rssStore.entriesSearch,
    rssStore.status,
    reloadCurrentSelection,
  ]);

  useEffect(() => {
    setSelectedArticleId(null);
  }, [selection]);

  // 待打开 entryId 变化：记录待选中，并确保 selection 为"全部"以保证目标文章在列表内
  useEffect(() => {
    if (pendingEntryId == null) return;
    pendingEntryIdRef.current = pendingEntryId;
    setSelection((prev) =>
      prev.kind === "smart" && prev.group === "all"
        ? prev
        : { kind: "smart", group: "all" },
    );
  }, [pendingEntryId]);

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
    const article = id ? articles.find((a) => a.id === id) : null;
    if (
      id &&
      !isReadLaterMode &&
      article?.source === "rss" &&
      !article.isRead
    ) {
      rssStore.markRead(article.sourceId);
    }

    if (id && id === selectedArticleId) {
      setSelectedArticleId(null);
      return;
    }

    setSelectedArticleId(id);
  });

  // articles 就绪后执行待打开条目的选中（仅在非稍后读模式下处理 RSS 条目）
  // 必须调用 selectArticle 而非直接 setSelectedArticleId，否则会跳过 markRead 逻辑，
  // 导致文章在数据库中仍为未读、首页 RSS 面板刷新后依然出现在未读列表
  useEffect(() => {
    const pending = pendingEntryIdRef.current;
    if (pending == null || isReadLaterMode || articles.length === 0) return;
    const targetId = `rss-${pending}`;
    if (articles.some((a) => a.id === targetId)) {
      pendingEntryIdRef.current = null;
      if (selectedArticleId !== targetId) {
        selectArticle(targetId);
      }
    }
  }, [articles, isReadLaterMode, selectedArticleId, selectArticle]);

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

  const markUnread = useMemoizedFn((article: UnifiedArticleItem) => {
    if (article.source === "rss") {
      rssStore.markUnread(article.sourceId);
    }
  });

  const markAllRead = useMemoizedFn(() => {
    if (selection.kind === "subscription") {
      rssStore.markAllRead(selection.feedId);
    } else if (
      selection.kind === "bilibili-followings" &&
      bilibiliFollowingsSubscription
    ) {
      rssStore.markAllRead(bilibiliFollowingsSubscription.feedId);
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
    } else if (article.source === "rss") {
      rssStore.deleteEntry(article.sourceId);
    }

    if (article.id === selectedArticleId) {
      setSelectedArticleId(null);
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
    } else if (
      selection.kind === "bilibili-followings" &&
      bilibiliFollowingsSubscription
    ) {
      rssStore.refreshFeed(bilibiliFollowingsSubscription.feedId);
    } else if (!isReadLaterMode) {
      rssStore.refreshAll();
    }
  });

  const refreshAll = useMemoizedFn(() => {
    rssStore.refreshAll();
  });

  const loadMoreArticles = useMemoizedFn(async () => {
    if (!isReadLaterMode) {
      await rssStore.loadMoreEntries();
    }
  });

  const setArticleSearch = useMemoizedFn((search: string) => {
    rssStore.setEntriesSearch(search);
  });

  const subscribeBilibiliFollowings = useMemoizedFn(async () => {
    await rssStore.subscribeBilibiliFollowings();
  });

  return {
    selection,
    articles,
    selectedArticle,
    projectArticleToAdd,
    articleProjectTargets,
    articleTotal: isReadLaterMode ? articles.length : rssStore.entriesTotal,
    hasMoreArticles: !isReadLaterMode && rssStore.entriesHasMore,
    articleSearch: rssStore.entriesSearch,
    isLoading,
    isRefreshing: rssStore.isRefreshing,
    addDialogOpen,
    isSelectedInReadLater,
    showBilibiliFollowingsSubscribe,
    setSelection,
    selectArticle,
    toggleStar,
    markRead,
    markUnread,
    markAllRead,
    loadMoreArticles,
    setArticleSearch,
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
    subscribeBilibiliFollowings,
    setAddDialogOpen,
  };
}
