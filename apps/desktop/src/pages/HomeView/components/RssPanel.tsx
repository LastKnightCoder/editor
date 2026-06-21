import React, { useMemo } from "react";
import classNames from "classnames";
import {
  Rss,
  ArrowRight,
  RefreshCcw,
  Loader2,
  Video,
  Podcast,
} from "lucide-react";
import useThemeColors from "@/hooks/useThemeColors";
import useTabStore from "@/stores/useTabStore";
import { TabType, type ITab } from "@/types/tab";
import type { RssEntry, RssFeed } from "@/types/rss";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

interface RssPanelProps {
  items: RssEntry[];
  feeds: RssFeed[];
  unreadTotal: number;
  loading: boolean;
  onRefresh: () => void | Promise<void>;
}

type MediaType = "video" | "podcast" | "article";

const getMediaType = (entry: RssEntry): MediaType => {
  if (entry.enclosureType?.startsWith("video/")) return "video";
  if (entry.enclosureType?.startsWith("audio/")) return "podcast";
  return "article";
};

const stripHtml = (html: string | null): string =>
  html
    ? html
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";

const RssPanel: React.FC<RssPanelProps> = ({
  items,
  feeds,
  unreadTotal,
  loading,
  onRefresh,
}) => {
  const themeColors = useThemeColors();
  const panes = useTabStore((state) => state.panes);
  const updateTab = useTabStore((state) => state.updateTab);
  const switchTab = useTabStore((state) => state.switchTab);
  const createTab = useTabStore((state) => state.createTab);
  const openInNewTab = useTabStore((state) => state.openInNewTab);

  const previewItems = items.slice(0, 5);

  // feedId → feed 名称映射，便于显示来源
  const feedMap = useMemo(() => {
    const map = new Map<number, RssFeed>();
    feeds.forEach((feed) => map.set(feed.id, feed));
    return map;
  }, [feeds]);

  const getFeedName = (feedId: number): string => {
    const feed = feedMap.get(feedId);
    if (feed?.title && !/^https?:\/\//i.test(feed.title)) return feed.title;
    if (feed?.url) {
      try {
        return new URL(feed.url).hostname.replace(/^www\./, "");
      } catch {
        return feed.url;
      }
    }
    return "RSS";
  };

  // 点击单条文章：复用已存在的 Feed Tab，更新其 params 并切换激活，
  // FeedView 会读取 entryId 自动选中并打开该文章
  const handleOpenArticle = (entryId: number) => {
    const triggerRefresh = () => {
      // FeedView 选中未读文章后会自动标记已读，延迟刷新让首页列表反映最新未读状态
      window.setTimeout(() => {
        void onRefresh();
      }, 600);
    };

    for (const pane of panes) {
      const tab = pane.tabs.find(
        (t): t is ITab<typeof TabType.Feed> => t.type === TabType.Feed,
      );
      if (tab) {
        updateTab(pane.id, tab.id, { params: { entryId } });
        switchTab(pane.id, tab.id);
        triggerRefresh();
        return;
      }
    }
    createTab(TabType.Feed, { entryId });
    triggerRefresh();
  };

  return (
    <div
      className={classNames(
        "rounded-xl border p-4 min-h-[200px] flex flex-col",
        themeColors.cardBorderClass,
        themeColors.cardBgClass,
      )}
    >
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={classNames(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              themeColors.iconBgClass,
            )}
          >
            <Rss className={classNames("w-4 h-4", themeColors.iconTextClass)} />
          </div>
          <h3
            className={classNames(
              "text-sm font-semibold",
              themeColors.textClass,
            )}
          >
            订阅动态
          </h3>
          {unreadTotal > 0 && (
            <span
              className={classNames(
                "text-xs px-1.5 py-0.5 rounded-full font-medium",
                themeColors.badgeBgClass,
                themeColors.badgeTextClass,
              )}
            >
              {unreadTotal}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={loading}
            aria-label="刷新订阅动态"
            className={classNames(
              "inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors cursor-pointer disabled:opacity-50",
              themeColors.secondaryTextClass,
              themeColors.hoverClass,
            )}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => openInNewTab(TabType.Feed)}
            className={classNames(
              "text-xs flex items-center gap-1 transition-colors cursor-pointer",
              themeColors.secondaryTextClass,
              "hover:opacity-80",
            )}
          >
            查看全部
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 列表 */}
      {previewItems.length === 0 ? (
        <div
          className={classNames(
            "flex-1 flex items-center justify-center text-sm",
            themeColors.secondaryTextClass,
          )}
        >
          没有未读订阅 🎉
        </div>
      ) : (
        <div className="flex-1 space-y-1 overflow-y-auto min-h-0 pr-1">
          {previewItems.map((entry) => {
            const mediaType = getMediaType(entry);
            const excerpt = stripHtml(entry.description);
            return (
              <div
                key={entry.id}
                className={classNames(
                  "group flex items-start gap-2.5 px-2 py-1.5 rounded-lg transition-colors cursor-pointer",
                  themeColors.hoverClass,
                )}
                onClick={() => handleOpenArticle(entry.id)}
              >
                <div className="flex-1 min-w-0">
                  <p
                    className={classNames(
                      "text-sm truncate",
                      themeColors.textClass,
                    )}
                  >
                    {entry.title || "无标题"}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 min-h-4">
                    <span
                      className={classNames(
                        "text-xs shrink-0",
                        themeColors.secondaryTextClass,
                      )}
                    >
                      {getFeedName(entry.feedId)}
                    </span>
                    {mediaType === "video" && (
                      <Video
                        className={classNames(
                          "w-3 h-3 shrink-0",
                          themeColors.secondaryTextClass,
                        )}
                      />
                    )}
                    {mediaType === "podcast" && (
                      <Podcast
                        className={classNames(
                          "w-3 h-3 shrink-0",
                          themeColors.secondaryTextClass,
                        )}
                      />
                    )}
                    {entry.publishedAt && (
                      <span
                        className={classNames(
                          "text-xs shrink-0",
                          themeColors.secondaryTextClass,
                        )}
                      >
                        {dayjs(entry.publishedAt).fromNow()}
                      </span>
                    )}
                  </div>
                  {excerpt && (
                    <p
                      className={classNames(
                        "text-xs truncate mt-0.5",
                        themeColors.secondaryTextClass,
                      )}
                    >
                      {excerpt}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RssPanel;
