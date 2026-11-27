import { selectionSearchText, usePublishSelectionI18n } from "../../i18n";
import { memo, useState, useMemo, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Eye, FileText } from "lucide-react";
import { IArticle } from "@/types/article";
import { PublishContentType } from "@/types/publish";
import { buildPlainText, matchesSelectionFilter } from "../../utils";
import { SelectionFilter } from "../../types";
import { SelectionCheckbox } from "../SelectionCheckbox";
import { SearchToolbar } from "../SearchToolbar";
import { FadeScroll } from "@tau/ui";
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
    const { t } = usePublishSelectionI18n();
    const [previewArticle, setPreviewArticle] = useState<ArticleListItem | null>(null);
    const [selectionFilter, setSelectionFilter] = useState<SelectionFilter>("all");

    const articleItems = useMemo<ArticleListItem[]>(
      () =>
        articles.map(article => ({
          id: article.id,
          title: article.title || "",
          description: buildPlainText(article.content).slice(0, 180),
          updateTime: article.update_time,
          createTime: article.create_time,
          raw: article,
        })),
      [articles]
    );

    const searchItems = useMemo(
      () =>
        articleItems.map(article => ({
          ...article,
          searchText: selectionSearchText({
            type: "article",
            id: article.id,
            title: article.title,
            description: article.description,
          }),
        })),
      [articleItems]
    );

    // 搜索过滤
    const { query, setQuery, filteredItems, isFiltering } = useSearch({
      items: searchItems,
      searchFields: ["title", "description", "searchText"],
    });

    // 根据过滤条件显示文章
    const displayArticles = useMemo(() => {
      if (selectionFilter === "all") return filteredItems;
      return filteredItems.filter(item =>
        matchesSelectionFilter(selectionFilter, isItemSelected("article", item.id))
      );
    }, [filteredItems, selectionFilter, isItemSelected]);

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

    const handleClosePreview = useCallback(() => {
      setPreviewArticle(null);
    }, []);

    return (
      <>
        <div className="flex h-full min-h-0 flex-col">
          <SearchToolbar
            query={query}
            onQueryChange={setQuery}
            placeholder={t("search.article")}
            showSelectAll={displayArticles.length > 0}
            allSelected={allSelected}
            onSelectAll={handleSelectAll}
            selectionFilter={selectionFilter}
            onSelectionFilterChange={setSelectionFilter}
            isFiltering={isFiltering}
          />

          <div className="mb-3 min-h-0 flex-1 overflow-hidden">
            {displayArticles.length === 0 ? (
              <EmptyPlaceholder
                text={
                  query
                    ? t("empty.matches")
                    : selectionFilter !== "all"
                      ? t(`empty.article.${selectionFilter}`)
                      : t("empty.article.all")
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

        {previewArticle && (
          <ContentPreviewModal
            open={!!previewArticle}
            title={previewArticle.raw.title || t("article.untitled", { id: previewArticle.id })}
            content={previewArticle.raw.content}
            contentKey={previewArticle.id}
            onClose={handleClosePreview}
            meta={{
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
  const { t } = usePublishSelectionI18n();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: articles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  return (
    <FadeScroll scrollRef={parentRef} className="mb-3 min-h-0 flex-1 px-2.5 pb-1">
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
            >
              <div className="hover:bg-hover flex h-full items-start gap-2.5 rounded-[8px] px-2 py-2 transition-colors">
                <SelectionCheckbox
                  checked={selected}
                  onChange={() => onToggleArticle(article.id)}
                  size="sm"
                />
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onPreview(article)}>
                  <div className="text-ink-1 truncate text-[13px]">
                    {article.raw.title || t("article.untitled", { id: article.id })}
                  </div>
                  <div className="text-tau-tiny text-ink-3 mt-0.5 line-clamp-2">
                    {article.description || t("content.empty")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPreview(article)}
                  className="text-ink-3 hover:bg-press hover:text-ink-1 shrink-0 rounded-[6px] p-1.5 transition-colors"
                  title={t("preview")}
                >
                  <Eye size={15} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </FadeScroll>
  );
});

ArticleList.displayName = "ArticleList";
