import { memo, useState, useMemo, useCallback, useRef } from "react";
import clsx from "clsx";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Eye, FileText } from "lucide-react";
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
    const [previewArticle, setPreviewArticle] = useState<ArticleListItem | null>(null);
    const [onlySelected, setOnlySelected] = useState(false);

    // 转换文章为列表项
    const articleItems = useMemo<ArticleListItem[]>(
      () =>
        articles.map(article => ({
          id: article.id,
          title: article.title || `文章 #${article.id}`,
          description: buildPlainText(article.content).slice(0, 180) || "暂无内容",
          updateTime: article.update_time,
          createTime: article.create_time,
          raw: article,
        })),
      [articles]
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
        items = items.filter(item => isItemSelected("article", item.id));
      }
      return items;
    }, [filteredItems, onlySelected, isItemSelected]);

    // 检查是否全选
    const allSelected = useMemo(() => {
      return (
        displayArticles.length > 0 &&
        displayArticles.every(item => isItemSelected("article", item.id))
      );
    }, [displayArticles, isItemSelected]);

    // 全选/取消全选
    const handleSelectAll = useCallback(() => {
      const ids = displayArticles.map(item => item.id);
      onBatchToggle(ids, !allSelected);
    }, [displayArticles, allSelected, onBatchToggle]);

    // 关闭预览弹窗
    const handleClosePreview = useCallback(() => {
      setPreviewArticle(null);
    }, []);

    return (
      <>
        <div
          className="border-line-1 rounded-tau-md flex flex-col overflow-hidden border"
          style={{ height: 520, maxHeight: 520 }}
        >
          <div className="shrink-0 px-3 py-2">
            <SearchToolbar
              query={query}
              onQueryChange={setQuery}
              placeholder="搜索文章标题…"
              showSelectAll={displayArticles.length > 0}
              allSelected={allSelected}
              onSelectAll={handleSelectAll}
              showOnlySelected
              onlySelected={onlySelected}
              onOnlySelectedChange={setOnlySelected}
              isFiltering={isFiltering}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {displayArticles.length === 0 ? (
              <EmptyPlaceholder
                text={onlySelected ? "暂无已选文章" : query ? "无匹配结果" : "暂无文章"}
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
            icon={<FileText size={16} strokeWidth={1.75} />}
          />
        )}
      </>
    );
  }
);

ArticleSelector.displayName = "ArticleSelector";

// 文章列表组件（使用虚拟滚动）
const ArticleList = memo<{
  articles: ArticleListItem[];
  isItemSelected: (type: PublishContentType, id: number) => boolean;
  onToggleArticle: (articleId: number) => void;
  onPreview: (article: ArticleListItem) => void;
}>(({ articles, isItemSelected, onToggleArticle, onPreview }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: articles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
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
        {virtualizer.getVirtualItems().map(virtualItem => {
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
                className={clsx(
                  "rounded-tau-sm flex min-h-[76px] items-start gap-3 px-4 py-3.5 transition-colors",
                  selected ? "bg-selected" : "hover:bg-hover"
                )}
              >
                <SelectionCheckbox
                  checked={selected}
                  onChange={() => onToggleArticle(article.id)}
                  size="sm"
                />
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onPreview(article)}>
                  <div
                    className={clsx(
                      "truncate text-[13px]",
                      selected ? "text-ink-1 font-medium" : "text-ink-1"
                    )}
                  >
                    {article.title}
                  </div>
                  <div className="text-tau-tiny text-ink-3 mt-1 line-clamp-2">
                    {article.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPreview(article)}
                  className="text-ink-3 hover:bg-hover hover:text-ink-1 shrink-0 rounded-md p-1.5 transition-colors"
                  title="预览"
                >
                  <Eye size={15} strokeWidth={1.75} />
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
