// 日记主页：信息流（v2 模板）。
// 顶部快捷输入条 + 标签筛选（按标签库动态生成，多选 OR）+ 按月分组的时间线卡片
// （虚拟化，对齐卡片库）；日历降级为右上角的次要查找入口（BottomSheet 月历）。
// 对齐桌面端设计：日记 / 周记 / 月记只是日记的标签，类型不再是身份标识。
// 数据来自 diary query 缓存；每个片段一张独立卡片，点击经 onOpenSegment
// 直达该片段编辑，片段「···」菜单可编辑标签、删除单个片段（确认后乐观移除
// 并延迟落库，Toast 提供撤销窗口）。
//
// 产品设计（重要，勿回退）：
// 1. 日记是「朋友圈式」的——一天可以发多条，每条就是一个 segment。
//    顶部输入条是「发新日记」入口，必须新建 segment（当天最新片段为空时
//    复用该空片段防垃圾），绝不能打开当天已有日记继续写；
//    日历选日期才是「查看/续写那天」的入口，按天打开最新片段。
// 2. 标签与具体 segment 绑定，同一天的多条日记各自独立打标签；
//    数据库 entry 上遗留的 tags 列只是旧模型的历史数据，不再读写。

import { useDiaryI18n, diaryTranslator } from "./i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { useEdgeFade, useEdgeFadeX } from "../../hooks/useScrollState";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CalendarDays, ChevronLeft, ChevronRight, PenLine, Settings2 } from "lucide-react";
import type { DiaryEntry, DiarySegment, DiaryType } from "../../types";
import { BottomSheet } from "../../components/BottomSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { toast } from "../../components/toast";
import * as tauri from "../../services/tauri";
import { clampText } from "../../utils/richTextText";
import { useDiaryStore } from "./store/useDiaryStore";
import { useDiaryEntries, useDiaryTagSettings, writeDiaryEntries } from "./queries";
import { groupDiaryEntriesByMonth } from "./dateKey";
import {
  collectDailyDates,
  computeDailyStreak,
  getTodayDateKey,
  hasDiaryContent,
} from "./feedUtils";
import { describeDiaryPeriod, monthLabel, weekLabels } from "./format";
import { getBaseDateFromDiaryKey } from "./dateKey";
import DiaryCardItem, { segmentTagsBrief } from "./DiaryCardItem";
import {
  DiaryTagEditorSheet,
  DiaryTagManageSheet,
  FALLBACK_TAG_COLOR,
  hexToRgba,
  isLightColor,
} from "./DiaryTagSheets";

type DiaryHomePageProps = {
  /** 发新日记：新建今天的 segment，而不是打开当天已有日记 */
  onComposeToday: () => void;
  /** 按日期打开那天的日记（日历查找入口，续写最新片段） */
  onOpenEditor: (mode: DiaryType, baseDate: string) => void;
  onOpenSegment: (entry: DiaryEntry, segment: DiarySegment) => void;
  onError: (error: unknown, fallback: string) => void;
};

const formatTodayKey = getTodayDateKey;

/** 删除撤销窗口：确认后乐观移除，此时间内可从 Toast 撤销，到期才真正落库 */
const UNDO_WINDOW_MS = 5000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

// 月份分组头 / 日记卡片的高度估算（measureElement 实测后自动修正）
const MONTH_ROW_ESTIMATE = 48;
const ENTRY_ROW_ESTIMATE = 168;

/** 虚拟行：月份分组头或片段卡片 */
type DiaryFeedRow =
  | { kind: "month"; key: string; month: string; count: number; wordTotal: number }
  | { kind: "segment"; key: string; entry: DiaryEntry; segment: DiarySegment };

export function DiaryHomePage({
  onComposeToday,
  onOpenEditor,
  onOpenSegment,
  onError,
}: DiaryHomePageProps) {
  const { t, locale } = useDiaryI18n();
  const mode = useDiaryStore(state => state.mode);
  const baseDate = useDiaryStore(state => state.baseDate);
  const entriesQuery = useDiaryEntries();
  const tagSettingsQuery = useDiaryTagSettings();
  const emptyEntries = useMemo<DiaryEntry[]>(() => [], []);
  const entries = entriesQuery.data ?? emptyEntries;
  const tagSettings = tagSettingsQuery.data ?? [];
  const loading = entriesQuery.isLoading;
  const initialize = useDiaryStore(state => state.initialize);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // 编辑标签的目标是具体 segment（标签与片段绑定），entry 仅用于缓存定位
  const [tagEditorTarget, setTagEditorTarget] = useState<{
    entry: DiaryEntry;
    segment: DiarySegment;
  } | null>(null);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    entry: DiaryEntry;
    segment: DiarySegment;
  } | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // onError 入 ref：父层内联回调的引用变化不应反复触发 initialize
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    void initialize().catch(error => {
      onErrorRef.current(error, diaryTranslator.t("load.failed"));
    });
  }, [initialize]);

  const dailyDates = useMemo(() => collectDailyDates(entries), [entries]);
  const streak = useMemo(() => computeDailyStreak(dailyDates, new Date()), [dailyDates]);

  // 被删除/改名的标签若正挂在筛选上，同步摘除，避免筛选到空集
  useEffect(() => {
    setSelectedTags(prev => {
      const alive = prev.filter(tag => tagSettings.some(setting => setting.name === tag));
      return alive.length === prev.length ? prev : alive;
    });
  }, [tagSettings]);

  const tagColorMap = useMemo(
    () => new Map(tagSettings.map(setting => [setting.name, setting.color])),
    [tagSettings]
  );
  const tagColorOf = useMemoizedFn((tag: string) => tagColorMap.get(tag) ?? FALLBACK_TAG_COLOR);

  // 标签使用计数按片段统计（标签绑 segment，一天多条日记各算各的）
  const tagUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      for (const segment of entry.segments) {
        for (const tag of segment.tags) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [entries]);
  const usageCount = useMemoizedFn((tag: string) => tagUsageCounts.get(tag) ?? 0);

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]
    );
  };

  const monthGroups = useMemo(() => groupDiaryEntriesByMonth(entries), [entries]);

  // 编辑标签的目标始终取缓存中的最新快照（toggle 落库后 props 随之更新）
  const tagEditorTargetFresh = useMemo(() => {
    if (!tagEditorTarget) return null;
    const entry = entries.find(item => item.id === tagEditorTarget.entry.id);
    const segment = entry?.segments.find(item => item.id === tagEditorTarget.segment.id);
    if (!entry || !segment) return tagEditorTarget;
    return { entry, segment };
  }, [tagEditorTarget, entries]);

  // 虚拟化行：月份分组头与片段卡片扁平混排；同一天内片段倒序（最新在上）。
  // 标签筛选取 segment.tags（标签与片段绑定），只保留命中的片段
  const feedRows = useMemo<DiaryFeedRow[]>(() => {
    const rows: DiaryFeedRow[] = [];
    monthGroups.forEach(group => {
      // 空壳 entry（片段已删光）不参与展示，避免渲染出没有卡片的「0 条」空月份分组
      const displayEntries = group.entries
        .filter(hasDiaryContent)
        .map(entry => ({
          entry,
          segments: entry.segments.filter(
            segment =>
              selectedTags.length === 0 || selectedTags.some(tag => segment.tags.includes(tag))
          ),
        }))
        .filter(item => item.segments.length > 0);
      if (displayEntries.length === 0) return;
      rows.push({
        kind: "month",
        key: `month-${group.monthKey}`,
        month: group.monthKey,
        count: displayEntries.reduce((sum, item) => sum + item.segments.length, 0),
        wordTotal: displayEntries.reduce(
          (sum, item) => sum + item.segments.reduce((acc, seg) => acc + seg.wordCount, 0),
          0
        ),
      });
      displayEntries.forEach(({ entry, segments }) => {
        [...segments].reverse().forEach(segment => {
          rows.push({ kind: "segment", key: `segment-${segment.id}`, entry, segment });
        });
      });
    });
    return rows;
  }, [monthGroups, selectedTags]);

  // 列表所在的滚动容器与其内容包裹层（快捷输入/筛选条位于列表上方，随内容滚动）
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEdgeFade(scrollRef);
  const tagFilterRef = useRef<HTMLDivElement | null>(null);
  useEdgeFadeX(tagFilterRef);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // scrollMargin = 列表顶部相对滚动容器内容顶部的距离（虚拟化坐标系原点）
  const applyScrollMargin = useCallback(() => {
    const element = listRef.current;
    const scroller = scrollRef.current;
    if (!element || !scroller) return;
    const nextMargin =
      element.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    setScrollMargin(prev => (Math.abs(prev - nextMargin) > 1 ? nextMargin : prev));
  }, []);

  const virtualizer = useVirtualizer({
    count: feedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: index =>
      feedRows[index]?.kind === "month" ? MONTH_ROW_ESTIMATE : ENTRY_ROW_ESTIMATE,
    overscan: 6,
    scrollMargin,
    getItemKey: index => feedRows[index]?.key ?? index,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    applyScrollMargin();

    window.addEventListener("resize", applyScrollMargin);
    window.addEventListener("orientationchange", applyScrollMargin);
    return () => {
      window.removeEventListener("resize", applyScrollMargin);
      window.removeEventListener("orientationchange", applyScrollMargin);
    };
  }, [applyScrollMargin]);

  useEffect(() => {
    applyScrollMargin();
  }, [applyScrollMargin, feedRows.length, loading]);

  const openToday = useMemoizedFn(() => {
    // 发新日记：走创建入口新建 segment，而非打开当天已有日记（见文件头产品设计注释）
    onComposeToday();
  });
  const openByDate = useMemoizedFn((dateKey: string) => {
    setCalendarOpen(false);
    onOpenEditor("daily", dateKey);
  });
  const requestDeleteSegment = useMemoizedFn((entry: DiaryEntry, segment: DiarySegment) => {
    setDeleteTarget({ entry, segment });
  });

  // 乐观移除单个片段；该日记片段删光时连同空壳 entry 一起移出列表
  const removeSegmentFromCache = useMemoizedFn((entryId: number, segmentId: number) => {
    writeDiaryEntries(prev =>
      prev.flatMap(item => {
        if (item.id !== entryId) return [item];
        const nextSegments = (item.segments ?? []).filter(segment => segment.id !== segmentId);
        return nextSegments.length > 0 ? [{ ...item, segments: nextSegments }] : [];
      })
    );
  });

  const restoreEntry = useMemoizedFn((entry: DiaryEntry) => {
    writeDiaryEntries(prev => {
      if (!prev.some(item => item.id === entry.id)) return [...prev, entry];
      return prev.map(item => {
        if (item.id !== entry.id) return item;
        // 删除期间该天可能有新片段：合并恢复的片段，按 id 还原创建升序
        const restoredIds = new Set(entry.segments.map(segment => segment.id));
        const mergedSegments = [
          ...item.segments.filter(segment => !restoredIds.has(segment.id)),
          ...entry.segments,
        ].sort((a, b) => a.id - b.id);
        return { ...item, segments: mergedSegments };
      });
    });
    toast({ type: "info", text: t("restored") });
  });

  const commitDelete = useMemoizedFn(async (entry: DiaryEntry, segment: DiarySegment) => {
    try {
      const saved = await tauri.diaryDeleteSegment(entry.id, segment.id);
      // 后端权威数据回填：片段删光时 entry 连空壳一起删除（saved 为 null），不再放回列表
      writeDiaryEntries(prev =>
        saved?.segments?.length
          ? prev.some(item => item.id === saved.id)
            ? prev.map(item => (item.id === saved.id ? saved : item))
            : [...prev, saved]
          : prev.filter(item => item.id !== entry.id)
      );
    } catch (error) {
      onErrorRef.current(error, t("delete.failed"));
      // 落库失败说明数据仍在数据库，把片段放回列表
      restoreEntry(entry);
    }
  });

  const handleDeleteSegment = () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    removeSegmentFromCache(target.entry.id, target.segment.id);
    const commitTimer = window.setTimeout(() => {
      void commitDelete(target.entry, target.segment);
    }, UNDO_WINDOW_MS);
    toast({
      type: "success",
      text: t("deleted"),
      duration: UNDO_WINDOW_MS,
      action: {
        label: t("undo"),
        onClick: () => {
          window.clearTimeout(commitTimer);
          restoreEntry(target.entry);
        },
      },
    });
  };

  // 快捷输入始终对准今天：进入页面即校正 store 的 mode/baseDate
  useEffect(() => {
    const todayKey = formatTodayKey();
    if (mode !== "daily" || baseDate !== todayKey) {
      useDiaryStore.setState({ mode: "daily", baseDate: todayKey });
    }
  }, [mode, baseDate]);

  // 当前浏览月份的日历矩阵（含「有日记」标记与今天高亮）
  const calendarMatrix = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = (firstDay.getDay() + 6) % 7;
    const todayKey = formatTodayKey();
    const cells: Array<{
      key: string;
      day: string;
      dateKey: string;
      inMonth: boolean;
      hasEntry: boolean;
      isToday: boolean;
    }> = [];
    for (let i = 0; i < leading; i += 1) {
      cells.push({
        key: `empty-${i}`,
        day: "",
        dateKey: "",
        inMonth: false,
        hasEntry: false,
        isToday: false,
      });
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dateKey = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      cells.push({
        key: dateKey,
        day: String(d),
        dateKey,
        inMonth: true,
        hasEntry: dailyDates.has(dateKey),
        isToday: dateKey === todayKey,
      });
    }
    return cells;
  }, [calendarMonth, dailyDates]);

  const shiftCalendarMonth = (delta: number) => {
    setCalendarMonth(prev => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  return (
    <div className="bg-page relative flex h-full flex-col">
      <header className="flex items-center justify-between px-[18px] pt-[calc(20px+var(--mobile-safe-top))]">
        <div>
          <h1 className="text-ink-1 text-2xl font-extrabold tracking-tight">{t("title")}</h1>
          <p className="text-ink-2 mt-1 text-[12.5px]">
            {streak > 0 ? t("streak", { amount: streak.toLocaleString(locale) }) : t("start")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCalendarOpen(true)}
          aria-label={t("calendar.title")}
          className="bg-surface text-ink-2 shadow-card grid h-[42px] w-[42px] place-items-center rounded-[15px] transition-transform duration-200 active:scale-88"
        >
          <CalendarDays size={20} strokeWidth={1.9} aria-hidden="true" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="edge-fade-scroll dock-pad scrollbar-hide flex-1 overflow-y-auto overscroll-y-contain"
      >
        <div ref={contentRef} className="px-[18px]">
          <button
            type="button"
            onClick={openToday}
            className="bg-surface text-ink-3 shadow-card mt-3 flex h-[46px] w-full items-center gap-2.5 rounded-[16px] px-4 text-[14px] transition-transform duration-150 active:scale-[0.985]"
          >
            <PenLine size={16} strokeWidth={2} aria-hidden="true" />
            {t("compose")}
            <span
              className="text-ink-inverse ml-auto grid h-[30px] w-[30px] place-items-center rounded-[11px]"
              style={{ background: "var(--tau-accent)", boxShadow: "var(--tau-shadow-lift)" }}
            >
              <PenLine size={14} strokeWidth={2.2} aria-hidden="true" />
            </span>
          </button>

          <nav className="mt-3 flex items-center gap-2 py-0.5" aria-label={t("tag.filter")}>
            <div
              ref={tagFilterRef}
              className="edge-fade-x-scroll scrollbar-hide flex flex-1 gap-2 overflow-x-auto"
            >
              <button
                type="button"
                onClick={() => setSelectedTags([])}
                className={`shadow-card shrink-0 rounded-full px-[15px] py-[9px] text-[13px] font-semibold transition-all duration-200 ${
                  selectedTags.length === 0 ? "bg-accent-soft text-ink-1" : "bg-surface text-ink-2"
                }`}
              >
                {t("all")}
              </button>
              {tagSettings.map(setting => {
                const selected = selectedTags.includes(setting.name);
                const light = isLightColor(setting.color);
                return (
                  <button
                    key={setting.name}
                    type="button"
                    onClick={() => toggleTagFilter(setting.name)}
                    aria-pressed={selected}
                    className={`shadow-card flex shrink-0 items-center gap-[6px] rounded-full px-[15px] py-[9px] text-[13px] font-semibold transition-all duration-200 ${
                      selected ? (light ? "text-ink-1" : "") : "bg-surface text-ink-2"
                    }`}
                    style={
                      selected
                        ? {
                            backgroundColor: hexToRgba(setting.color, light ? 0.32 : 0.16),
                            color: light ? undefined : setting.color,
                          }
                        : undefined
                    }
                  >
                    <span
                      aria-hidden
                      className="h-[7px] w-[7px] rounded-full"
                      style={{ backgroundColor: setting.color }}
                    />
                    {setting.name}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setManageTagsOpen(true)}
              aria-label={t("tag.manage")}
              className="bg-surface text-ink-2 shadow-card grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full transition-transform duration-200 active:scale-88"
            >
              <Settings2 size={17} strokeWidth={2} aria-hidden="true" />
            </button>
          </nav>

          {loading && entries.length === 0 ? (
            <div className="space-y-3 pt-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="card p-4">
                  <div className="bg-page h-4 w-24 animate-pulse rounded-full" />
                  <div className="bg-page mt-3 h-4 w-full animate-pulse rounded" />
                  <div className="bg-page mt-2 h-4 w-2/3 animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : feedRows.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-ink-2 text-[15px] font-semibold">{t("empty.title")}</p>
              <p className="text-ink-3 mt-1.5 text-[13px]">{t("empty.hint")}</p>
            </div>
          ) : (
            <div
              ref={listRef}
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualItems.map(virtualItem => {
                const row = feedRows[virtualItem.index];
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start - scrollMargin}px)`,
                      boxSizing: "border-box",
                    }}
                  >
                    {row?.kind === "month" ? (
                      <div className="text-ink-3 mt-5 mb-2.5 flex items-center gap-2.5 text-[12px] font-bold">
                        <span>{monthLabel(row.month, locale)}</span>
                        <span className="font-mono text-[11px] font-medium">
                          {t("summary", {
                            entries: row.count.toLocaleString(locale),
                            words: row.wordTotal.toLocaleString(locale),
                          })}
                        </span>
                        <span className="bg-line-1 h-[1.5px] flex-1" />
                      </div>
                    ) : row ? (
                      <DiaryCardItem
                        segment={row.segment}
                        entry={row.entry}
                        tagColorOf={tagColorOf}
                        onOpenSegment={onOpenSegment}
                        onEditTags={(entry, segment) => setTagEditorTarget({ entry, segment })}
                        onDeleteSegment={requestDeleteSegment}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <MobileConfirmDialog
        open={deleteTarget !== null}
        title={t("delete.title")}
        description={t("delete.description", {
          title: clampText(
            deleteTarget
              ? [
                  describeDiaryPeriod(
                    {
                      mode: deleteTarget.entry.type,
                      baseDate: getBaseDateFromDiaryKey(
                        deleteTarget.entry.type,
                        deleteTarget.entry.date
                      ),
                    },
                    { t, locale }
                  ).title,
                  segmentTagsBrief(deleteTarget.segment),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "",
            18
          ),
        })}
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteSegment}
      />

      <BottomSheet
        open={calendarOpen}
        title={t("calendar.title")}
        onClose={() => setCalendarOpen(false)}
      >
        <div className="mb-3 flex items-center">
          <button
            type="button"
            onClick={() => shiftCalendarMonth(-1)}
            aria-label={t("calendar.previous")}
            className="bg-page text-ink-2 grid h-9 w-9 place-items-center rounded-xl transition-transform duration-150 active:scale-88"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <p className="text-ink-1 flex-1 text-center text-[15px] font-bold tabular-nums">
            {monthLabel(`${calendarMonth.year}-${pad2(calendarMonth.month + 1)}`, locale)}
          </p>
          <button
            type="button"
            onClick={() => shiftCalendarMonth(1)}
            aria-label={t("calendar.next")}
            className="bg-page text-ink-2 grid h-9 w-9 place-items-center rounded-xl transition-transform duration-150 active:scale-88"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekLabels(locale).map((w, index) => (
            <div key={index} className="text-ink-3 pb-1.5 text-center text-[10.5px] font-semibold">
              {w}
            </div>
          ))}
          {calendarMatrix.map(cell =>
            cell.inMonth ? (
              <button
                key={cell.key}
                type="button"
                onClick={() => openByDate(cell.dateKey)}
                className={`active:bg-page relative grid aspect-square place-items-center rounded-[13px] text-[14px] font-semibold tabular-nums transition-colors ${
                  cell.isToday ? "text-ink-inverse" : "text-ink-2"
                }`}
                style={cell.isToday ? { background: "var(--tau-accent)" } : undefined}
              >
                {Number(cell.day).toLocaleString(locale)}
                {cell.hasEntry && !cell.isToday ? (
                  <span className="bg-tag-1 absolute bottom-[4px] h-[4px] w-[4px] rounded-full" />
                ) : null}
              </button>
            ) : (
              <div key={cell.key} className="aspect-square" />
            )
          )}
        </div>
      </BottomSheet>

      <DiaryTagEditorSheet
        open={tagEditorTarget !== null}
        entry={tagEditorTargetFresh?.entry ?? null}
        segment={tagEditorTargetFresh?.segment ?? null}
        tagSettings={tagSettings}
        onClose={() => setTagEditorTarget(null)}
        onOpenManage={() => setManageTagsOpen(true)}
        onError={onError}
      />

      <DiaryTagManageSheet
        open={manageTagsOpen}
        tagSettings={tagSettings}
        usageCount={usageCount}
        onClose={() => setManageTagsOpen(false)}
        onError={onError}
      />
    </div>
  );
}

export default DiaryHomePage;
