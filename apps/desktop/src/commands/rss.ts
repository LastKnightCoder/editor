import { invoke } from "@/electron";
import {
  CreateRssFeedPayload,
  UpdateRssFeedPayload,
  RssFeed,
  CreateRssSubscriptionPayload,
  UpdateRssSubscriptionPayload,
  RssSubscription,
  RssEntry,
  RssFeedPreviewResult,
  UpdateRssEntryPayload,
  CreateReadLaterPayload,
  UpdateReadLaterPayload,
  ReadLaterItem,
} from "@/types";

export const BILIBILI_FOLLOWINGS_DYNAMIC_FEED_URL =
  "tau://rss/bilibili/followings-dynamic";
export const BILIBILI_DEFAULT_CATEGORY = "B 站";
export const BILIBILI_LOCAL_FEED_PREFIX = "tau://rss/bilibili/";

export const isLocalBilibiliFeedUrl = (url: string): boolean =>
  url.startsWith(BILIBILI_LOCAL_FEED_PREFIX);

export const getLocalBilibiliFeedMetadata = (
  url: string,
  title?: string,
): {
  title: string;
  description: string;
  siteUrl: string | null;
  feedType: "rss";
} | null => {
  if (url === BILIBILI_FOLLOWINGS_DYNAMIC_FEED_URL) {
    const feedTitle = title || "我的 Bilibili 关注动态";
    return {
      title: feedTitle,
      description: feedTitle,
      siteUrl: "https://t.bilibili.com",
      feedType: "rss",
    };
  }

  const userDynamicPrefix = `${BILIBILI_LOCAL_FEED_PREFIX}user-dynamic/`;
  if (url.startsWith(userDynamicPrefix)) {
    const uid = decodeURIComponent(url.slice(userDynamicPrefix.length));
    const feedTitle = title || `Bilibili UP ${uid} 动态`;
    return {
      title: feedTitle,
      description: feedTitle,
      siteUrl: `https://space.bilibili.com/${uid}/dynamic`,
      feedType: "rss",
    };
  }

  const userVideoPrefix = `${BILIBILI_LOCAL_FEED_PREFIX}user-video/`;
  if (url.startsWith(userVideoPrefix)) {
    const uid = decodeURIComponent(url.slice(userVideoPrefix.length));
    const feedTitle = title || `Bilibili UP ${uid} 投稿`;
    return {
      title: feedTitle,
      description: feedTitle,
      siteUrl: `https://space.bilibili.com/${uid}/video`,
      feedType: "rss",
    };
  }

  return null;
};

// === RSS Feed ===

export const createRssFeed = async (
  payload: CreateRssFeedPayload,
): Promise<RssFeed> => {
  return await invoke("rss-feed:create", payload);
};

export const updateRssFeed = async (
  payload: UpdateRssFeedPayload,
): Promise<RssFeed> => {
  return await invoke("rss-feed:update", payload);
};

export const getRssFeedById = async (id: number): Promise<RssFeed | null> => {
  return await invoke("rss-feed:get", id);
};

export const getRssFeedByUrl = async (url: string): Promise<RssFeed | null> => {
  return await invoke("rss-feed:get-by-url", url);
};

export const listRssFeeds = async (): Promise<RssFeed[]> => {
  return await invoke("rss-feed:list");
};

export const listActiveRssFeeds = async (): Promise<RssFeed[]> => {
  return await invoke("rss-feed:list-active");
};

export const deleteRssFeed = async (id: number): Promise<number> => {
  return await invoke("rss-feed:delete", id);
};

// === RSS Subscription ===

export const createRssSubscription = async (
  payload: CreateRssSubscriptionPayload,
): Promise<RssSubscription> => {
  return await invoke("rss-subscription:create", payload);
};

export const updateRssSubscription = async (
  payload: UpdateRssSubscriptionPayload,
): Promise<RssSubscription> => {
  return await invoke("rss-subscription:update", payload);
};

export const getRssSubscriptionById = async (
  id: number,
): Promise<RssSubscription | null> => {
  return await invoke("rss-subscription:get", id);
};

export const listRssSubscriptions = async (): Promise<RssSubscription[]> => {
  return await invoke("rss-subscription:list");
};

export const listRssSubscriptionsByCategory = async (
  category: string,
): Promise<RssSubscription[]> => {
  return await invoke("rss-subscription:list-by-category", category);
};

export const getRssCategories = async (): Promise<string[]> => {
  return await invoke("rss-subscription:get-categories");
};

export const deleteRssSubscription = async (id: number): Promise<number> => {
  return await invoke("rss-subscription:delete", id);
};

// === RSS Entry ===

export const getRssEntryById = async (id: number): Promise<RssEntry | null> => {
  return await invoke("rss-entry:get", id);
};

export const listRssEntriesByFeed = async (
  feedId: number,
  limit = 50,
  offset = 0,
  search = "",
): Promise<RssEntry[]> => {
  return await invoke("rss-entry:list-by-feed", feedId, limit, offset, search);
};

export const listRssEntriesBySubscription = async (
  subscriptionId: number,
  limit = 50,
  offset = 0,
  search = "",
): Promise<RssEntry[]> => {
  return await invoke(
    "rss-entry:list-by-subscription",
    subscriptionId,
    limit,
    offset,
    search,
  );
};

export const listUnreadRssEntries = async (
  limit = 50,
  offset = 0,
  search = "",
): Promise<RssEntry[]> => {
  return await invoke("rss-entry:list-unread", limit, offset, search);
};

export const listStarredRssEntries = async (
  limit = 50,
  offset = 0,
  search = "",
): Promise<RssEntry[]> => {
  return await invoke("rss-entry:list-starred", limit, offset, search);
};

export const listAllRssEntries = async (
  limit = 50,
  offset = 0,
  search = "",
): Promise<RssEntry[]> => {
  return await invoke("rss-entry:list-all", limit, offset, search);
};

export const listRssEntriesByCategory = async (
  category: string,
  limit = 50,
  offset = 0,
  search = "",
): Promise<RssEntry[]> => {
  return await invoke(
    "rss-entry:list-by-category",
    category,
    limit,
    offset,
    search,
  );
};

export const countRssEntriesByFeed = async (
  feedId: number,
  search = "",
): Promise<number> => {
  return await invoke("rss-entry:count-by-feed", feedId, search);
};

export const countUnreadRssEntries = async (search = ""): Promise<number> => {
  return await invoke("rss-entry:count-unread", search);
};

export const countStarredRssEntries = async (search = ""): Promise<number> => {
  return await invoke("rss-entry:count-starred", search);
};

export const countAllRssEntries = async (search = ""): Promise<number> => {
  return await invoke("rss-entry:count-all", search);
};

export const countRssEntriesByCategory = async (
  category: string,
  search = "",
): Promise<number> => {
  return await invoke("rss-entry:count-by-category", category, search);
};

export const markRssEntryRead = async (id: number): Promise<number> => {
  return await invoke("rss-entry:mark-read", id);
};

export const markRssEntryUnread = async (id: number): Promise<number> => {
  return await invoke("rss-entry:mark-unread", id);
};

export const markAllRssEntriesReadByFeed = async (
  feedId: number,
): Promise<number> => {
  return await invoke("rss-entry:mark-all-read-by-feed", feedId);
};

export const toggleRssEntryStar = async (
  id: number,
): Promise<RssEntry | null> => {
  return await invoke("rss-entry:toggle-star", id);
};

export const deleteRssEntry = async (id: number): Promise<number> => {
  return await invoke("rss-entry:delete", id);
};

export const updateRssEntry = async (
  payload: UpdateRssEntryPayload,
): Promise<RssEntry> => {
  return await invoke("rss-entry:update", payload);
};

export const getUnreadCounts = async (): Promise<
  { feedId: number; count: number }[]
> => {
  return await invoke("rss-entry:get-unread-counts");
};

export const getStarredCount = async (): Promise<number> => {
  return await invoke("rss-entry:get-starred-count");
};

// === RSS Service ===

export const refreshRssFeed = async (
  feedId: number,
): Promise<{ feedId: number; newCount: number; error?: string }> => {
  return await invoke("rss:refresh-feed", feedId);
};

export const refreshAllRssFeeds = async (): Promise<
  { feedId: number; newCount: number; error?: string }[]
> => {
  return await invoke("rss:refresh-all");
};

export const discoverFeeds = async (
  url: string,
): Promise<{ url: string; title: string; type: string }[]> => {
  return await invoke("rss:discover-feeds", url);
};

export const previewFeed = async (
  url: string,
): Promise<RssFeedPreviewResult> => {
  return await invoke("rss:preview-feed", url);
};

export const extractContent = async (
  url: string,
): Promise<{
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  byline: string | null;
  siteName: string | null;
  length: number;
} | null> => {
  return await invoke("rss:extract-content", url);
};

// === Read Later ===

export const addToReadLater = async (
  payload: CreateReadLaterPayload,
): Promise<ReadLaterItem> => {
  return await invoke("read-later:add", payload);
};

export const updateReadLater = async (
  payload: UpdateReadLaterPayload,
): Promise<ReadLaterItem> => {
  return await invoke("read-later:update", payload);
};

export const getReadLaterById = async (
  id: number,
): Promise<ReadLaterItem | null> => {
  return await invoke("read-later:get", id);
};

export const listReadLater = async (
  limit = 50,
  offset = 0,
): Promise<ReadLaterItem[]> => {
  return await invoke("read-later:list", limit, offset);
};

export const listStarredReadLater = async (
  limit = 50,
  offset = 0,
): Promise<ReadLaterItem[]> => {
  return await invoke("read-later:list-starred", limit, offset);
};

export const listArchivedReadLater = async (
  limit = 50,
  offset = 0,
): Promise<ReadLaterItem[]> => {
  return await invoke("read-later:list-archived", limit, offset);
};

export const starReadLater = async (id: number): Promise<number> => {
  return await invoke("read-later:star", id);
};

export const unstarReadLater = async (id: number): Promise<number> => {
  return await invoke("read-later:unstar", id);
};

export const archiveReadLater = async (id: number): Promise<number> => {
  return await invoke("read-later:archive", id);
};

export const unarchiveReadLater = async (id: number): Promise<number> => {
  return await invoke("read-later:unarchive", id);
};

export const removeReadLater = async (id: number): Promise<number> => {
  return await invoke("read-later:remove", id);
};

export const checkReadLaterExists = async (
  sourceType: string,
  sourceId: number,
): Promise<boolean> => {
  return await invoke("read-later:check-exists", sourceType, sourceId);
};

export const removeReadLaterBySource = async (
  sourceType: string,
  sourceId: number,
): Promise<number> => {
  return await invoke("read-later:remove-by-source", sourceType, sourceId);
};

export const getReadLaterCount = async (): Promise<number> => {
  return await invoke("read-later:get-count");
};

// === OPML ===

export const importOpml = async (): Promise<{
  imported: number;
  errors: string[];
}> => {
  return await invoke("rss:import-opml");
};

export const exportOpml = async (): Promise<{
  success: boolean;
  path?: string;
}> => {
  return await invoke("rss:export-opml");
};
