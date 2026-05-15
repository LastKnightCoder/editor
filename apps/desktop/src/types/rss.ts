export interface RssFeed {
  id: number;
  createTime: number;
  updateTime: number;
  title: string;
  description: string | null;
  url: string;
  siteUrl: string | null;
  imageUrl: string | null;
  feedType: "rss" | "atom" | "json";
  lastFetchedAt: number | null;
  lastEntryAt: number | null;
  fetchInterval: number;
  errorCount: number;
  lastError: string | null;
  isActive: number;
}

export interface CreateRssFeedPayload {
  title: string;
  description?: string;
  url: string;
  siteUrl?: string;
  imageUrl?: string;
  feedType?: "rss" | "atom" | "json";
  fetchInterval?: number;
}

export interface UpdateRssFeedPayload {
  id: number;
  title?: string;
  description?: string;
  url?: string;
  siteUrl?: string;
  imageUrl?: string;
  feedType?: "rss" | "atom" | "json";
  lastFetchedAt?: number;
  lastEntryAt?: number;
  fetchInterval?: number;
  errorCount?: number;
  lastError?: string | null;
  isActive?: number;
}

export interface RssSubscription {
  id: number;
  createTime: number;
  updateTime: number;
  feedId: number;
  title: string | null;
  category: string | null;
  viewType: "article" | "podcast" | "video" | "picture" | "notification";
  isMuted: number;
}

export interface CreateRssSubscriptionPayload {
  feedId: number;
  title?: string;
  category?: string;
  viewType?: "article" | "podcast" | "video" | "picture" | "notification";
}

export interface UpdateRssSubscriptionPayload {
  id: number;
  title?: string;
  category?: string;
  viewType?: "article" | "podcast" | "video" | "picture" | "notification";
  isMuted?: number;
}

export interface RssEntry {
  id: number;
  createTime: number;
  updateTime: number;
  feedId: number;
  guid: string;
  title: string | null;
  url: string | null;
  author: string | null;
  description: string | null;
  content: string | null;
  readabilityContent: string | null;
  publishedAt: number | null;
  media: string | null;
  categories: string | null;
  enclosureUrl: string | null;
  enclosureType: string | null;
  enclosureLength: number | null;
  isRead: number;
  isStarred: number;
}

export interface CreateRssEntryPayload {
  feedId: number;
  guid: string;
  title?: string;
  url?: string;
  author?: string;
  description?: string;
  content?: string;
  readabilityContent?: string;
  publishedAt?: number;
  media?: string;
  categories?: string;
  enclosureUrl?: string;
  enclosureType?: string;
  enclosureLength?: number;
}

export interface UpdateRssEntryPayload {
  id: number;
  title?: string;
  content?: string;
  readabilityContent?: string;
  isRead?: number;
  isStarred?: number;
}

export interface ReadLaterItem {
  id: number;
  createTime: number;
  updateTime: number;
  sourceType: "rss_entry" | "web_clip" | "web_link" | "article" | "url";
  sourceId: number | null;
  title: string;
  url: string | null;
  excerpt: string | null;
  content: string | null;
  isArchived: number;
  isStarred: number;
  tags: string | null;
  readingProgress: number;
}

export interface CreateReadLaterPayload {
  sourceType: "rss_entry" | "web_clip" | "web_link" | "article" | "url";
  sourceId?: number;
  title: string;
  url?: string;
  excerpt?: string;
  content?: string;
  tags?: string;
}

export interface UpdateReadLaterPayload {
  id: number;
  title?: string;
  excerpt?: string;
  content?: string;
  isArchived?: number;
  isStarred?: number;
  tags?: string;
  readingProgress?: number;
}
