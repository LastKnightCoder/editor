import { create } from "zustand";
import { persist } from "zustand/middleware";
import { RssFeed, RssSubscription, RssEntry } from "@/types";
import { on } from "@/electron";
import {
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
  markRssEntryRead,
  markAllRssEntriesReadByFeed,
  toggleRssEntryStar,
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

interface IState {
  feeds: RssFeed[];
  subscriptions: RssSubscription[];
  categories: string[];
  entries: RssEntry[];
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
  subscribe: (url: string, category?: string, title?: string) => Promise<void>;
  unsubscribe: (subscriptionId: number) => Promise<void>;
  updateSubscription: (
    id: number,
    data: { title?: string; category?: string },
  ) => Promise<void>;
  markRead: (entryId: number) => void;
  markAllRead: (feedId: number) => void;
  toggleStar: (entryId: number) => void;
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

      loadEntries: async (feedId: number) => {
        set({ entriesStatus: RssStatus.LOADING });
        try {
          const entries = await listRssEntriesByFeed(feedId);
          set({ entries, entriesStatus: RssStatus.SUCCESS });
        } catch {
          set({ entriesStatus: RssStatus.FAIL });
        }
      },

      loadUnreadEntries: async () => {
        set({ entriesStatus: RssStatus.LOADING });
        try {
          const entries = await listUnreadRssEntries(100);
          set({ entries, entriesStatus: RssStatus.SUCCESS });
        } catch {
          set({ entriesStatus: RssStatus.FAIL });
        }
      },

      loadStarredEntries: async () => {
        set({ entriesStatus: RssStatus.LOADING });
        try {
          const entries = await listStarredRssEntries(100);
          set({ entries, entriesStatus: RssStatus.SUCCESS });
        } catch {
          set({ entriesStatus: RssStatus.FAIL });
        }
      },

      loadAllEntries: async () => {
        set({ entriesStatus: RssStatus.LOADING });
        try {
          const entries = await listAllRssEntries(100);
          set({ entries, entriesStatus: RssStatus.SUCCESS });
        } catch {
          set({ entriesStatus: RssStatus.FAIL });
        }
      },

      loadCategoryEntries: async (category: string) => {
        set({ entriesStatus: RssStatus.LOADING });
        try {
          const entries = await listRssEntriesByCategory(category, 100);
          set({ entries, entriesStatus: RssStatus.SUCCESS });
        } catch {
          set({ entriesStatus: RssStatus.FAIL });
        }
      },

      subscribe: async (url: string, category?: string, title?: string) => {
        const preview = await previewFeed(url);
        if (!preview.valid) {
          throw new Error(preview.message);
        }

        const feedUrl = preview.finalUrl || preview.url;
        let feed =
          (await getRssFeedByUrl(feedUrl)) ||
          (feedUrl !== url ? await getRssFeedByUrl(url) : null);
        const isNewFeed = !feed;
        if (!feed) {
          feed = await createRssFeed({
            title: title || preview.title || feedUrl,
            description: preview.description ?? undefined,
            url: feedUrl,
            siteUrl: preview.siteUrl ?? undefined,
            feedType: preview.feedType,
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
        await markRssEntryRead(entryId);
        set({
          entries: get().entries.map((e) =>
            e.id === entryId ? { ...e, isRead: 1 } : e,
          ),
        });
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
          set({
            entries: get().entries.map((e) =>
              e.id === entryId ? { ...e, isStarred: result.isStarred } : e,
            ),
          });
          await get().loadStarredCount();
        }
      },

      refreshFeed: async (feedId: number) => {
        set({ isRefreshing: true });
        try {
          const result = await refreshRssFeed(feedId);
          if (result.error) {
            throw new Error(result.error);
          }
          await get().loadUnreadCounts();
          const { selectedSubscriptionId, subscriptions } = get();
          if (selectedSubscriptionId) {
            const sub = subscriptions.find(
              (s) => s.id === selectedSubscriptionId,
            );
            if (sub && sub.feedId === feedId) {
              await get().loadEntries(feedId);
            }
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
