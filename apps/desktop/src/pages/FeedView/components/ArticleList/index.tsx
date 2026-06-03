import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { InboxOutlined } from "@ant-design/icons";
import { App } from "antd";
import useThemeColors from "@/hooks/useThemeColors";
import type { SidebarSelection, UnifiedArticleItem } from "../../types";
import type { ArticleProjectTarget } from "../../utils/articleProjectTargets";
import ArticleListHeader from "./ArticleListHeader";
import ArticleListItem from "./ArticleListItem";
import ListSkeleton from "./ListSkeleton";

interface ArticleListProps {
  selection: SidebarSelection;
  articles: UnifiedArticleItem[];
  selectedId: string | null;
  isLoading: boolean;
  articleProjectTargets?: Record<string, ArticleProjectTarget>;
  onSelect: (id: string) => void;
  onMarkAllRead: () => void;
  onRefresh: () => void;
  onToggleStar: (article: UnifiedArticleItem) => void;
  onMarkRead: (article: UnifiedArticleItem) => void;
  onToggleReadLater: (article: UnifiedArticleItem) => void;
  onArchive: (article: UnifiedArticleItem) => void;
  onUnarchive: (article: UnifiedArticleItem) => void;
  onDelete: (article: UnifiedArticleItem) => void;
  onAddToProject?: (article: UnifiedArticleItem) => void;
  onOpenProject?: (target: ArticleProjectTarget) => void;
  showBilibiliFollowingsSubscribe?: boolean;
  onSubscribeBilibiliFollowings?: () => Promise<void>;
}

export default function ArticleList({
  selection,
  articles,
  selectedId,
  isLoading,
  articleProjectTargets = {},
  onSelect,
  onMarkAllRead,
  onRefresh,
  onToggleStar,
  onMarkRead,
  onToggleReadLater,
  onArchive,
  onUnarchive,
  onDelete,
  onAddToProject,
  onOpenProject,
  showBilibiliFollowingsSubscribe = false,
  onSubscribeBilibiliFollowings,
}: ArticleListProps) {
  const themeColors = useThemeColors();
  const { message } = App.useApp();
  const [isSubscribingBilibili, setIsSubscribingBilibili] = useState(false);

  const selectionKey = useMemo(() => {
    if (selection.kind === "smart") return `smart-${selection.group}`;
    if (selection.kind === "subscription")
      return `sub-${selection.subscriptionId}`;
    if (selection.kind === "category") return `cat-${selection.category}`;
    if (selection.kind === "bilibili-followings") return "bilibili-followings";
    return "unknown";
  }, [selection]);

  const emptyMessage = useMemo(() => {
    if (showBilibiliFollowingsSubscribe)
      return "订阅后会自动同步关注 UP 主动态";
    if (selection.kind === "smart" && selection.group === "readlater")
      return "从浏览器扩展或 RSS 添加稍后读";
    if (selection.kind === "smart" && selection.group === "starred")
      return "收藏的文章会出现在这里";
    return "暂无文章";
  }, [selection]);

  return (
    <div className="flex h-full flex-col">
      <ArticleListHeader
        selection={selection}
        articleCount={articles.length}
        onMarkAllRead={onMarkAllRead}
        onRefresh={onRefresh}
      />
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <ListSkeleton />
            </motion.div>
          ) : articles.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center pt-20 gap-3"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${themeColors.tagBgClass}`}
              >
                <InboxOutlined
                  className={`text-xl ${themeColors.secondaryTextClass}`}
                />
              </div>
              <span className={`text-xs ${themeColors.secondaryTextClass}`}>
                {emptyMessage}
              </span>
              {showBilibiliFollowingsSubscribe && (
                <button
                  type="button"
                  className="mt-1 px-5 py-2.5 rounded-xl border-none text-sm font-semibold cursor-pointer transition-all bg-orange-500 text-white shadow-[0_4px_14px_rgba(249,115,22,0.28)] hover:bg-orange-600 hover:-translate-y-px active:translate-y-0"
                  disabled={isSubscribingBilibili}
                  onClick={() => {
                    if (!onSubscribeBilibiliFollowings) return;
                    setIsSubscribingBilibili(true);
                    onSubscribeBilibiliFollowings()
                      .catch((error) => {
                        message.error(
                          error instanceof Error ? error.message : "订阅失败",
                        );
                      })
                      .finally(() => {
                        setIsSubscribingBilibili(false);
                      });
                  }}
                >
                  {isSubscribingBilibili ? "订阅中..." : "订阅"}
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={selectionKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {articles.map((article, index) => (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: Math.min(index, 15) * 0.03,
                    duration: 0.25,
                    ease: "easeOut",
                  }}
                >
                  <ArticleListItem
                    item={article}
                    isActive={selectedId === article.id}
                    projectTarget={articleProjectTargets[article.id] || null}
                    onClick={() => onSelect(article.id)}
                    onToggleStar={onToggleStar}
                    onMarkRead={onMarkRead}
                    onToggleReadLater={onToggleReadLater}
                    onArchive={onArchive}
                    onUnarchive={onUnarchive}
                    onDelete={onDelete}
                    onAddToProject={onAddToProject}
                    onOpenProject={onOpenProject}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
