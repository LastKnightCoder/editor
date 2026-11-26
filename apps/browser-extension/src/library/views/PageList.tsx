import { ArrowDownUp, Highlighter, Search } from "lucide-react";
import type { LibrarySort, WebPageSummary } from "@tau/shared/browser-companion";
import { cn, FilterPill, Input, Menu } from "@tau/ui";
import { hostOf, summarize, type LocalNotePage } from "../local";
import { useLibraryPages, type PagesFilter } from "../queries";
import { Badge, ColorBar, EmptyState, LoadMore, SiteMark } from "./parts";
import { formatTime, pageLabel, timeGroup } from "../helpers";
import { useLibraryI18n } from "../i18n";

const SORTS: LibrarySort[] = ["recent", "oldest", "most", "title"];

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
  const context = useLibraryI18n();
  const { t, locale } = context;
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
          {page.count > 0 && (
            <span>
              {t("items", { count: page.count, amount: page.count.toLocaleString(locale) })}
            </span>
          )}
          {notes && notes.draft !== null && <Badge tone="warn">{t("draft")}</Badge>}
          {notes && notes.saved.length > 0 && (
            <Badge tone="ok">
              {t("cards", {
                count: notes.saved.length,
                amount: notes.saved.length.toLocaleString(locale),
              })}
            </Badge>
          )}
          <span className="ml-auto flex-none">{formatTime(page.lastTime, context)}</span>
        </span>
        {page.renamed && <span className="text-tau-tiny text-ink-3">{t("renamed")}</span>}
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
  const { t } = useLibraryI18n();
  const pages = useLibraryPages(filter, online);
  const items = pages.data?.pages.flatMap(page => page.items) ?? [];
  const grouped = filter.sort === "recent" || filter.sort === "oldest";
  const filtering = !!(filter.query || filter.noted || filter.host);
  // 只有本机笔记、没有标注的页面不在 Tau 的列表里：列表加载完后接在末尾
  const listed = new Set(items.map(page => page.url));
  const keyword = filter.query?.toLowerCase();
  const noteOnly =
    pages.isPending || pages.hasNextPage || filter.noted
      ? []
      : [...notes.values()]
          .filter(page => !listed.has(page.url))
          .filter(page => !filter.host || hostOf(page.url) === filter.host)
          .filter(
            page =>
              !keyword ||
              `${page.title}\n${page.url}\n${page.draft ?? ""}`.toLowerCase().includes(keyword)
          )
          .map(page => summarize(page.url, page.title, [], page.updatedAt ?? 0));

  return (
    <div className="border-line-1 flex min-h-0 w-[340px] flex-none flex-col border-r">
      <div className="flex flex-col gap-2 px-3.5 pt-3.5 pb-2">
        <Input
          lead={Search}
          clearable
          size="sm"
          placeholder={t("pages.search")}
          value={query}
          onChange={event => onQuery(event.target.value)}
        />
        <div className="flex items-center gap-1.5">
          <FilterPill
            active={!filter.noted}
            label={t("all")}
            onClick={() => onFilter({ ...filter, noted: undefined })}
          />
          <FilterPill
            active={!!filter.noted}
            label={t("noted")}
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
                {t(`sort.${filter.sort}`)}
              </button>
            }
          >
            <Menu.RadioGroup
              value={filter.sort}
              onValueChange={sort => onFilter({ ...filter, sort: sort as LibrarySort })}
            >
              {SORTS.map(sort => (
                <Menu.RadioItem key={sort} value={sort}>
                  {t(`sort.${sort}`)}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu>
        </div>
        {filter.host && (
          <p className="text-tau-sm text-ink-3">
            {t("pages.host", { host: filter.host })}
            <button
              type="button"
              className="text-accent-text ml-2"
              onClick={() => onFilter({ ...filter, host: undefined })}
            >
              {t("pages.allSites")}
            </button>
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2.5">
        {pages.isPending ? null : items.length === 0 && noteOnly.length === 0 ? (
          <EmptyState icon={<Highlighter size={22} strokeWidth={1.6} />}>
            {filtering ? t("pages.noResults") : online ? t("pages.empty") : t("pages.noCache")}
          </EmptyState>
        ) : (
          items.map((page, index) => {
            const group = grouped ? timeGroup(page.lastTime) : null;
            const showGroup =
              group && (index === 0 || timeGroup(items[index - 1].lastTime) !== group);
            return (
              <div key={page.url}>
                {showGroup && (
                  <p className="text-tau-sm text-ink-3 px-2 pt-2.5 pb-1">{t(`group.${group}`)}</p>
                )}
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
        {noteOnly.length > 0 && (
          <>
            <p className="text-tau-sm text-ink-3 px-2 pt-2.5 pb-1">{t("pages.onlyNotes")}</p>
            {noteOnly.map(page => (
              <PageRow
                key={page.url}
                page={page}
                active={page.url === selected}
                notes={notes.get(page.url)}
                onSelect={() => onSelect(page)}
              />
            ))}
          </>
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
