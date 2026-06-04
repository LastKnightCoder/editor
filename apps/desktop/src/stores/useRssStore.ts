import { create } from "zustand";
import { persist } from "zustand/middleware";
import { RssFeed, RssSubscription, RssEntry } from "@/types";
import { on } from "@/electron";
import {
  BILIBILI_DEFAULT_CATEGORY,
  BILIBILI_FOLLOWINGS_DYNAMIC_FEED_URL,
  getLocalBilibiliFeedMetadata,
  isLocalBilibiliFeedUrl,
  listRssFeeds,
  listRssSubscriptions,
  getRssCategories,
  createRssFeed,
  createRssSubscription,
  updateRssSubscription,
  deleteRssSubscription,
  deleteRssFeed,
  listRssEntriesByFeed,
  listUnreadRssEntries,
  listStarredRssEntries,
  listAllRssEntries,
  listRssEntriesByCategory,
  countRssEntriesByFeed,
  countUnreadRssEntries,
  countStarredRssEntries,
  countAllRssEntries,
  countRssEntriesByCategory,
  markRssEntryRead,
  markRssEntryUnread,
  markAllRssEntriesReadByFeed,
  toggleRssEntryStar,
  deleteRssEntry,
  getUnreadCounts,
  getStarredCount,
  refreshRssFeed,
  refreshAllRssFeeds,
  discoverFeeds,
  previewFeed,
  extractContent,
  getRssFeedByUrl,
} from "@/commands/rss";

export enum RssStatus {
  UN_INIT,
  LOADING,
  SUCCESS,
  FAIL,
}

export type RssFilterMode = "all" | "unread" | "starred";
type RssEntryListScope =
  | { kind: "feed"; feedId: number }
  | { kind: "unread" }
  | { kind: "starred" }
  | { kind: "all" }
  | { kind: "category"; category: string };

const RSS_ENTRY_PAGE_SIZE = 50;

const countLoadedEntriesInScope = (
  scope: RssEntryListScope | null,
  entries: RssEntry[],
) => {
  if (!scope) return entries.length;
  if (scope.kind === "unread") {
    return entries.filter((entry) => !entry.isRead).length;
  }
  if (scope.kind === "starred") {
    return entries.filter((entry) => entry.isStarred).length;
  }
  return entries.length;
};

interface IState {
  feeds: RssFeed[];
  subscriptions: RssSubscription[];
  categories: string[];
  entries: RssEntry[];
  entriesTotal: number;
  entriesHasMore: boolean;
  entriesSearch: string;
  entriesScope: RssEntryListScope | null;
  unreadCounts: Record<number, number>;
  starredCount: number;
  status: RssStatus;
  entriesStatus: RssStatus;
  selectedSubscriptionId: number | null;
  selectedEntryId: number | null;
  filterMode: RssFilterMode;
  isRefreshing: boolean;
}

interface IAction {
  init: () => Promise<void>;
  loadFeeds: () => Promise<void>;
  loadSubscriptions: () => Promise<void>;
  loadCategories: () => Promise<void>;
  loadUnreadCounts: () => Promise<void>;
  loadStarredCount: () => Promise<void>;
  loadEntries: (feedId: number) => Promise<void>;
  loadUnreadEntries: () => Promise<void>;
  loadStarredEntries: () => Promise<void>;
  loadAllEntries: () => Promise<void>;
  loadCategoryEntries: (category: string) => Promise<void>;
  loadMoreEntries: () => Promise<void>;
  setEntriesSearch: (search: string) => void;
  clearEntries: () => void;
  subscribe: (url: string, category?: string, title?: string) => Promise<void>;
  subscribeBilibiliFollowings: (category?: string) => Promise<void>;
  unsubscribe: (subscriptionId: number) => Promise<void>;
  updateSubscription: (
    id: number,
    data: { title?: string; category?: string },
  ) => Promise<void>;
  markRead: (entryId: number) => void;
  markUnread: (entryId: number) => void;
  markAllRead: (feedId: number) => void;
  toggleStar: (entryId: number) => void;
  deleteEntry: (entryId: number) => Promise<void>;
  refreshFeed: (feedId: number) => Promise<void>;
  refreshAll: () => Promise<void>;
  discoverFeeds: (
    url: string,
  ) => Promise<{ url: string; title: string; type: string }[]>;
  previewFeed: typeof previewFeed;
  extractContent: (url: string) => Promise<string | null>;
  setSelectedSubscription: (id: number | null) => void;
  setSelectedEntry: (id: number | null) => void;
  setFilterMode: (mode: RssFilterMode) => void;
}

const useRssStore = create<IState & IAction>()(
  persist(
    (set, get) => ({
      feeds: [],
      subscriptions: [],
      categories: [],
      entries: [],
      entriesTotal: 0,
      entriesHasMore: false,
      entriesSearch: "",
      entriesScope: null,
      unreadCounts: {},
      starredCount: 0,
      status: RssStatus.UN_INIT,
      entriesStatus: RssStatus.UN_INIT,
      selectedSubscriptionId: null,
      selectedEntryId: null,
      filterMode: "all",
      isRefreshing: false,

      init: async () => {
        set({ status: RssStatus.LOADING });
        try {
          await Promise.all([
            get().loadFeeds(),
            get().loadSubscriptions(),
            get().loadCategories(),
            get().loadUnreadCounts(),
            get().loadStarredCount(),
          ]);
          set({ status: RssStatus.SUCCESS });

          on("rss:entries-updated", () => {
            get().loadUnreadCounts();
          });
        } catch {
          set({ status: RssStatus.FAIL });
        }
      },

      loadFeeds: async () => {
        const feeds = await listRssFeeds();
        set({ feeds });
      },

      loadSubscriptions: async () => {
        const subscriptions = await listRssSubscriptions();
        set({ subscriptions });
      },

      loadCategories: async () => {
        const categories = await getRssCategories();
        set({ categories });
      },

      loadUnreadCounts: async () => {
        const counts = await getUnreadCounts();
        const map: Record<number, number> = {};
        for (const { feedId, count } of counts) {
          map[feedId] = count;
        }
        set({ unreadCounts: map });
      },

      loadStarredCount: async () => {
        const starredCount = await getStarredCount();
        set({ starredCount });
      },

      setEntriesSearch: (search: string) => {
        set({ entriesSearch: search });
      },

      loadEntries: async (feedId: number) => {
        set({ entriesStatus: RssStatus.LOADING });
        try {
          const search = get().entriesSearch;
          const [entries, total] = await Promise.all([
            listRssEntriesByFeed(feedId, RSS_ENTRY_PAGE_SIZE, 0, search),
            countRssEntriesByFeed(feedId, search),
          ]);
          set({
            entries,
            entriesTotal: total,
            entriesHasMore: entries.length < total,
            entriesScope: { kind: "feed", feedId },
            entriesStatus: RssStatus.SUCCESS,
          });
        } catch (error) {
          console.error("[RSS] 加载订阅文章失败:", error);
          set({ entriesStatus: RssStatus.FAIL });
        }
      },

      loadUnreadEntries: async () => {
        set({ entriesStatus: RssStatus.LOADING });
        try {
          const search = get().entriesSearch;
          const [entries, total] = await Promise.all([
            listUnreadRssEntries(RSS_ENTRY_PAGE_SIZE, 0, search),
            countUnreadRssEntries(search),
          ]);
          set({
            entries,
            entriesTotal: total,
            entriesHasMore: entries.length < total,
            entriesScope: { kind: "unread" },
            entriesStatus: RssStatus.SUCCESS,
          });
        } catch (error) {
          console.error("[RSS] 加载未读文章失败:", error);
          set({ entriesStatus: RssStatus.FAIL });
        }
      },

      loadStarredEntries: async () => {
        set({ entriesStatus: RssStatus.LOADING });
        try {
          const search = get().entriesSearch;
          const [entries, total] = await Promise.all([
            listStarredRssEntries(RSS_ENTRY_PAGE_SIZE, 0, search),
            countStarredRssEntries(search),
          ]);
          set({
            entries,
            entriesTotal: total,
            entriesHasMore: entries.length < total,
            entriesScope: { kind: "starred" },
            entriesStatus: RssStatus.SUCCESS,
          });
        } catch (error) {
          console.error("[RSS] 加载收藏文章失败:", error);
          set({ entriesStatus: RssStatus.FAIL });
        }
      },

      loadAllEntries: async () => {
        set({ entriesStatus: RssStatus.LOADING });
        try {
          const search = get().entriesSearch;
          const [entries, total] = await Promise.all([
            listAllRssEntries(RSS_ENTRY_PAGE_SIZE, 0, search),
            countAllRssEntries(search),
          ]);
          set({
            entries,
            entriesTotal: total,
            entriesHasMore: entries.length < total,
            entriesScope: { kind: "all" },
            entriesStatus: RssStatus.SUCCESS,
          });
        } catch (error) {
          console.error("[RSS] 加载全部文章失败:", error);
          set({ entriesStatus: RssStatus.FAIL });
        }
      },

      loadCategoryEntries: async (category: string) => {
        set({ entriesStatus: RssStatus.LOADING });
        try {
          const search = get().entriesSearch;
          const [entries, total] = await Promise.all([
            listRssEntriesByCategory(category, RSS_ENTRY_PAGE_SIZE, 0, search),
            countRssEntriesByCategory(category, search),
          ]);
          set({
            entries,
            entriesTotal: total,
            entriesHasMore: entries.length < total,
            entriesScope: { kind: "category", category },
            entriesStatus: RssStatus.SUCCESS,
          });
        } catch (error) {
          console.error("[RSS] 加载分类文章失败:", error);
          set({ entriesStatus: RssStatus.FAIL });
        }
      },

      loadMoreEntries: async () => {
        const { entriesScope, entries, entriesHasMore, entriesSearch } = get();
        if (!entriesScope || !entriesHasMore) return;
        const offset = countLoadedEntriesInScope(entriesScope, entries);
        let nextEntries: RssEntry[] = [];
        if (entriesScope.kind === "feed") {
          nextEntries = await listRssEntriesByFeed(
            entriesScope.feedId,
            RSS_ENTRY_PAGE_SIZE,
            offset,
            entriesSearch,
          );
        } else if (entriesScope.kind === "unread") {
          nextEntries = await listUnreadRssEntries(
            RSS_ENTRY_PAGE_SIZE,
            offset,
            entriesSearch,
          );
        } else if (entriesScope.kind === "starred") {
          nextEntries = await listStarredRssEntries(
            RSS_ENTRY_PAGE_SIZE,
            offset,
            entriesSearch,
          );
        } else if (entriesScope.kind === "all") {
          nextEntries = await listAllRssEntries(
            RSS_ENTRY_PAGE_SIZE,
            offset,
            entriesSearch,
          );
        } else if (entriesScope.kind === "category") {
          nextEntries = await listRssEntriesByCategory(
            entriesScope.category,
            RSS_ENTRY_PAGE_SIZE,
            offset,
            entriesSearch,
          );
        }
        const merged = [...entries, ...nextEntries];
        const loadedCount = countLoadedEntriesInScope(entriesScope, merged);
        set({
          entries: merged,
          entriesHasMore: loadedCount < get().entriesTotal,
        });
      },

      clearEntries: () => {
        set({
          entries: [],
          entriesTotal: 0,
          entriesHasMore: false,
          entriesScope: null,
          entriesStatus: RssStatus.SUCCESS,
        });
      },

      subscribe: async (url: string, category?: string, title?: string) => {
        const localBilibiliMetadata = isLocalBilibiliFeedUrl(url)
          ? getLocalBilibiliFeedMetadata(url, title)
          : null;
        const preview = localBilibiliMetadata ? null : await previewFeed(url);
        if (preview && !preview.valid) {
          throw new Error(preview.message);
        }

        const feedUrl = preview ? preview.finalUrl || preview.url : url;
        let feed =
          (await getRssFeedByUrl(feedUrl)) ||
          (feedUrl !== url ? await getRssFeedByUrl(url) : null);
        const isNewFeed = !feed;
        if (!feed) {
          feed = await createRssFeed({
            title:
              title ||
              preview?.title ||
              localBilibiliMetadata?.title ||
              feedUrl,
            description:
              preview?.description ??
              localBilibiliMetadata?.description ??
              undefined,
            url: feedUrl,
            siteUrl:
              preview?.siteUrl ?? localBilibiliMetadata?.siteUrl ?? undefined,
            feedType:
              preview?.feedType ?? localBilibiliMetadata?.feedType ?? "rss",
          });
        }
        const subscription = await createRssSubscription({
          feedId: feed.id,
          category,
          title,
        });
        const result = await refreshRssFeed(feed.id);
        if (result.error) {
          await deleteRssSubscription(subscription.id);
          if (isNewFeed) {
            await deleteRssFeed(feed.id);
          }
          throw new Error(result.error);
        }
        await get().loadFeeds();
        await get().loadSubscriptions();
        await get().loadCategories();
        await get().loadUnreadCounts();

        const { selectedSubscriptionId, subscriptions, filterMode } = get();
        const selectedSubscription = subscriptions.find(
          (subscription) => subscription.id === selectedSubscriptionId,
        );
        if (selectedSubscription?.feedId === feed.id) {
          await get().loadEntries(feed.id);
        } else if (!selectedSubscriptionId && filterMode === "all") {
          await get().loadAllEntries();
        } else if (!selectedSubscriptionId && filterMode === "unread") {
          await get().loadUnreadEntries();
        } else if (!selectedSubscriptionId && filterMode === "starred") {
          await get().loadStarredEntries();
        }
      },

      subscribeBilibiliFollowings: async (category?: string) => {
        await get().subscribe(
          BILIBILI_FOLLOWINGS_DYNAMIC_FEED_URL,
          category || BILIBILI_DEFAULT_CATEGORY,
          "我的 Bilibili 关注动态",
        );
      },

      unsubscribe: async (subscriptionId: number) => {
        const sub = get().subscriptions.find((s) => s.id === subscriptionId);
        await deleteRssSubscription(subscriptionId);
        if (sub) {
          const remaining = get().subscriptions.filter(
            (s) => s.feedId === sub.feedId && s.id !== subscriptionId,
          );
          if (remaining.length === 0) {
            await deleteRssFeed(sub.feedId);
          }
        }
        await get().loadSubscriptions();
        await get().loadCategories();
        await get().loadFeeds();
      },

      updateSubscription: async (
        id: number,
        data: { title?: string; category?: string },
      ) => {
        await updateRssSubscription({ id, ...data });
        await get().loadSubscriptions();
        await get().loadCategories();
      },

      markRead: async (entryId: number) => {
        const { entries, entriesScope, entriesTotal } = get();
        const entry = entries.find((e) => e.id === entryId);
        const nextEntries = entries.map((e) =>
          e.id === entryId ? { ...e, isRead: 1 } : e,
        );
        const nextTotal =
          entriesScope?.kind === "unread" && entry && !entry.isRead
            ? Math.max(entriesTotal - 1, 0)
            : entriesTotal;
        set({
          entries: nextEntries,
          entriesTotal: nextTotal,
          entriesHasMore:
            countLoadedEntriesInScope(entriesScope, nextEntries) < nextTotal,
        });
        await markRssEntryRead(entryId);
        await get().loadUnreadCounts();
      },

      markUnread: async (entryId: number) => {
        const { entries, entriesScope, entriesTotal } = get();
        const entry = entries.find((e) => e.id === entryId);
        const nextEntries = entries.map((e) =>
          e.id === entryId ? { ...e, isRead: 0 } : e,
        );
        const nextTotal =
          entriesScope?.kind === "unread" && entry && entry.isRead
            ? entriesTotal + 1
            : entriesTotal;
        set({
          entries: nextEntries,
          entriesTotal: nextTotal,
          entriesHasMore:
            countLoadedEntriesInScope(entriesScope, nextEntries) < nextTotal,
        });
        await markRssEntryUnread(entryId);
        await get().loadUnreadCounts();
      },

      markAllRead: async (feedId: number) => {
        await markAllRssEntriesReadByFeed(feedId);
        set({
          entries: get().entries.map((e) =>
            e.feedId === feedId ? { ...e, isRead: 1 } : e,
          ),
        });
        await get().loadUnreadCounts();
      },

      toggleStar: async (entryId: number) => {
        const result = await toggleRssEntryStar(entryId);
        if (result) {
          const { entries, entriesScope, entriesTotal } = get();
          const entry = entries.find((e) => e.id === entryId);
          const nextEntries = entries.map((e) =>
            e.id === entryId ? { ...e, isStarred: result.isStarred } : e,
          );
          let nextTotal = entriesTotal;
          if (entriesScope?.kind === "starred" && entry) {
            if (entry.isStarred && !result.isStarred) {
              nextTotal = Math.max(entriesTotal - 1, 0);
            } else if (!entry.isStarred && result.isStarred) {
              nextTotal = entriesTotal + 1;
            }
          }
          set({
            entries: nextEntries,
            entriesTotal: nextTotal,
            entriesHasMore:
              countLoadedEntriesInScope(entriesScope, nextEntries) < nextTotal,
          });
          await get().loadStarredCount();
        }
      },

      deleteEntry: async (entryId: number) => {
        await deleteRssEntry(entryId);
        set({
          entries: get().entries.filter((entry) => entry.id !== entryId),
          entriesTotal: Math.max(get().entriesTotal - 1, 0),
        });
        await Promise.all([get().loadUnreadCounts(), get().loadStarredCount()]);
      },

      refreshFeed: async (feedId: number) => {
        set({ isRefreshing: true });
        try {
          const result = await refreshRssFeed(feedId);
          if (result.error) {
            throw new Error(result.error);
          }
          await get().loadUnreadCounts();
          const { entriesScope } = get();
          if (entriesScope?.kind === "feed" && entriesScope.feedId === feedId) {
            await get().loadEntries(feedId);
          }
        } finally {
          set({ isRefreshing: false });
        }
      },

      refreshAll: async () => {
        set({ isRefreshing: true });
        try {
          await refreshAllRssFeeds();
          await get().loadUnreadCounts();
          const { entriesScope } = get();
          if (entriesScope?.kind === "feed") {
            await get().loadEntries(entriesScope.feedId);
          } else if (entriesScope?.kind === "unread") {
            await get().loadUnreadEntries();
          } else if (entriesScope?.kind === "starred") {
            await get().loadStarredEntries();
          } else if (entriesScope?.kind === "all") {
            await get().loadAllEntries();
          } else if (entriesScope?.kind === "category") {
            await get().loadCategoryEntries(entriesScope.category);
          }
        } finally {
          set({ isRefreshing: false });
        }
      },

      discoverFeeds: async (url: string) => {
        return await discoverFeeds(url);
      },

      previewFeed: async (url: string) => {
        return await previewFeed(url);
      },

      extractContent: async (url: string) => {
        const result = await extractContent(url);
        return result?.content ?? null;
      },

      setSelectedSubscription: (id: number | null) => {
        set({ selectedSubscriptionId: id, selectedEntryId: null });
      },

      setSelectedEntry: (id: number | null) => {
        set({ selectedEntryId: id });
        if (id) {
          const entry = get().entries.find((e) => e.id === id);
          if (entry && !entry.isRead) {
            get().markRead(id);
          }
        }
      },

      setFilterMode: (mode: RssFilterMode) => {
        set({ filterMode: mode });
      },
    }),
    {
      name: "rss-store",
      partialize: (state) => ({
        selectedSubscriptionId: state.selectedSubscriptionId,
        filterMode: state.filterMode,
      }),
    },
  ),
);

export default useRssStore;
