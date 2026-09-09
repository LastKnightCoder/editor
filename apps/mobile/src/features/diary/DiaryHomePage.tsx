import { useEffect, useMemo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DiaryEntry, DiaryType } from "../../types";
import { useDiaryStore } from "./store/useDiaryStore";
import { useDiaryEntries } from "./queries";
import {
  getBaseDateFromDiaryKey,
  getDiaryDateKey,
  getDiaryComparableDate,
  sortDiaryEntriesDesc,
} from "./dateKey";

type DiaryHomePageProps = {
  onBack: () => void;
  onOpenEditor: (mode: DiaryType, baseDate: string) => void;
  onError: (error: unknown, fallback: string) => void;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(dateKey: string): Date {
  const matched = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }
  return new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]), 0, 0, 0, 0);
}

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const parsed = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!parsed) {
    return monthKeyOf(new Date());
  }
  const base = new Date(Number(parsed[1]), Number(parsed[2]) - 1, 1, 0, 0, 0, 0);
  base.setMonth(base.getMonth() + delta);
  return monthKeyOf(base);
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${year}年${month}月`;
}

function entryTypeLabel(type: DiaryType): string {
  if (type === "daily") return "日记";
  if (type === "weekly") return "周记";
  return "月记";
}

function entryDateLabel(entry: DiaryEntry): string {
  if (entry.type === "daily") {
    return entry.date;
  }
  return getDiaryComparableDate(entry.type, entry.date);
}

function weekdayLabel(index: number): string {
  const labels = ["一", "二", "三", "四", "五", "六", "日"];
  return labels[index] ?? "";
}

export function DiaryHomePage({ onBack, onOpenEditor, onError }: DiaryHomePageProps) {
  const mode = useDiaryStore(state => state.mode);
  const baseDate = useDiaryStore(state => state.baseDate);
  const entriesQuery = useDiaryEntries();
  const entries = entriesQuery.data ?? [];
  const loading = entriesQuery.isLoading;
  const initialize = useDiaryStore(state => state.initialize);
  const [browseMode, setBrowseMode] = useState<DiaryType>(mode);

  const [activeMonthKey, setActiveMonthKey] = useState(monthKeyOf(parseDateKey(baseDate)));

  useEffect(() => {
    void initialize().catch(error => {
      onError(error, "日记数据加载失败");
    });
  }, [initialize, onError]);

  useEffect(() => {
    setActiveMonthKey(monthKeyOf(parseDateKey(baseDate)));
  }, [baseDate]);

  useEffect(() => {
    setBrowseMode(mode);
  }, [mode]);

  const entryKeysByMode = useMemo(() => {
    return {
      daily: new Set(entries.filter(entry => entry.type === "daily").map(entry => entry.date)),
      weekly: new Set(entries.filter(entry => entry.type === "weekly").map(entry => entry.date)),
      monthly: new Set(entries.filter(entry => entry.type === "monthly").map(entry => entry.date)),
    } satisfies Record<DiaryType, Set<string>>;
  }, [entries]);

  const activeMonthMatrix = useMemo(() => {
    const parsed = activeMonthKey.match(/^(\d{4})-(\d{2})$/);
    const now = new Date();
    const year = parsed ? Number(parsed[1]) : now.getFullYear();
    const month = parsed ? Number(parsed[2]) - 1 : now.getMonth();
    const firstDay = new Date(year, month, 1, 0, 0, 0, 0);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leading = (firstDay.getDay() + 6) % 7;
    const total = Math.ceil((leading + daysInMonth) / 7) * 7;
    const todayKey = formatDateKey(new Date());

    return Array.from({ length: total }).map((_, index) => {
      const dayNum = index - leading + 1;
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
      if (!inMonth) {
        return {
          key: `empty-${index}`,
          inMonth: false,
          day: "",
          dateKey: "",
          hasEntry: false,
          isToday: false,
        };
      }
      const date = new Date(year, month, dayNum, 0, 0, 0, 0);
      const dateKey = formatDateKey(date);
      const browseKey = getDiaryDateKey(browseMode, dateKey);
      return {
        key: dateKey,
        inMonth: true,
        day: String(dayNum),
        dateKey,
        hasEntry: entryKeysByMode[browseMode].has(browseKey),
        isToday: dateKey === todayKey,
      };
    });
  }, [activeMonthKey, browseMode, entryKeysByMode]);

  const recentEntries = useMemo(() => sortDiaryEntriesDesc(entries).slice(0, 20), [entries]);

  const openByDate = useMemoizedFn((dateKey: string) => {
    onOpenEditor(browseMode, dateKey);
  });

  const openEntry = useMemoizedFn((entry: DiaryEntry) => {
    onOpenEditor(entry.type, getBaseDateFromDiaryKey(entry.type, entry.date));
  });

  return (
    <div className="mobile-kb-screen fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-black">
      <header className="mobile-topbar topbar-immersive flex items-center px-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="line-clamp-1 flex-1 px-2 text-center text-base font-semibold text-gray-900 dark:text-neutral-100">
          日记
        </h1>
        <div className="w-10" />
      </header>

      <div className="mobile-kb-scroll flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <section className="flex gap-2 rounded-xl bg-white p-2 dark:bg-neutral-900">
            <button
              type="button"
              onClick={() => setBrowseMode("daily")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                browseMode === "daily"
                  ? "bg-zinc-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-gray-50 text-gray-600 active:bg-gray-100 dark:bg-neutral-800 dark:text-neutral-300 dark:active:bg-neutral-700"
              }`}
            >
              日记
            </button>
            <button
              type="button"
              onClick={() => setBrowseMode("weekly")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                browseMode === "weekly"
                  ? "bg-zinc-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-gray-50 text-gray-600 active:bg-gray-100 dark:bg-neutral-800 dark:text-neutral-300 dark:active:bg-neutral-700"
              }`}
            >
              周记
            </button>
            <button
              type="button"
              onClick={() => setBrowseMode("monthly")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                browseMode === "monthly"
                  ? "bg-zinc-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-gray-50 text-gray-600 active:bg-gray-100 dark:bg-neutral-800 dark:text-neutral-300 dark:active:bg-neutral-700"
              }`}
            >
              月记
            </button>
          </section>

          <section className="rounded-xl bg-white p-3 dark:bg-neutral-900">
            <div className="mb-3 flex items-center">
              <button
                type="button"
                onClick={() => setActiveMonthKey(prev => shiftMonthKey(prev, -1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
                aria-label="上一月"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <h2 className="flex-1 text-center text-sm font-semibold text-gray-900 dark:text-neutral-100">
                {monthLabel(activeMonthKey)}
              </h2>
              <button
                type="button"
                onClick={() => setActiveMonthKey(prev => shiftMonthKey(prev, 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
                aria-label="下一月"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, index) => (
                <div
                  key={`weekday-${index}`}
                  className="py-1 text-center text-[11px] font-medium text-gray-400 dark:text-neutral-500"
                >
                  {weekdayLabel(index)}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {activeMonthMatrix.map(cell => (
                <button
                  key={cell.key}
                  type="button"
                  disabled={!cell.inMonth}
                  onClick={() => {
                    if (cell.inMonth) {
                      openByDate(cell.dateKey);
                    }
                  }}
                  className={`relative flex h-10 items-center justify-center rounded-lg text-sm transition-colors ${
                    !cell.inMonth
                      ? "cursor-default opacity-0"
                      : cell.isToday
                        ? "bg-zinc-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                        : "bg-gray-50 text-gray-700 active:bg-gray-100 dark:bg-neutral-800 dark:text-neutral-200 dark:active:bg-neutral-700"
                  }`}
                >
                  {cell.day}
                  {cell.hasEntry && (
                    <span
                      className={`absolute bottom-1 h-1 w-1 rounded-full ${
                        cell.isToday ? "bg-white dark:bg-neutral-900" : "bg-indigo-500"
                      }`}
                    />
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl bg-white p-3 dark:bg-neutral-900">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
                最近记录
              </h3>
              <span className="text-xs text-gray-400 dark:text-neutral-500">
                当前模式：{entryTypeLabel(browseMode)}
              </span>
            </div>
            {loading && recentEntries.length === 0 ? (
              <div className="space-y-2 py-3">
                <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
                <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
              </div>
            ) : recentEntries.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400 dark:text-neutral-500">
                暂无记录，点击日历日期开始写作
              </p>
            ) : (
              <div className="space-y-2">
                {recentEntries.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => openEntry(entry)}
                    className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left transition-colors active:bg-gray-100 dark:border-neutral-700 dark:bg-neutral-800 dark:active:bg-neutral-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500 dark:text-neutral-400">
                        {entryDateLabel(entry)}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-neutral-700 dark:text-neutral-300">
                        {entryTypeLabel(entry.type)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-800 dark:text-neutral-100">
                      {entry.wordCount > 0 ? `${entry.wordCount} 字` : "空白日记"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default DiaryHomePage;
