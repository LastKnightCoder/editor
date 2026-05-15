import useThemeColors from "@/hooks/useThemeColors";
import type { SidebarSelection, UnifiedArticleItem } from "../../types";
import ArticleListHeader from "./ArticleListHeader";
import ArticleListItem from "./ArticleListItem";
import ListSkeleton from "./ListSkeleton";

interface ArticleListProps {
  selection: SidebarSelection;
  articles: UnifiedArticleItem[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onMarkAllRead: () => void;
  onRefresh: () => void;
}

export default function ArticleList({
  selection,
  articles,
  selectedId,
  isLoading,
  onSelect,
  onMarkAllRead,
  onRefresh,
}: ArticleListProps) {
  const themeColors = useThemeColors();

  return (
    <div className="flex h-full flex-col">
      <ArticleListHeader
        selection={selection}
        onMarkAllRead={onMarkAllRead}
        onRefresh={onRefresh}
      />
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {isLoading ? (
          <ListSkeleton />
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-20">
            <span className={`text-xs ${themeColors.secondaryTextClass}`}>
              {selection.kind === "smart" && selection.group === "readlater"
                ? "从浏览器扩展或 RSS 添加稍后读"
                : selection.kind === "smart" && selection.group === "starred"
                  ? "收藏的文章会出现在这里"
                  : "暂无文章"}
            </span>
          </div>
        ) : (
          articles.map((article) => (
            <ArticleListItem
              key={article.id}
              item={article}
              isActive={selectedId === article.id}
              onClick={() => onSelect(article.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
