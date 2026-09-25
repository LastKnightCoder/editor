/**
 * 日记页 · 方案 D「一整张纸」（mockups/diary/plan-d-sheet.html 定稿，D-044）：
 * 工具栏（标题 / 频道 + 摘要 + 那年今日 · 按日期 · 搜索）→ 一整张 surface 纸：
 * 按天倒序的 Feed（A 的排版）+ 右缘月份刻度 + 纸底停靠输入条（C 的输入）+ 那年今日抽屉。
 *
 * 页面参数：id = 标签频道（侧栏子项，`tag:<名>` / `untagged`，空 = 全部）；
 * date = 外部定位到某天（搜索面板 / 首页等入口），定位后清掉筛选并闪一下那天的条目。
 * 删除不二次确认：立即消失 + Toast 撤销，5 秒后才落库；离开页面立即落库（D-040 同口径）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2, PenLine, Search, SearchX, X } from "lucide-react";
import { Button, IconButton, Loading, Tag, cn, toast, useEdgeFade } from "@tau/ui";
import { usePage, usePageParams } from "@/page/PageProvider";
import {
  buildContent,
  dayKey,
  dayStats,
  filterMoments,
  groupByDay,
  monthsOf,
  onThisDay,
  parseScope,
  presetRanges,
  rankTags,
  scopeId,
  shortDate,
  streak,
  tagCounts,
  type DiaryMoment,
  type DiaryScope,
} from "../model";
import { useDiaryMutations, useDiarySearch, useDiarySnapshot, useNow } from "../queries";
import { CalendarPopover } from "../components/CalendarPopover";
import { Composer, type ComposerHandle } from "../components/Composer";
import { DaySection } from "../components/DaySection";
import { MonthRail } from "../components/MonthRail";
import { OnThisDayDrawer, OnThisDayTease } from "../components/OnThisDay";
import { ClearTagDialog } from "../components/TagPicker";

const UNDO_MS = 5000;
/** 渐进挂载：每批条目数（只读编辑器实例有成本，不整表挂载） */
const BATCH = 60;
const OTD_DISMISS_KEY = "diary:otd-dismissed";

export function DiaryView() {
  const { navigator } = usePage();
  const params = usePageParams<{ id?: string; date?: string; moment?: string }>();
  const scope = parseScope(params.id);
  const { snapshot, loading } = useDiarySnapshot();
  const mutations = useDiaryMutations();
  const now = useNow();
  const today = dayKey(now);

  const [range, setRange] = useState<[string, string] | null>(null);
  const [query, setQuery] = useState("");
  const { hits, searching } = useDiarySearch(query);
  const [limit, setLimit] = useState(BATCH);
  const [freshIds, setFreshIds] = useState<ReadonlySet<number>>(() => new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [otdDismissed, setOtdDismissed] = useState(
    () => localStorage.getItem(OTD_DISMISS_KEY) === today
  );
  const [clearing, setClearing] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);

  const composerRef = useRef<ComposerHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);
  /** 渲染后要滚到的日 / 月（跳转目标可能尚未挂载，先放大 limit 再滚） */
  const pendingScroll = useRef<string | null>(null);
  // 跳转目标月：跳转引起的滚动不改高亮（目标靠近底部时顶不到视口顶，按顶部推算会错成上一个月），
  // 用户自己动（滚轮 / 按下 / 按键）才解除
  const pinnedMonth = useRef<string | null>(null);

  const setScope = useCallback(
    (next: DiaryScope) => navigator.push("diary", { id: scopeId(next) }),
    [navigator]
  );

  /* ---------- 删除暂存（撤销窗口） ---------- */
  const [pendingDelete, setPendingDelete] = useState<ReadonlySet<number>>(() => new Set());
  const deleteTimers = useRef(new Map<number, number>());
  const commitDelete = useRef((id: number) => {
    window.clearTimeout(deleteTimers.current.get(id));
    deleteTimers.current.delete(id);
    mutations
      .remove(id)
      .catch(() => toast.error("删除失败"))
      .finally(() =>
        setPendingDelete(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        })
      );
  });
  useEffect(() => {
    const timers = deleteTimers.current;
    const commit = commitDelete.current;
    return () => {
      for (const id of [...timers.keys()]) commit(id);
    };
  }, []);
  const scheduleDelete = useCallback((moment: DiaryMoment) => {
    setPendingDelete(prev => new Set(prev).add(moment.id));
    deleteTimers.current.set(
      moment.id,
      window.setTimeout(() => commitDelete.current(moment.id), UNDO_MS)
    );
    toast.info("已删除 1 条碎碎念", {
      duration: UNDO_MS,
      action: {
        label: "撤销",
        onClick: () => {
          window.clearTimeout(deleteTimers.current.get(moment.id));
          deleteTimers.current.delete(moment.id);
          setPendingDelete(prev => {
            const next = new Set(prev);
            next.delete(moment.id);
            return next;
          });
        },
      },
    });
  }, []);

  /* ---------- 派生 ---------- */
  const live = useMemo(
    () => (snapshot?.moments ?? []).filter(m => !pendingDelete.has(m.id)),
    [snapshot, pendingDelete]
  );
  const counts = useMemo(() => tagCounts(live), [live]);
  const tags = useMemo(() => rankTags(snapshot?.tags ?? [], counts), [snapshot, counts]);
  const stats = useMemo(() => dayStats(live), [live]);
  const echoes = useMemo(() => onThisDay(live, today), [live, today]);
  const filtered = useMemo(
    () => filterMoments(live, { scope, range, hits, query }),
    // scope 由 params.id 派生，按 id 比较
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, params.id, range, hits, query]
  );
  const groups = useMemo(() => groupByDay(filtered.slice(0, limit)), [filtered, limit]);
  const months = useMemo(() => monthsOf(groupByDay(filtered)), [filtered]);
  const filtering = scope.kind !== "all" || range != null || query.trim() !== "";

  // 换筛选回到第一批、回顶
  useEffect(() => {
    setLimit(BATCH);
    pinnedMonth.current = null;
    scrollEl?.scrollTo({ top: 0 });
  }, [params.id, range, hits, scrollEl]);

  /* ---------- 外部定位到某天（带 moment 时精确到那一条） ---------- */
  useEffect(() => {
    if (!params.date || !snapshot) return;
    setRange(null);
    setQuery("");
    const day = params.date;
    const exact = params.moment ? live.findIndex(m => String(m.id) === params.moment) : -1;
    const idx = exact >= 0 ? exact : live.findIndex(m => m.day <= day);
    if (idx >= 0) pinnedMonth.current = live[idx].day.slice(0, 7);
    if (exact >= 0) {
      setLimit(l => Math.max(l, idx + BATCH));
      pendingScroll.current = `moment:${params.moment}`;
      setFreshIds(new Set([live[idx].id]));
    } else if (idx >= 0) {
      setLimit(l => Math.max(l, idx + BATCH));
      pendingScroll.current = `day:${live[idx].day}`;
      setFreshIds(new Set(live.filter(m => m.day === live[idx].day).map(m => m.id)));
    }
    navigator.push("diary", { id: params.id ?? "" });
    // 只响应 date 参数本身
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.date, snapshot != null]);

  // 待滚动目标在渲染后执行
  const stopSettling = useRef<(() => void) | null>(null);
  useEffect(() => {
    const target = pendingScroll.current;
    if (!target || !scrollEl) return;
    const [kind, value] = target.split(":");
    const el = scrollEl.querySelector<HTMLElement>(
      kind === "moment"
        ? `[data-moment="${value}"]`
        : kind === "day"
          ? `[data-day="${value}"]`
          : `[data-day^="${value}"]`
    );
    if (!el) return;
    pendingScroll.current = null;
    // 单条落在视口中部（天的粘性头不会挡住它）；整天 / 整月对齐顶部
    stopSettling.current?.();
    stopSettling.current = scrollSettled(scrollEl, el, kind === "moment" ? "center" : "top");
  });
  useEffect(() => () => stopSettling.current?.(), []);

  /* ---------- 渐进挂载：触底前 800px 加下一批 ---------- */
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !scrollEl) return;
    const io = new IntersectionObserver(
      entries => entries[0].isIntersecting && setLimit(l => l + BATCH),
      { root: scrollEl, rootMargin: "0px 0px 800px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrollEl, groups.length]);

  /* ---------- 月份刻度：跟随滚动 ---------- */
  useEffect(() => {
    if (!scrollEl) return;
    let frame = 0;
    const sync = () => {
      frame = 0;
      if (pinnedMonth.current) return setCurrentMonth(pinnedMonth.current);
      const sections = scrollEl.querySelectorAll<HTMLElement>("[data-day]");
      const atBottom =
        scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 2 &&
        scrollEl.scrollTop > 0;
      let cur: string | null = null;
      if (atBottom) cur = sections[sections.length - 1]?.dataset.day?.slice(0, 7) ?? null;
      else {
        const top = scrollEl.scrollTop + 40;
        for (const sec of sections) {
          if (sec.offsetTop > top) break;
          cur = sec.dataset.day?.slice(0, 7) ?? cur;
        }
      }
      setCurrentMonth(cur ?? months[0] ?? null);
    };
    const onScroll = () => (frame ||= requestAnimationFrame(sync));
    const unpin = () => {
      if (!pinnedMonth.current) return;
      pinnedMonth.current = null;
      onScroll();
    };
    sync();
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    scrollEl.addEventListener("wheel", unpin, { passive: true });
    scrollEl.addEventListener("pointerdown", unpin);
    scrollEl.addEventListener("keydown", unpin);
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      scrollEl.removeEventListener("wheel", unpin);
      scrollEl.removeEventListener("pointerdown", unpin);
      scrollEl.removeEventListener("keydown", unpin);
      cancelAnimationFrame(frame);
    };
  }, [scrollEl, months]);

  const jumpToMonth = (month: string) => {
    const idx = filtered.findIndex(m => m.day.startsWith(month));
    if (idx < 0) return;
    setLimit(l => Math.max(l, idx + BATCH));
    pendingScroll.current = `month:${month}`;
    pinnedMonth.current = month;
    setCurrentMonth(month);
  };

  /* ---------- 键盘：直接打字进输入条，/ 聚焦搜索（仅本页在栈顶） ---------- */
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (navigator.current()?.key !== "diary" || e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target.closest("[role=dialog],[role=menu],[role=listbox]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key.length === 1) composerRef.current?.focus();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [navigator]);

  /* ---------- 发布 ---------- */
  const submit = useCallback(
    async ({ text, tags: chosen }: { text: string; tags: string[] }) => {
      try {
        const moment = await mutations.create({
          day: today,
          content: buildContent(text),
          tags: chosen,
        });
        setQuery("");
        setRange(null);
        setFreshIds(new Set([moment.id]));
        scrollEl?.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        toast.error("发布失败");
        throw new Error("发布失败");
      }
    },
    [mutations, today, scrollEl]
  );

  const openTag = useCallback((name: string) => setScope({ kind: "tag", tag: name }), [setScope]);
  const recolor = useCallback(
    (name: string, color: Parameters<typeof mutations.recolor>[1]) =>
      void mutations.recolor(name, color),
    [mutations]
  );

  /** 那年今日点条目：关抽屉，跳到流里那一条并闪一下 */
  const locateMoment = (moment: DiaryMoment) => {
    setDrawerOpen(false);
    navigator.push("diary", { id: "", date: moment.day, moment: String(moment.id) });
  };

  if (loading || !snapshot) return <Loading />;

  const showTease = echoes.length > 0 && !otdDismissed && !filtering && scope.kind === "all";
  const presetLabel =
    range &&
    presetRanges(today).find(p => p.range[0] === range[0] && p.range[1] === range[1])?.label;
  const rangeLabel =
    range &&
    (presetLabel ??
      (range[0] === range[1]
        ? shortDate(range[0], today)
        : `${shortDate(range[0], today)} – ${shortDate(range[1], today)}`));

  return (
    <div className="flex h-full min-h-0 flex-col px-[26px] pb-[18px]">
      {/* 工具栏 */}
      <div className="flex h-12 flex-none items-center gap-3">
        <h1 className="text-tau-title flex items-center gap-2 font-semibold tracking-[-0.01em]">
          日记
          {scope.kind !== "all" && (
            <>
              <span className="text-ink-3 font-normal">/</span>
              {scope.kind === "tag" ? (
                <Tag
                  color={tags.find(t => t.name === scope.tag)?.color ?? "gray"}
                  onRemove={() => setScope({ kind: "all" })}
                >
                  {scope.tag}
                </Tag>
              ) : (
                <Tag onRemove={() => setScope({ kind: "all" })}>无标签</Tag>
              )}
            </>
          )}
        </h1>
        <div className="text-tau-meta text-ink-2 flex min-w-0 items-center gap-2">
          {live.length > 0 &&
            (filtering ? (
              <span>
                <b className="text-ink-1 font-semibold tabular-nums">{filtered.length}</b> 条
              </span>
            ) : (
              <>
                <span>
                  本月{" "}
                  <b className="text-ink-1 font-semibold tabular-nums">
                    {live.filter(m => m.day.startsWith(today.slice(0, 7))).length}
                  </b>{" "}
                  条
                </span>
                <span className="text-ink-3">·</span>
                <span>
                  连续记录{" "}
                  <b className="text-ink-1 font-semibold tabular-nums">{streak(live, today)}</b> 天
                </span>
              </>
            ))}
          {range && (
            <span className="bg-surface border-line-1 text-ink-1 inline-flex h-6 items-center gap-1.5 rounded-[8px] border pl-2.5 pr-1">
              {rangeLabel}
              <IconButton
                title="清除时间筛选"
                className="size-[18px] rounded-[5px]"
                onClick={() => setRange(null)}
              >
                <X className="size-[11px]" strokeWidth={1.75} />
              </IconButton>
            </span>
          )}
        </div>
        <span className="flex-1" />
        {echoes.length > 0 && (
          <IconButton
            data-otd-keep
            title="那年今日"
            onClick={() => setDrawerOpen(o => !o)}
            className={cn(drawerOpen && "bg-accent-soft text-accent-text hover:bg-accent-soft")}
          >
            <History className="size-4" strokeWidth={1.75} />
          </IconButton>
        )}
        <CalendarPopover today={today} stats={stats} range={range} onRange={setRange} />
        <label className="bg-surface border-line-1 focus-within:border-accent flex h-[30px] w-[220px] items-center gap-2 rounded-[10px] border pl-2.5 pr-2 transition-[border-color,box-shadow] duration-[160ms] focus-within:shadow-[var(--tau-focus-ring)]">
          {searching ? (
            <Loader2 className="text-ink-3 size-[14px] animate-spin" strokeWidth={1.75} />
          ) : (
            <Search className="text-ink-3 size-[14px]" strokeWidth={1.75} />
          )}
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
            placeholder="搜索碎碎念…"
            className="text-tau-meta placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
          />
          {query && (
            <IconButton
              title="清除搜索"
              className="size-[18px] rounded-[5px]"
              onClick={() => setQuery("")}
            >
              <X className="size-[11px]" strokeWidth={1.75} />
            </IconButton>
          )}
        </label>
      </div>

      {/* 一整张纸 */}
      <div
        data-diary-sheet
        className="bg-surface shadow-card rounded-tau-lg group/sheet relative flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div
          ref={setScrollEl}
          data-diary-stream
          className="edge-fade-scroll relative min-h-0 flex-1 overflow-y-auto"
        >
          <div className="mx-auto max-w-[860px] px-14 pb-2">
            {live.length === 0 ? (
              <Empty
                icon={PenLine}
                title="写下第一条碎碎念"
                text="不用凑成一篇日记。想到什么就在下面写一句，回车就记下了，一天写几条都行。"
              />
            ) : filtered.length === 0 ? (
              <Empty
                icon={query ? SearchX : History}
                title={searching ? "搜索中…" : query ? "没有匹配的碎碎念" : "这里还没有记录"}
                text={
                  query
                    ? "换个关键词试试。"
                    : scope.kind === "tag"
                      ? "在下面写一条，会自动带上这个标签。"
                      : "清除筛选再看看。"
                }
                action={
                  filtering && !searching ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setQuery("");
                        setRange(null);
                        if (scope.kind !== "all") setScope({ kind: "all" });
                      }}
                    >
                      清除筛选
                    </Button>
                  ) : null
                }
              />
            ) : (
              <>
                {groups.map(group => (
                  <DaySection
                    key={group.day}
                    group={group}
                    freshIds={freshIds}
                    today={today}
                    tags={tags}
                    counts={counts}
                    mutations={mutations}
                    onOpenTag={openTag}
                    onDelete={scheduleDelete}
                    onClearTag={setClearing}
                  />
                ))}
                <div ref={sentinelRef} />
                <p className="text-tau-sm text-ink-3 py-7 text-center">
                  {limit < filtered.length
                    ? "继续往下加载…"
                    : filtering
                      ? `共 ${filtered.length} 条`
                      : `已经到最早的一条了 · 共 ${filtered.length} 条`}
                </p>
              </>
            )}
          </div>
        </div>

        <MonthRail
          months={months}
          current={currentMonth}
          thisYear={today.slice(0, 4)}
          onJump={jumpToMonth}
        />

        {/* 输入条：停靠在纸底，同底色不加横线；上沿渐隐让流自然没入 */}
        <div className="relative z-[4] flex-none pb-3.5 pt-1 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-7 before:bg-gradient-to-t before:from-[var(--tau-bg-surface)] before:to-transparent">
          <div className="mx-auto max-w-[860px] px-14">
            <Composer
              ref={composerRef}
              now={now}
              tags={tags}
              counts={counts}
              scopeTag={scope.kind === "tag" ? scope.tag : null}
              onSubmit={submit}
              onRecolor={recolor}
              onClearTag={setClearing}
              above={
                showTease ? (
                  <OnThisDayTease
                    echoes={echoes}
                    onOpen={() => setDrawerOpen(true)}
                    onDismiss={() => {
                      localStorage.setItem(OTD_DISMISS_KEY, today);
                      setOtdDismissed(true);
                      toast.info("今天不再提示，工具栏里还能打开");
                    }}
                  />
                ) : null
              }
            />
          </div>
        </div>

        <OnThisDayDrawer
          open={drawerOpen}
          today={today}
          echoes={echoes}
          tags={tags}
          onClose={() => setDrawerOpen(false)}
          onLocate={locateMoment}
        />
      </div>

      <ClearTagDialog
        name={clearing}
        count={clearing ? (counts.get(clearing) ?? 0) : 0}
        onOpenChange={open => !open && setClearing(null)}
        onConfirm={async name => {
          await mutations.clearTag(name);
          if (scope.kind === "tag" && scope.tag === name) setScope({ kind: "all" });
          toast.success(`已清理标签「${name}」`);
        }}
      />
    </div>
  );
}

function Empty({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof PenLine;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-ink-2 flex min-h-[56vh] flex-col items-center justify-center gap-2 text-center">
      <div className="bg-accent-soft text-accent-text mb-1.5 grid size-[52px] place-items-center rounded-[16px]">
        <Icon className="size-6" strokeWidth={1.5} />
      </div>
      <h3 className="text-tau-body-lg text-ink-1 font-semibold">{title}</h3>
      <p className="text-tau-meta max-w-[34ch]">{text}</p>
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

/**
 * 滚到目标并等布局落定。流里条目 `content-visibility: auto`（屏外按 120px 估高），编辑器
 * 挂载后还会归一化、图片晚到——按估算位置一次（尤其平滑）滚过去，沿途真实高度出来就偏了。
 * 故瞬时跳转后逐帧校正，连续 6 帧不再移动即止（留出屏外占位换成编辑器的几帧）（上限约 1 秒）；用户一滚动 / 按下立即让出。
 */
function scrollSettled(container: HTMLElement, el: HTMLElement, align: "center" | "top") {
  let frame = 0;
  let still = 0;
  let tries = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    container.removeEventListener("wheel", stop);
    container.removeEventListener("pointerdown", stop);
    container.removeEventListener("keydown", stop);
  };
  const step = () => {
    const box = container.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    // 比视口还高的条目居中会看不到开头，退回顶部对齐
    const center = align === "center" && rect.height < box.height * 0.8;
    const delta = center
      ? rect.top + rect.height / 2 - (box.top + box.height / 2)
      : rect.top - box.top - (align === "center" ? 24 : 6);
    const before = container.scrollTop;
    if (Math.abs(delta) > 1) container.scrollTop += delta;
    still = Math.abs(container.scrollTop - before) < 1 ? still + 1 : 0;
    if (still < 6 && ++tries < 60) frame = requestAnimationFrame(step);
    else stop();
  };
  container.addEventListener("wheel", stop, { passive: true });
  container.addEventListener("pointerdown", stop);
  container.addEventListener("keydown", stop);
  step();
  return stop;
}
