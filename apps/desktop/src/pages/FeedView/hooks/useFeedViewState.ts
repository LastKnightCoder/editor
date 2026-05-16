import { useState, useEffect, useMemo } from "react";
import { useMemoizedFn } from "ahooks";
import useRssStore, { RssStatus } from "@/stores/useRssStore";
import useReadLaterStore from "@/stores/useReadLaterStore";
import type { SidebarSelection, UnifiedArticleItem } from "../types";
import {
  useUnifiedRssEntries,
  useUnifiedReadLaterItems,
} from "./useUnifiedArticleList";

export interface FeedViewState {
  selection: SidebarSelection;
  articles: UnifiedArticleItem[];
  selectedArticle: UnifiedArticleItem | null;
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

  const rssStore = useRssStore();
  const readLaterStore = useReadLaterStore();

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
    refreshCurrent,
    refreshAll,
    setAddDialogOpen,
  };
}
