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
  refreshRssFeed,
  refreshAllRssFeeds,
  discoverFeeds,
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
        let feed = await getRssFeedByUrl(url);
        if (!feed) {
          feed = await createRssFeed({
            title: title || url,
            url,
          });
        }
        await createRssSubscription({
          feedId: feed.id,
          category,
          title,
        });
        await get().loadSubscriptions();
        await get().loadCategories();
        await refreshRssFeed(feed.id);
        await get().loadUnreadCounts();
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
        }
      },

      refreshFeed: async (feedId: number) => {
        set({ isRefreshing: true });
        try {
          await refreshRssFeed(feedId);
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
