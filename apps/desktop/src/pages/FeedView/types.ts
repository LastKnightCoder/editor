export type SidebarSelection =
  | { kind: "smart"; group: "all" | "unread" | "starred" | "readlater" }
  | { kind: "subscription"; subscriptionId: number; feedId: number }
  | { kind: "category"; category: string }
  | { kind: "bilibili-followings" };

export interface UnifiedArticleItem {
  id: string;
  source: "rss" | "readlater";
  sourceId: number;
  title: string;
  url: string | null;
  excerpt: string | null;
  author: string | null;
  publishedAt: number | null;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  badge: string;
  content: string | null;
  readabilityContent?: string | null;
  feedId?: number;
}
