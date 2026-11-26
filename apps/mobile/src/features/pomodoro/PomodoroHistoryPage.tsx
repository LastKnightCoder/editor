import { pomoText, pomoValue, usePomodoroI18n, getPomodoroLocale, presetNameOf } from "./i18n";
// 专注记录页（P4·周条形图）：周切换 + 7 柱图 + 该周会话按日分组流。
// 行级操作：修正专注时长（BottomSheet 步进）/ 删除。

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { ActionSheet } from "../../components/ActionSheet";
import type { ActionSheetItem } from "../../components/ActionSheet";
import { BottomSheet } from "../../components/BottomSheet";
import { MobileConfirmDialog } from "../../components/MobileConfirmDialog";
import { useEdgeFade } from "../../hooks/useScrollState";
import { toast } from "../../components/toast";
import type { PomodoroSession } from "../../types";
import * as tauri from "../../services/tauri";
import {
  invalidatePomodoroQueries,
  usePomodoroPresets,
  usePomodoroSessions,
  usePomodoroWeeklySummary,
} from "./queries";
import { DAY_MS, formatFocusDuration, startOfDay, startOfWeek, weekdayIndex } from "./timer";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEK_LIMIT = 100;

function formatDayLabel(dayStart: number, today: number): string {
  if (dayStart === today) return pomoText("ui.today");
  if (dayStart === today - DAY_MS) return pomoText("ui.yesterday");
  const date = new Date(dayStart);
  return pomoText("date.monthDay", {
    month: pomoValue(date.getMonth() + 1),
    day: pomoValue(date.getDate()),
  });
}

function formatRangeLabel(weekStart: number): string {
  const first = new Date(weekStart);
  const last = new Date(weekStart + 6 * DAY_MS);
  const sameMonth = first.getMonth() === last.getMonth();
  const md = (d: Date) =>
    pomoText("date.monthDay", {
      month: pomoValue(d.getMonth() + 1),
      day: pomoValue(d.getDate()),
    });
  return sameMonth
    ? pomoText("date.monthDayRange", {
        month: pomoValue(first.getMonth() + 1),
        from: pomoValue(first.getDate()),
        to: pomoValue(last.getDate()),
      })
    : `${md(first)} – ${md(last)}`;
}

function formatTimeOfDay(ts: number): string {
  const date = new Date(ts);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** 目标日相对「本周」的周偏移：历史日期为负数，供聚焦模式下定位周视图 */
function weekOffsetOf(dayStart: number, now = new Date()): number {
  return Math.round((dayStart - startOfWeek(0, now)) / (7 * DAY_MS));
}

type PomodoroHistoryPageProps = {
  onBack: () => void;
  onError: (error: unknown, fallback: string) => void;
  /** 聚焦日（本地 00:00）：从某天日程详情进入时只看该日记录，null 为整周浏览 */
  focusDay?: number | null;
};

export function PomodoroHistoryPage({
  onBack,
  onError,
  focusDay = null,
}: PomodoroHistoryPageProps) {
  usePomodoroI18n();

  const listScrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(listScrollRef);

  const [focusedDay, setFocusedDay] = useState<number | null>(focusDay);
  const [weekOffset, setWeekOffset] = useState(() =>
    focusDay === null ? 0 : weekOffsetOf(focusDay)
  );
  const today = useMemo(() => startOfDay(new Date()), []);
  const weekStart = useMemo(() => startOfWeek(weekOffset), [weekOffset]);
  const weekEnd = weekStart + 7 * DAY_MS - 1;

  // 手动翻周即回到整周浏览：聚焦日只属于它自己那一周
  const changeWeek = (delta: number) => {
    setFocusedDay(null);
    setWeekOffset(value => Math.min(0, value + delta));
  };

  const presetsQuery = usePomodoroPresets();
  const presets = presetsQuery.data ?? [];

  const weeklyQuery = usePomodoroWeeklySummary(weekOffset);
  const sessionsQuery = usePomodoroSessions({ start: weekStart, end: weekEnd, limit: WEEK_LIMIT });

  const [moreSession, setMoreSession] = useState<PomodoroSession | null>(null);
  const [editSession, setEditSession] = useState<PomodoroSession | null>(null);
  const [editMinutes, setEditMinutes] = useState(25);
  const [deleteSession, setDeleteSession] = useState<PomodoroSession | null>(null);
  const [saving, setSaving] = useState(false);

  const daily = weeklyQuery.data ?? [];
  const weekFocusMs = daily.reduce((sum, day) => sum + day.focusMs, 0);
  const maxDayFocus = Math.max(1, ...daily.map(day => day.focusMs));

  const sessions = sessionsQuery.data ?? [];
  const grouped = useMemo(() => {
    const groups: Array<{ dayStart: number; items: PomodoroSession[] }> = [];
    for (const session of sessions) {
      const date = new Date(session.endTime ?? session.startTime);
      const localDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      const group = groups.find(item => item.dayStart === localDay);
      if (group) group.items.push(session);
      else groups.push({ dayStart: localDay, items: [session] });
    }
    return groups.sort((a, b) => b.dayStart - a.dayStart);
  }, [sessions]);
  const visibleGroups = useMemo(
    () => (focusedDay === null ? grouped : grouped.filter(group => group.dayStart === focusedDay)),
    [grouped, focusedDay]
  );

  const moreItems = (session: PomodoroSession): ActionSheetItem[] => [
    {
      get label() {
        return pomoText("ui.correctFocusDuration");
      },
      icon: <Pencil size={16} />,
      onClick: () => {
        setMoreSession(null);
        setEditMinutes(Math.max(1, Math.round(session.focusMs / 60_000)));
        setEditSession(session);
      },
    },
    {
      get label() {
        return pomoText("ui.deleteRecord");
      },
      icon: <Trash2 size={16} />,
      danger: true,
      onClick: () => {
        setMoreSession(null);
        setDeleteSession(session);
      },
    },
  ];

  const saveFocusEdit = async () => {
    if (!editSession) return;
    setSaving(true);
    try {
      await tauri.pomodoroUpdateSession(editSession.id, editMinutes * 60_000);
      invalidatePomodoroQueries();
      toast.success(pomoText("ui.focusDurationCorrected"));
      setEditSession(null);
    } catch (error) {
      onError(error, pomoText("ui.couldNotCorrectFocusDuration"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader title={pomoText("ui.focusHistory")} onBack={onBack} />

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={listScrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto overscroll-contain"
        >
          {focusedDay !== null ? (
            <div className="bg-accent-soft mx-[18px] mt-3 flex items-center gap-2 rounded-[16px] px-4 py-3">
              <span className="text-accent min-w-0 flex-1 text-[12.5px] font-extrabold">
                {pomoText("ui.only")}
                {formatDayLabel(focusedDay, today)}
                {pomoText("ui.sessions2")}
              </span>
              <button
                type="button"
                onClick={() => setFocusedDay(null)}
                className="text-accent flex-none text-[12px] font-extrabold underline"
              >
                {pomoText("ui.viewFullWeek")}
              </button>
            </div>
          ) : null}

          {/* 周条形图 */}
          <section className="rounded-card bg-surface shadow-card mx-[18px] mt-3 p-4">
            <div className="mb-3 flex items-center">
              <button
                type="button"
                aria-label={pomoText("ui.previousWeek")}
                onClick={() => changeWeek(-1)}
                className="text-ink-3 active:bg-press grid h-8 w-8 place-items-center rounded-full"
              >
                <ChevronLeft size={17} />
              </button>
              <div className="min-w-0 flex-1 text-center">
                <p className="text-ink-1 truncate text-[13px] font-extrabold">
                  {formatRangeLabel(weekStart)}
                </p>
                <p className="text-ink-3 mt-0.5 text-[10.5px] font-bold tabular-nums">
                  {pomoText("ui.totalFocus")} {formatFocusDuration(weekFocusMs)}
                </p>
              </div>
              <button
                type="button"
                aria-label={pomoText("ui.nextWeek")}
                disabled={weekOffset >= 0}
                onClick={() => changeWeek(1)}
                className={`text-ink-3 active:bg-press grid h-8 w-8 place-items-center rounded-full ${
                  weekOffset >= 0 ? "opacity-30" : ""
                }`}
              >
                <ChevronRight size={17} />
              </button>
            </div>

            <div className="flex h-[92px] items-end gap-2.5">
              {WEEKDAYS.map((label, index) => {
                const day = daily[index];
                const focusMs = day?.focusMs ?? 0;
                // 聚焦日优先强调：进入时焦点落在被查看的那天，而非一律今天
                const isToday = weekOffset === 0 && index === weekdayIndex(new Date());
                const emphasized =
                  focusedDay === null ? isToday : weekStart + index * DAY_MS === focusedDay;
                const height = focusMs > 0 ? Math.max(10, (focusMs / maxDayFocus) * 100) : 4;
                return (
                  <div
                    key={label}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                  >
                    <span className="text-ink-3 text-[9px] font-extrabold tabular-nums">
                      {focusMs > 0 ? Math.round(focusMs / 60_000) : ""}
                    </span>
                    <span
                      className="w-full rounded-t-[7px]"
                      style={{
                        height: `${height}%`,
                        background: focusMs > 0 ? "var(--tau-accent)" : "var(--tau-bg-page)",
                        boxShadow: emphasized && focusMs > 0 ? "var(--tau-shadow-lift)" : undefined,
                      }}
                    />
                    <span
                      className={`text-[9.5px] font-extrabold ${emphasized ? "" : "text-ink-3"}`}
                      style={emphasized ? { color: "var(--tau-accent)" } : undefined}
                    >
                      {new Intl.DateTimeFormat(getPomodoroLocale(), { weekday: "short" }).format(
                        new Date(2023, 0, 2 + label)
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 该周会话按日分组 */}
          {sessionsQuery.isLoading ? (
            <p className="text-ink-3 px-4 py-8 text-center text-sm">
              {pomoText("ui.loadingHistory")}
            </p>
          ) : visibleGroups.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-ink-2 text-[13px] font-semibold">
                {focusedDay !== null
                  ? pomoText("ui.noFocusRecordsForThisDay")
                  : pomoText("ui.noFocusRecordsForThisWeek")}
              </p>
              <p className="text-ink-3 mt-1 text-[11.5px]">
                {pomoText("ui.startASessionFromTheFocusPage")}
              </p>
            </div>
          ) : (
            visibleGroups.map(group => {
              const groupFocusMs = group.items.reduce((sum, s) => sum + s.focusMs, 0);
              return (
                <section key={group.dayStart}>
                  <div className="mt-5 mb-2 flex items-center gap-2 px-[19px]">
                    <h3 className="text-ink-3 text-[11.5px] font-extrabold">
                      {formatDayLabel(group.dayStart, today)}
                    </h3>
                    <span className="text-ink-3 text-[11px] font-bold tabular-nums">
                      ·{" "}
                      {pomoText("stats.group", {
                        count: pomoValue(group.items.length),
                        duration: formatFocusDuration(groupFocusMs),
                      })}
                    </span>
                  </div>
                  <div className="list-group mx-[18px]">
                    {group.items.map(session => (
                      <div
                        key={session.id}
                        className="border-line-1 flex items-center gap-3 border-b border-dashed px-3.5 py-3 last:border-b-0"
                      >
                        <span
                          className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
                          style={{
                            background:
                              session.status === "completed"
                                ? "var(--tau-tag-1)"
                                : "var(--tau-tag-4)",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-ink-1 flex items-center gap-1.5 text-[13px] font-extrabold">
                            <span className="truncate">{presetNameOf(presets, session)}</span>
                            {session.status !== "completed" ? (
                              <span className="bg-tag-4-soft text-tag-4 rounded-full px-1.5 py-0.5 text-[9.5px] leading-none font-bold">
                                {pomoText("ui.endedEarly")}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-ink-3 mt-0.5 text-[10.5px] font-semibold tabular-nums">
                            {formatTimeOfDay(session.startTime)} –{" "}
                            {formatTimeOfDay(session.endTime ?? session.startTime)}
                            {session.pauseCount > 0
                              ? pomoText("status.pausesSuffix", {
                                  count: pomoValue(session.pauseCount),
                                })
                              : ""}
                          </p>
                        </div>
                        <span className="text-accent shrink-0 text-[13px] font-extrabold tabular-nums">
                          {formatFocusDuration(session.focusMs)}
                        </span>
                        <button
                          type="button"
                          aria-label={pomoText("ui.moreActions")}
                          onClick={() => setMoreSession(session)}
                          className="text-ink-3 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>

      <ActionSheet
        open={moreSession != null}
        title={moreSession ? presetNameOf(presets, moreSession) : undefined}
        kind={pomoText("ui.records")}
        items={moreSession ? moreItems(moreSession) : []}
        onClose={() => setMoreSession(null)}
      />

      {/* 修正专注时长 */}
      <BottomSheet
        open={editSession != null}
        title={pomoText("ui.correctFocusDuration")}
        onClose={() => setEditSession(null)}
      >
        <div className="flex items-center gap-3 pb-1">
          <button
            type="button"
            aria-label={pomoText("ui.subtract5Minutes")}
            onClick={() => setEditMinutes(value => Math.max(1, value - 5))}
            className="bg-page text-ink-1 grid h-11 w-11 place-items-center rounded-[15px] text-xl font-black"
          >
            −
          </button>
          <span className="text-ink-1 flex-1 text-center text-[21px] font-extrabold tabular-nums">
            {editMinutes}
            <em className="text-ink-3 ml-1 text-[12px] font-bold not-italic">
              {pomoText("unit.minutes")}
            </em>
          </span>
          <button
            type="button"
            aria-label={pomoText("ui.add5Minutes")}
            onClick={() => setEditMinutes(value => Math.min(600, value + 5))}
            className="bg-page text-ink-1 grid h-11 w-11 place-items-center rounded-[15px] text-xl font-black"
          >
            ＋
          </button>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveFocusEdit()}
          className="shadow-lift text-ink-inverse mt-3 w-full rounded-[17px] py-[15px] text-[15px] font-extrabold disabled:opacity-50"
          style={{ background: "var(--tau-accent)" }}
        >
          {saving ? pomoText("ui.saving") : pomoText("ui.save")}
        </button>
      </BottomSheet>

      <MobileConfirmDialog
        open={deleteSession != null}
        title={pomoText("ui.deleteRecord")}
        description={pomoText("ui.deleteThisFocusRecordStatisticsWillBeUpdated")}
        confirmText={pomoText("ui.delete")}
        danger
        onCancel={() => setDeleteSession(null)}
        onConfirm={() => {
          const target = deleteSession;
          setDeleteSession(null);
          if (!target) return;
          void (async () => {
            try {
              await tauri.pomodoroDeleteSession(target.id);
              invalidatePomodoroQueries();
              toast.success(pomoText("ui.recordDeleted"));
            } catch (error) {
              onError(error, pomoText("ui.couldNotDeleteRecord"));
            }
          })();
        }}
      />
    </div>
  );
}
