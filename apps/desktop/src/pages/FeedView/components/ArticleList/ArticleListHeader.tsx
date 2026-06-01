import { CheckOutlined, ReloadOutlined } from "@ant-design/icons";
import useThemeColors from "@/hooks/useThemeColors";
import useRssStore from "@/stores/useRssStore";
import type { SidebarSelection } from "../../types";

interface ArticleListHeaderProps {
  selection: SidebarSelection;
  articleCount?: number;
  onMarkAllRead: () => void;
  onRefresh: () => void;
}

export default function ArticleListHeader({
  selection,
  articleCount,
  onMarkAllRead,
  onRefresh,
}: ArticleListHeaderProps) {
  const themeColors = useThemeColors();
  const feeds = useRssStore((s) => s.feeds);
  const subscriptions = useRssStore((s) => s.subscriptions);
  const isRefreshing = useRssStore((s) => s.isRefreshing);

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
      const sub = subscriptions.find((s) => s.id === selection.subscriptionId);
      const feed = sub ? feeds.find((f) => f.id === sub.feedId) : null;
      return getDisplayName(sub?.title ?? null, feed?.title, feed?.url);
    }
    if (selection.kind === "category") {
      return selection.category;
    }
    return "";
  };

  const showRssActions =
    selection.kind !== "smart" || selection.group !== "readlater";

  return (
    <div
      className={`flex items-center justify-between px-4 py-3 border-b ${themeColors.borderClass} ${themeColors.glassPanelBg} backdrop-blur-sm`}
    >
      <div className="flex items-baseline gap-2 min-w-0">
        <span
          className={`text-[15px] font-bold tracking-tight truncate ${themeColors.textClass}`}
        >
          {getTitle()}
        </span>
        {articleCount !== undefined && articleCount > 0 && (
          <span
            className={`text-[11px] shrink-0 ${themeColors.secondaryTextClass}`}
          >
            {articleCount} 篇
          </span>
        )}
      </div>
      {showRssActions && (
        <div className="flex items-center gap-1">
          {selection.kind === "subscription" && (
            <button
              className={`flex h-8 w-8 items-center justify-center rounded-lg border-none cursor-pointer bg-transparent text-xs transition-all duration-200 hover:scale-105 active:scale-95 ${themeColors.secondaryTextClass} ${themeColors.hoverClass}`}
              title="全部已读"
              onClick={onMarkAllRead}
            >
              <CheckOutlined />
            </button>
          )}
          <button
            className={`flex h-8 w-8 items-center justify-center rounded-lg border-none cursor-pointer bg-transparent text-xs transition-all duration-200 hover:scale-105 active:scale-95 ${themeColors.secondaryTextClass} ${themeColors.hoverClass}`}
            title="刷新"
            onClick={onRefresh}
          >
            <ReloadOutlined spin={isRefreshing} />
          </button>
        </div>
      )}
    </div>
  );
}

function getDisplayName(
  subTitle: string | null,
  feedTitle: string | undefined,
  feedUrl: string | undefined,
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
