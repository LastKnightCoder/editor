import { useMemo } from "react";
import type { RssEntry, ReadLaterItem } from "@/types";
import type { UnifiedArticleItem } from "../types";
import { resolveBilibiliVideoArticleUrl } from "../utils/bilibiliVideoMeta";

export function normalizeRssEntry(entry: RssEntry): UnifiedArticleItem {
  const content = entry.content || entry.description || null;
  return {
    id: `rss-${entry.id}`,
    source: "rss",
    sourceId: entry.id,
    title: entry.title || "无标题",
    url: resolveBilibiliVideoArticleUrl({
      url: entry.url,
      content,
    }),
    excerpt: entry.description?.replace(/<[^>]*>/g, "").slice(0, 200) || null,
    author: entry.author || null,
    publishedAt: entry.publishedAt || null,
    isRead: !!entry.isRead,
    isStarred: !!entry.isStarred,
    isArchived: false,
    badge: "RSS",
    content,
    readabilityContent: entry.readabilityContent || null,
    feedId: entry.feedId,
  };
}

export function normalizeReadLaterItem(
  item: ReadLaterItem,
): UnifiedArticleItem {
  const badge =
    item.sourceType === "rss_entry"
      ? "RSS"
      : item.sourceType === "web_clip"
        ? "剪藏"
        : item.sourceType === "article"
          ? "文章"
          : "链接";

  return {
    id: `rl-${item.id}`,
    source: "readlater",
    sourceId: item.id,
    title: item.title,
    url: item.url || null,
    excerpt: item.excerpt || null,
    author: null,
    publishedAt: item.createTime,
    isRead: false,
    isStarred: !!item.isStarred,
    isArchived: !!item.isArchived,
    badge,
    content: item.content || null,
  };
}

export function useUnifiedRssEntries(
  entries: RssEntry[],
): UnifiedArticleItem[] {
  return useMemo(() => entries.map(normalizeRssEntry), [entries]);
}

export function useUnifiedReadLaterItems(
  items: ReadLaterItem[],
): UnifiedArticleItem[] {
  return useMemo(() => items.map(normalizeReadLaterItem), [items]);
}
