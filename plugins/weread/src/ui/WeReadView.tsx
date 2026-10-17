/**
 * 微信读书书架：工具栏（标题 · 统计与同步状态 · 搜索 · 同步）→ 分类 pills + 状态 / 排序 / 排布
 * →「在读」续读行 → 全部书籍（封面墙或行式列表）。点书进入单书笔记页。
 * 未连接时照常展示本地缓存；首次使用在纸内引导填 API Key。
 */

import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  BookOpen,
  ChevronDown,
  KeyRound,
  LayoutGrid,
  List,
  ListFilter,
  RefreshCw,
  Search,
  SearchX,
} from "lucide-react";
import { Button, FadeScroll, FilterPill, Input, Loading, Menu, cn, toast } from "@tau/ui";
import {
  SHELF_SORTS,
  STATUS_FILTERS,
  formatMinutes,
  formatSyncedAt,
  matchQuery,
  matchStatus,
  rankArchives,
  readingNow,
  sortBooks,
  toBook,
  type ShelfLayout,
  type ShelfSort,
  type ShelfStatusFilter,
  type WeReadBook,
} from "../model";
import { useWeRead, useWeReadState } from "../hooks";
import type { Connection } from "../runtime";
import { ConnectPanel } from "./ConnectPanel";
import { CoverTile, ReadingCard, ShelfList } from "./ShelfItems";

const LAYOUTS: { value: ShelfLayout; label: string; icon: typeof LayoutGrid }[] = [
  { value: "cover", label: "封面", icon: LayoutGrid },
  { value: "list", label: "列表", icon: List },
];

export function WeReadView({ onSettings }: { onSettings(): void }) {
  const { runtime, pages } = useWeRead();
  const connection = useWeReadState(state => state.connection);
  const metas = useWeReadState(state => state.books);
  const lastSyncedAt = useWeReadState(state => state.lastSyncedAt);
  const loading = useWeReadState(state => !state.loaded);
  const syncing = useWeReadState(state => state.syncing);
  const progress = useWeReadState(state => state.progress);
  const { layout, sort } = useWeReadState(state => state.prefs);
  const books = useMemo(
    () =>
      metas.map(metaData =>
        toBook({
          metaData,
          chapterHighlights: [],
          bookReview: { chapterReviews: [], bookReviews: [] },
        })
      ),
    [metas]
  );

  const [archive, setArchive] = useState("");
  const [status, setStatus] = useState<ShelfStatusFilter>("all");
  const [query, setQuery] = useState("");

  const archives = useMemo(() => rankArchives(books), [books]);
  // 分类被同步掉后回到全部
  const activeArchive = archives.some(a => a.name === archive) ? archive : "";
  const inArchive = useMemo(
    () => (activeArchive ? books.filter(b => b.archive === activeArchive) : books),
    [books, activeArchive]
  );
  const visible = useMemo(
    () =>
      sortBooks(
        inArchive.filter(b => matchStatus(b, status) && matchQuery(b, query)),
        sort
      ),
    [inArchive, status, query, sort]
  );
  const reading = useMemo(() => readingNow(inArchive), [inArchive]);
  const totalMinutes = useMemo(() => books.reduce((sum, b) => sum + b.minutes, 0), [books]);

  const open = (book: WeReadBook) => void pages.book.open({ bookId: book.id });
  const setSort = (value: ShelfSort) => runtime.setPrefs({ sort: value });
  const sync = (full = false) =>
    void runtime.sync({ full }).then(
      outcome => {
        if (!outcome) return;
        toast.success(
          `同步完成，共 ${outcome.total} 本书，更新 ${outcome.updated} 本` +
            (outcome.failed ? `，${outcome.failed} 本下次重试` : "")
        );
      },
      error => toast.error(error instanceof Error ? error.message : "同步失败，请稍后再试")
    );
  const toSettings = onSettings;

  if (loading) return <Loading />;

  const filtering = status !== "all" || query.trim().length > 0;
  const statusLabel = STATUS_FILTERS.find(f => f.value === status)?.label ?? "";
  const sortLabel = SHELF_SORTS.find(s => s.value === sort)?.label ?? "";

  const syncButton =
    connection === "none" || connection === "invalid" ? (
      <Button
        variant="secondary"
        size="sm"
        icon={KeyRound}
        className="shrink-0"
        onClick={toSettings}
      >
        连接微信读书
      </Button>
    ) : (
      <span className="flex shrink-0 items-center">
        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          className="rounded-r-none tabular-nums"
          loading={syncing}
          loadingText={
            progress?.total ? `同步中 ${progress.completed}/${progress.total}` : "同步中…"
          }
          disabled={connection !== "valid"}
          title="只更新新书和最近读过、记过笔记的书"
          onClick={() => sync()}
        >
          同步
        </Button>
        <Menu
          align="end"
          trigger={
            <Button
              variant="secondary"
              size="sm"
              aria-label="更多同步选项"
              disabled={connection !== "valid" || syncing}
              className="-ml-px rounded-l-none px-1.5"
            >
              <ChevronDown className="size-3.5" strokeWidth={1.75} />
            </Button>
          }
        >
          <Menu.Item
            icon={<RefreshCw className="size-[15px]" strokeWidth={1.75} />}
            onSelect={() => sync(true)}
          >
            全量重新同步
            <span className="text-ink-3 ml-1.5 tabular-nums">约 {books.length * 2} 个请求</span>
          </Menu.Item>
        </Menu>
      </span>
    );

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸：页头与筛选行固定在纸顶，书目在纸内滚动 */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none flex-col px-8 pt-5">
          <div className="flex h-10 flex-none items-center gap-3">
            <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em]">
              微信读书
            </h1>
            <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
              {books.length > 0 && (
                <>
                  <b className="text-ink-1 font-semibold">{books.length}</b> 本书
                  {totalMinutes > 0 && (
                    <>
                      <span className="text-ink-3 mx-1.5">·</span>累计阅读{" "}
                      <b className="text-ink-1 font-semibold">{formatMinutes(totalMinutes)}</b>
                    </>
                  )}
                  <span className="text-ink-3 mx-1.5">·</span>
                  <span className="text-ink-3">{formatSyncedAt(lastSyncedAt)}</span>
                </>
              )}
            </span>
            {books.length > 0 && (
              <Input
                size="sm"
                lead={Search}
                clearable
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Escape" && query) {
                    e.stopPropagation();
                    setQuery("");
                  }
                }}
                placeholder="搜索书名或作者"
                className="w-0"
                wrapperClassName="w-auto max-w-[240px] flex-[0_1_240px]"
              />
            )}
            {(books.length > 0 || connection !== "none") && syncButton}
          </div>

          {books.length > 0 && (connection === "invalid" || connection === "none") && (
            <div className="bg-warn-soft text-tau-meta mt-2 flex flex-none items-center gap-2.5 rounded-[12px] px-3 py-2">
              <KeyRound className="text-warn size-4 shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                {connection === "invalid"
                  ? "API Key 已失效，当前显示的是上次同步的本地缓存，不能拉取新笔记。"
                  : "尚未连接微信读书，当前显示的是本地缓存。"}
              </span>
              <button
                type="button"
                onClick={toSettings}
                className="text-accent-text shrink-0 font-medium hover:underline"
              >
                {connection === "invalid" ? "重新填写" : "去连接"}
              </button>
            </div>
          )}

          {books.length > 0 && (
            <div className="mt-2 flex h-10 flex-none items-center gap-1.5">
              {/* w-0 + flex-1：分类再多也只在自身范围内横向滚动，不撑宽页面 */}
              <div className="flex w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 pr-6 [mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)]">
                <FilterPill
                  active={!activeArchive}
                  onClick={() => setArchive("")}
                  label="全部"
                  count={books.length}
                />
                {archives.map(a => (
                  <FilterPill
                    key={a.name}
                    active={activeArchive === a.name}
                    onClick={() => setArchive(a.name)}
                    label={a.name}
                    count={a.count}
                  />
                ))}
              </div>
              <Menu
                align="end"
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ListFilter}
                    className={cn("shrink-0", status !== "all" && "text-accent-text")}
                  >
                    {statusLabel}
                    <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
                  </Button>
                }
              >
                <Menu.RadioGroup
                  value={status}
                  onValueChange={v => setStatus(v as ShelfStatusFilter)}
                >
                  {STATUS_FILTERS.map(f => (
                    <Menu.RadioItem key={f.value} value={f.value}>
                      {f.label}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu>
              <Menu
                align="end"
                trigger={
                  <Button variant="ghost" size="sm" icon={ArrowDownUp} className="shrink-0">
                    {sortLabel}
                    <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
                  </Button>
                }
              >
                <Menu.RadioGroup value={sort} onValueChange={v => setSort(v as ShelfSort)}>
                  {SHELF_SORTS.map(s => (
                    <Menu.RadioItem key={s.value} value={s.value}>
                      {s.label}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu>
              <Menu
                align="end"
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={layout === "list" ? List : LayoutGrid}
                    className="shrink-0"
                  >
                    {LAYOUTS.find(l => l.value === layout)?.label}
                    <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
                  </Button>
                }
              >
                <Menu.RadioGroup
                  value={layout}
                  onValueChange={v => runtime.setPrefs({ layout: v as ShelfLayout })}
                >
                  {LAYOUTS.map(l => (
                    <Menu.RadioItem key={l.value} value={l.value}>
                      {l.label}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu>
            </div>
          )}
        </div>

        <FadeScroll className="mb-4 min-h-0 flex-1 pb-4 pl-8 pr-[26px] pt-3">
          {books.length === 0 ? (
            <EmptyShelf
              connection={connection}
              syncing={syncing}
              progress={progress}
              onConnected={() => sync()}
              onSync={() => sync()}
              onSettings={toSettings}
            />
          ) : (
            <>
              {!filtering && reading.length > 0 && (
                <section className="mb-6">
                  <SectionTitle title="在读" hint="最近读过的书" />
                  <div className="-mx-3.5 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-1">
                    {reading.map(book => (
                      <ReadingCard key={book.id} book={book} onOpen={() => open(book)} />
                    ))}
                  </div>
                </section>
              )}
              <section>
                <SectionTitle
                  title={status === "all" ? "全部" : statusLabel}
                  hint={`${visible.length} 本 · 按${sortLabel}`}
                />
                {visible.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <SearchX className="text-ink-3 size-6" strokeWidth={1.5} />
                    <p className="text-tau-meta text-ink-2">没有符合条件的书</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-1"
                      onClick={() => {
                        setQuery("");
                        setStatus("all");
                      }}
                    >
                      清除筛选
                    </Button>
                  </div>
                ) : layout === "list" ? (
                  <ShelfList books={visible} sort={sort} onSort={setSort} onOpen={open} />
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-x-[22px] gap-y-6">
                    {visible.map(book => (
                      <CoverTile key={book.id} book={book} onOpen={() => open(book)} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </FadeScroll>
      </div>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <h2 className="mb-3 flex items-baseline gap-2 px-0.5 text-[13.5px] font-semibold">
      {title}
      {hint && <small className="text-tau-sm text-ink-3 font-normal tabular-nums">{hint}</small>}
    </h2>
  );
}

function EmptyShelf({
  connection,
  syncing,
  progress,
  onConnected,
  onSync,
  onSettings,
}: {
  connection: Connection;
  syncing: boolean;
  progress: { completed: number; total: number } | null;
  onConnected(): void;
  onSync(): void;
  onSettings(): void;
}) {
  if (connection === "none") return <ConnectPanel onConnected={onConnected} />;
  if (syncing)
    return (
      <Loading
        label={
          progress?.total
            ? `正在同步书架 ${progress.completed} / ${progress.total}`
            : "正在同步书架…"
        }
      />
    );
  if (connection === "checking") return <Loading label="正在校验 API Key…" />;
  const invalid = connection === "invalid";
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-20 text-center">
      <span className="bg-accent-soft text-accent-text mb-1.5 grid size-[52px] place-items-center rounded-[16px]">
        <BookOpen className="size-6" strokeWidth={1.5} />
      </span>
      <p className="text-ink-1 text-[15px] font-semibold">
        {invalid ? "API Key 已失效" : "书架还是空的"}
      </p>
      <p className="text-tau-meta text-ink-2 max-w-[36ch]">
        {invalid ? "重新填写 API Key 后即可同步书架。" : "同步一次，把微信读书书架上的书带进来。"}
      </p>
      <div className="mt-2.5">
        {invalid ? (
          <Button variant="soft" size="sm" icon={KeyRound} onClick={onSettings}>
            重新填写
          </Button>
        ) : (
          <Button variant="soft" size="sm" icon={RefreshCw} onClick={onSync}>
            同步书架
          </Button>
        )}
      </div>
    </div>
  );
}
