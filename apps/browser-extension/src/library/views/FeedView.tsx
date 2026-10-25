import { Highlighter, Search } from "lucide-react";
import { HIGHLIGHT_COLORS, type HighlightColor } from "@tau/shared/browser-companion";
import { FilterPill, Input } from "@tau/ui";
import { useLibraryFeed, type FeedFilter } from "../queries";
import { AnnotationItem, Dot, EmptyState, LoadMore } from "./parts";
import { formatTime } from "../helpers";

const COLOR_LABEL: Record<HighlightColor, string> = {
  yellow: "黄",
  green: "绿",
  blue: "蓝",
  purple: "紫",
  red: "红",
};

/** 全部标注：跨页面按时间倒序平铺，连续同页的归在一个页面标题下 */
export function FeedView({
  filter,
  query,
  online,
  onQuery,
  onFilter,
  onOpenPage,
}: {
  filter: FeedFilter;
  query: string;
  online: boolean;
  onQuery: (query: string) => void;
  onFilter: (filter: FeedFilter) => void;
  onOpenPage: (url: string) => void;
}) {
  const feed = useLibraryFeed(filter, online);
  const items = feed.data?.pages.flatMap(page => page.items) ?? [];
  const total = feed.data?.pages[0]?.total ?? 0;

  return (
    <main className="bg-surface min-h-0 flex-1 overflow-y-auto">
      <header className="border-line-2 bg-surface sticky top-0 z-[1] border-b px-9 pt-6 pb-4">
        <h1 className="text-tau-title-lg text-ink-1 font-serif font-bold">全部标注</h1>
        <p className="text-tau-sm text-ink-3 mt-1">
          {online ? `${total} 条 · 按时间倒序，跨页面平铺` : "连上 Tau 后可用"}
        </p>
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <Input
            lead={Search}
            clearable
            size="sm"
            wrapperClassName="w-[240px]"
            placeholder="搜原文、批注、页面名…"
            value={query}
            onChange={event => onQuery(event.target.value)}
          />
          <FilterPill
            active={!filter.color}
            label="全部颜色"
            onClick={() => onFilter({ ...filter, color: undefined })}
          />
          {HIGHLIGHT_COLORS.map(color => (
            <FilterPill
              key={color}
              active={filter.color === color}
              label={COLOR_LABEL[color]}
              icon={<Dot color={color} />}
              onClick={() =>
                onFilter({
                  ...filter,
                  color: filter.color === color ? undefined : color,
                })
              }
            />
          ))}
          <FilterPill
            active={!!filter.noted}
            label="只看有批注"
            onClick={() => onFilter({ ...filter, noted: filter.noted ? undefined : true })}
          />
        </div>
      </header>
      <div className="px-9 pt-2 pb-10">
        {!online ? (
          <EmptyState icon={<Highlighter size={22} strokeWidth={1.6} />}>
            全部标注由 Tau 汇总，连上 Tau 后可用
          </EmptyState>
        ) : feed.isPending ? null : items.length === 0 ? (
          <EmptyState icon={<Highlighter size={22} strokeWidth={1.6} />}>
            没有符合条件的标注
          </EmptyState>
        ) : (
          items.map((item, index) => (
            <div key={`${item.url}\n${item.id}`}>
              {(index === 0 || items[index - 1].url !== item.url) && (
                <button
                  type="button"
                  onClick={() => onOpenPage(item.url)}
                  className="text-tau-sm text-ink-2 hover:text-accent-text mt-4 flex max-w-full items-center gap-1.5 font-semibold"
                >
                  <span className="truncate">{item.title || item.url}</span>
                </button>
              )}
              <AnnotationItem
                url={item.url}
                item={item}
                footer={<span>{formatTime(item.createdAt)}</span>}
              />
            </div>
          ))
        )}
        <LoadMore
          hasMore={!!feed.hasNextPage}
          loading={feed.isFetchingNextPage}
          onClick={() => void feed.fetchNextPage()}
        />
      </div>
    </main>
  );
}
