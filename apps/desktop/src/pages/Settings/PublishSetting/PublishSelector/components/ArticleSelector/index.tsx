import React, { memo, useState, useMemo, useCallback } from "react";
import classNames from "classnames";
import { useVirtualizer } from "@tanstack/react-virtual";
import useThemeColors from "@/hooks/useThemeColors";
import { IArticle } from "@/types/article";
import { PublishContentType } from "@/types/publish";
import { buildPlainText } from "../../utils";
import { SelectionCheckbox } from "../SelectionCheckbox";
import { SearchToolbar } from "../SearchToolbar";
import { EmptyPlaceholder } from "../EmptyPlaceholder";
import { ContentPreviewModal } from "../ContentPreviewModal";
import { useSearch } from "../../hooks";

interface ArticleListItem {
  id: number;
  title: string;
  description: string;
  updateTime: number;
  createTime?: number;
  raw: IArticle;
}

interface ArticleSelectorProps {
  articles: IArticle[];
  isItemSelected: (type: PublishContentType, id: number) => boolean;
  onToggleArticle: (articleId: number) => void;
  onBatchToggle: (ids: number[], selected: boolean) => void;
}

export const ArticleSelector = memo<ArticleSelectorProps>(
  ({ articles, isItemSelected, onToggleArticle, onBatchToggle }) => {
    const themeColors = useThemeColors();
    const [previewArticle, setPreviewArticle] =
      useState<ArticleListItem | null>(null);
    const [onlySelected, setOnlySelected] = useState(false);

    // 转换文章为列表项
    const articleItems = useMemo<ArticleListItem[]>(
      () =>
        articles.map((article) => ({
          id: article.id,
          title: article.title || `文章 #${article.id}`,
          description:
            buildPlainText(article.content).slice(0, 180) || "暂无内容",
          updateTime: article.update_time,
          createTime: article.create_time,
          raw: article,
        })),
      [articles],
    );

    // 搜索过滤
    const { query, setQuery, filteredItems, isFiltering } = useSearch({
      items: articleItems,
      searchFields: ["title", "description"] as (keyof ArticleListItem)[],
    });

    // 根据过滤条件显示文章
    const displayArticles = useMemo(() => {
      let items = filteredItems;
      if (onlySelected) {
        items = items.filter((item) => isItemSelected("article", item.id));
      }
      return items;
    }, [filteredItems, onlySelected, isItemSelected]);

    // 检查是否全选
    const allSelected = useMemo(() => {
      return (
        displayArticles.length > 0 &&
        displayArticles.every((item) => isItemSelected("article", item.id))
      );
    }, [displayArticles, isItemSelected]);

    // 全选/取消全选
    const handleSelectAll = useCallback(() => {
      const ids = displayArticles.map((item) => item.id);
      onBatchToggle(ids, !allSelected);
    }, [displayArticles, allSelected, onBatchToggle]);

    // 关闭预览弹窗
    const handleClosePreview = useCallback(() => {
      setPreviewArticle(null);
    }, []);

    return (
      <>
        <div
          className={classNames(
            "flex flex-col border rounded-xl overflow-hidden",
            themeColors.cardBorderClass,
          )}
          style={{ height: 520, maxHeight: 520 }}
        >
          <div className="px-3 py-2 flex-shrink-0">
            <SearchToolbar
              query={query}
              onQueryChange={setQuery}
              placeholder="搜索文章标题..."
              showSelectAll={displayArticles.length > 0}
              allSelected={allSelected}
              onSelectAll={handleSelectAll}
              showOnlySelected
              onlySelected={onlySelected}
              onOnlySelectedChange={setOnlySelected}
              isFiltering={isFiltering}
            />
          </div>

          <div className="flex-1 overflow-hidden min-h-0">
            {displayArticles.length === 0 ? (
              <EmptyPlaceholder
                text={
                  onlySelected
                    ? "暂无已选文章"
                    : query
                      ? "无匹配结果"
                      : "暂无文章"
                }
              />
            ) : (
              <ArticleList
                articles={displayArticles}
                isItemSelected={isItemSelected}
                onToggleArticle={onToggleArticle}
                onPreview={setPreviewArticle}
              />
            )}
          </div>
        </div>

        {/* 预览弹窗 */}
        {previewArticle && (
          <ContentPreviewModal
            open={!!previewArticle}
            title={previewArticle.title}
            content={previewArticle.raw.content}
            contentKey={previewArticle.id}
            onClose={handleClosePreview}
            meta={{
              category: "文章",
              updateTime: previewArticle.updateTime,
              createTime: previewArticle.createTime,
            }}
            icon={
              <svg
                className="w-5 h-5 text-blue-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            iconBgColor="bg-blue-50 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30"
          />
        )}
      </>
    );
  },
);

ArticleSelector.displayName = "ArticleSelector";

// 文章列表组件（使用虚拟滚动）
const ArticleList = memo<{
  articles: ArticleListItem[];
  isItemSelected: (type: PublishContentType, id: number) => boolean;
  onToggleArticle: (articleId: number) => void;
  onPreview: (article: ArticleListItem) => void;
}>(({ articles, isItemSelected, onToggleArticle, onPreview }) => {
  const themeColors = useThemeColors();
  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: articles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const article = articles[virtualItem.index];
          const selected = isItemSelected("article", article.id);

          return (
            <div
              key={article.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className="px-3 py-1"
            >
              <div
                className={classNames(
                  "flex items-start gap-3 px-3 py-2 rounded-lg transition-colors h-full",
                  selected
                    ? "bg-blue-50 dark:bg-blue-500/10"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/30",
                )}
              >
                <SelectionCheckbox
                  checked={selected}
                  onChange={() => onToggleArticle(article.id)}
                  size="sm"
                />
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => onPreview(article)}
                >
                  <div
                    className={classNames(
                      "text-sm truncate",
                      selected
                        ? "text-blue-600 dark:text-blue-400 font-medium"
                        : themeColors.textClass,
                    )}
                  >
                    {article.title}
                  </div>
                  <div
                    className={classNames(
                      "text-xs mt-1 line-clamp-2",
                      themeColors.secondaryTextClass,
                    )}
                  >
                    {article.description}
                  </div>
                </div>
                <button
                  onClick={() => onPreview(article)}
                  className={classNames(
                    "flex-shrink-0 p-1.5 rounded-lg transition-colors",
                    "hover:bg-gray-200 dark:hover:bg-gray-700",
                    themeColors.secondaryTextClass,
                  )}
                  title="预览"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

ArticleList.displayName = "ArticleList";
