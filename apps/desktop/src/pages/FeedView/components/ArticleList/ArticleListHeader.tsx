import { useEffect, useState } from "react";
import { CheckOutlined, ReloadOutlined } from "@ant-design/icons";
import { BILIBILI_FOLLOWINGS_DYNAMIC_FEED_URL } from "@/commands/rss";
import useThemeColors from "@/hooks/useThemeColors";
import useRssStore from "@/stores/useRssStore";
import type { SidebarSelection } from "../../types";

interface ArticleListHeaderProps {
  selection: SidebarSelection;
  articleCount?: number;
  search: string;
  onSearchChange: (search: string) => void;
  onMarkAllRead: () => void;
  onRefresh: () => void;
}

export default function ArticleListHeader({
  selection,
  articleCount,
  search,
  onSearchChange,
  onMarkAllRead,
  onRefresh,
}: ArticleListHeaderProps) {
  const [inputValue, setInputValue] = useState(search);
  const themeColors = useThemeColors();
  const feeds = useRssStore(s => s.feeds);
  const subscriptions = useRssStore(s => s.subscriptions);
  const isRefreshing = useRssStore(s => s.isRefreshing);
  const bilibiliFollowingsFeed = feeds.find(
    feed => feed.url === BILIBILI_FOLLOWINGS_DYNAMIC_FEED_URL
  );
  const hasBilibiliFollowingsSubscription = bilibiliFollowingsFeed
    ? subscriptions.some(sub => sub.feedId === bilibiliFollowingsFeed.id)
    : false;

  const getTitle = () => {
    if (selection.kind === "smart") {
      switch (selection.group) {
        case "all":
          return "全部";
        case "unread":
          return "未读";
        case "starred":
          return "收藏";
        case "readlater":
          return "稍后读";
      }
    }
    if (selection.kind === "subscription") {
      const sub = subscriptions.find(s => s.id === selection.subscriptionId);
      const feed = sub ? feeds.find(f => f.id === sub.feedId) : null;
      return getDisplayName(sub?.title ?? null, feed?.title, feed?.url);
    }
    if (selection.kind === "category") {
      return selection.category;
    }
    if (selection.kind === "bilibili-followings") {
      return "我订阅的动态";
    }
    return "";
  };

  const showRssActions =
    (selection.kind !== "smart" || selection.group !== "readlater") &&
    (selection.kind !== "bilibili-followings" || hasBilibiliFollowingsSubscription);

  useEffect(() => {
    setInputValue(search);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (inputValue !== search) {
        onSearchChange(inputValue);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [inputValue, onSearchChange, search]);

  return (
    <div
      className={`flex flex-col gap-2 border-b px-4 py-3 ${themeColors.borderClass} ${themeColors.glassPanelBg} backdrop-blur-sm`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className={`truncate text-[15px] font-bold tracking-tight ${themeColors.textClass}`}
          >
            {getTitle()}
          </span>
          <span className={`shrink-0 text-[11px] ${themeColors.secondaryTextClass}`}>
            {articleCount ?? 0} 篇
          </span>
        </div>
        {showRssActions && (
          <div className="flex items-center gap-1">
            {(selection.kind === "subscription" ||
              (selection.kind === "bilibili-followings" && hasBilibiliFollowingsSubscription)) && (
              <button
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-xs transition-all duration-200 hover:scale-105 active:scale-95 ${themeColors.secondaryTextClass} ${themeColors.hoverClass}`}
                title="全部已读"
                onClick={onMarkAllRead}
              >
                <CheckOutlined />
              </button>
            )}
            <button
              className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-xs transition-all duration-200 hover:scale-105 active:scale-95 ${themeColors.secondaryTextClass} ${themeColors.hoverClass}`}
              title="刷新"
              onClick={onRefresh}
            >
              <ReloadOutlined spin={isRefreshing} />
            </button>
          </div>
        )}
      </div>
      {showRssActions && (
        <label className="relative block">
          <svg
            className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${themeColors.secondaryTextClass}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={inputValue}
            placeholder="搜索标题、正文或作者"
            className="h-9 w-full rounded-xl border border-gray-200 bg-gray-50 px-9 text-[13px] text-gray-800 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-[var(--th-border-focus)] focus:bg-white focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.04),0_0_0_3px_rgba(59,130,246,0.15)] dark:border-slate-700 dark:bg-zinc-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-[var(--th-border-focus)] dark:focus:bg-zinc-950 dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]"
            onChange={event => setInputValue(event.target.value)}
          />
          {inputValue && (
            <button
              type="button"
              className={`absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-all ${themeColors.secondaryTextClass} ${themeColors.hoverClass}`}
              title="清空搜索"
              onClick={() => {
                setInputValue("");
                onSearchChange("");
              }}
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </label>
      )}
    </div>
  );
}

function getDisplayName(
  subTitle: string | null,
  feedTitle: string | undefined,
  feedUrl: string | undefined
): string {
  if (subTitle && !/^https?:\/\//i.test(subTitle)) return subTitle;
  if (feedTitle && !/^https?:\/\//i.test(feedTitle)) return feedTitle;
  const raw = subTitle || feedTitle || feedUrl;
  if (!raw) return "文章";
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "");
    return path && path !== "/" ? `${host}${path}` : host;
  } catch {
    return raw;
  }
}
