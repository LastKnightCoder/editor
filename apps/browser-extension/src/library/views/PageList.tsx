import { ArrowDownUp, Highlighter, Search } from "lucide-react";
import type { LibrarySort, WebPageSummary } from "@tau/shared/browser-companion";
import { cn, FilterPill, Input, Menu } from "@tau/ui";
import type { LocalNotePage } from "../local";
import { useLibraryPages, type PagesFilter } from "../queries";
import { Badge, ColorBar, EmptyState, LoadMore, SiteMark } from "./parts";
import { formatTime, pageLabel, timeGroup } from "../helpers";

const SORT_LABEL: Record<LibrarySort, string> = {
  recent: "最近标注",
  oldest: "最早标注",
  most: "标注最多",
  title: "按名称",
};

function PageRow({
  page,
  active,
  notes,
  onSelect,
}: {
  page: WebPageSummary;
  active: boolean;
  notes: LocalNotePage | undefined;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active}
      onClick={onSelect}
      className={cn(
        "rounded-tau-sm flex w-full gap-2.5 px-2 py-2.5 text-left",
        active ? "bg-surface shadow-card" : "hover:bg-hover"
      )}
    >
      <SiteMark host={page.host} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="text-tau-body text-ink-1 line-clamp-2 font-semibold">
          {pageLabel(page)}
        </span>
        <span className="text-tau-sm text-ink-3 mt-1 flex items-center gap-2">
          {page.count > 0 && <ColorBar colors={page.colors} count={page.count} />}
          <span>{page.count} 条</span>
          {notes?.draft && <Badge tone="warn">草稿</Badge>}
          {notes && notes.saved.length > 0 && <Badge tone="ok">{notes.saved.length} 张卡片</Badge>}
          <span className="ml-auto flex-none">{formatTime(page.lastTime)}</span>
        </span>
        {page.renamed && <span className="text-tau-tiny text-ink-3">已重命名</span>}
      </span>
    </button>
  );
}

export function PageList({
  filter,
  query,
  online,
  selected,
  notes,
  onQuery,
  onFilter,
  onSelect,
}: {
  /** 关键词由调用方防抖后放进 filter.query，这里是输入框的即时文字 */
  filter: PagesFilter;
  query: string;
  online: boolean;
  selected: string | null;
  notes: Map<string, LocalNotePage>;
  onQuery: (query: string) => void;
  onFilter: (filter: PagesFilter) => void;
  onSelect: (page: WebPageSummary) => void;
}) {
  const pages = useLibraryPages(filter, online);
  const items = pages.data?.pages.flatMap(page => page.items) ?? [];
  const grouped = filter.sort === "recent" || filter.sort === "oldest";
  const filtering = !!(filter.query || filter.noted || filter.host);

  return (
    <div className="border-line-1 flex min-h-0 w-[340px] flex-none flex-col border-r">
      <div className="flex flex-col gap-2 px-3.5 pt-3.5 pb-2">
        <Input
          lead={Search}
          clearable
          size="sm"
          placeholder="搜页面名、网址、原文、批注…"
          value={query}
          onChange={event => onQuery(event.target.value)}
        />
        <div className="flex items-center gap-1.5">
          <FilterPill
            active={!filter.noted}
            label="全部"
            onClick={() => onFilter({ ...filter, noted: undefined })}
          />
          <FilterPill
            active={!!filter.noted}
            label="有批注"
            onClick={() => onFilter({ ...filter, noted: true })}
          />
          <span className="flex-1" />
          <Menu
            align="end"
            trigger={
              <button
                type="button"
                className="text-tau-sm text-ink-2 hover:bg-hover rounded-tau-sm inline-flex h-6 items-center gap-1 px-2"
              >
                <ArrowDownUp size={13} strokeWidth={1.8} />
                {SORT_LABEL[filter.sort]}
              </button>
            }
          >
            <Menu.RadioGroup
              value={filter.sort}
              onValueChange={sort => onFilter({ ...filter, sort: sort as LibrarySort })}
            >
              {(Object.keys(SORT_LABEL) as LibrarySort[]).map(sort => (
                <Menu.RadioItem key={sort} value={sort}>
                  {SORT_LABEL[sort]}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu>
        </div>
        {filter.host && (
          <p className="text-tau-sm text-ink-3">
            只看 {filter.host}
            <button
              type="button"
              className="text-accent-text ml-2"
              onClick={() => onFilter({ ...filter, host: undefined })}
            >
              看全部站点
            </button>
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2.5">
        {pages.isPending ? null : items.length === 0 ? (
          <EmptyState icon={<Highlighter size={22} strokeWidth={1.6} />}>
            {filtering
              ? "没有符合条件的页面"
              : online
                ? "还没有标注过的网页：在网页上选中文字即可高亮或批注"
                : "本机还没有缓存的标注，连上 Tau 后可看到全部页面"}
          </EmptyState>
        ) : (
          items.map((page, index) => {
            const group = grouped ? timeGroup(page.lastTime) : null;
            const showGroup =
              group && (index === 0 || timeGroup(items[index - 1].lastTime) !== group);
            return (
              <div key={page.url}>
                {showGroup && <p className="text-tau-sm text-ink-3 px-2 pt-2.5 pb-1">{group}</p>}
                <PageRow
                  page={page}
                  active={page.url === selected}
                  notes={notes.get(page.url)}
                  onSelect={() => onSelect(page)}
                />
              </div>
            );
          })
        )}
        <LoadMore
          hasMore={!!pages.hasNextPage}
          loading={pages.isFetchingNextPage}
          onClick={() => void pages.fetchNextPage()}
        />
      </div>
    </div>
  );
}
