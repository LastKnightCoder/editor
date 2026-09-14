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
  presetNameOf,
  usePomodoroPresets,
  usePomodoroSessions,
  usePomodoroWeeklySummary,
} from "./queries";
import { DAY_MS, formatFocusDuration, startOfDay, startOfWeek, weekdayIndex } from "./timer";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const WEEK_LIMIT = 100;

function formatDayLabel(dayStart: number, today: number): string {
  if (dayStart === today) return "今天";
  if (dayStart === today - DAY_MS) return "昨天";
  const date = new Date(dayStart);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function formatRangeLabel(weekStart: number): string {
  const first = new Date(weekStart);
  const last = new Date(weekStart + 6 * DAY_MS);
  const sameMonth = first.getMonth() === last.getMonth();
  const md = (d: Date) => `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return sameMonth
    ? `${first.getMonth() + 1} 月 ${first.getDate()} – ${last.getDate()} 日`
    : `${md(first)} – ${md(last)}`;
}

function formatTimeOfDay(ts: number): string {
  const date = new Date(ts);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

type PomodoroHistoryPageProps = {
  onBack: () => void;
  onError: (error: unknown, fallback: string) => void;
};

export function PomodoroHistoryPage({ onBack, onError }: PomodoroHistoryPageProps) {
  const listScrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(listScrollRef);

  const [weekOffset, setWeekOffset] = useState(0);
  const today = useMemo(() => startOfDay(new Date()), []);
  const weekStart = useMemo(() => startOfWeek(weekOffset), [weekOffset]);
  const weekEnd = weekStart + 7 * DAY_MS - 1;

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

  const moreItems = (session: PomodoroSession): ActionSheetItem[] => [
    {
      label: "修正专注时长",
      icon: <Pencil size={16} />,
      onClick: () => {
        setMoreSession(null);
        setEditMinutes(Math.max(1, Math.round(session.focusMs / 60_000)));
        setEditSession(session);
      },
    },
    {
      label: "删除记录",
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
      toast.success("已修正专注时长");
      setEditSession(null);
    } catch (error) {
      onError(error, "修正专注时长失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
      <PageHeader title="专注记录" onBack={onBack} />

      {/* 二级页无吸底 Dock，底部只留常规呼吸空间（同番茄钟主页/详情页）：
          留白挂外层容器，滚动容器自身不带 padding，内容不会顶到安全区 */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ paddingBottom: "var(--page-bottom-inset)" }}
      >
        <div
          ref={listScrollRef}
          className="edge-fade-scroll flex-1 overflow-y-auto overscroll-contain"
        >
          {/* 周条形图 */}
          <section className="rounded-card bg-surface shadow-card mx-[18px] mt-3 p-4">
            <div className="mb-3 flex items-center">
              <button
                type="button"
                aria-label="上一周"
                onClick={() => setWeekOffset(value => value - 1)}
                className="text-ink-3 active:bg-ghost-press grid h-8 w-8 place-items-center rounded-full"
              >
                <ChevronLeft size={17} />
              </button>
              <div className="min-w-0 flex-1 text-center">
                <p className="text-ink truncate text-[13px] font-extrabold">
                  {formatRangeLabel(weekStart)}
                </p>
                <p className="text-ink-3 mt-0.5 text-[10.5px] font-bold tabular-nums">
                  共专注 {formatFocusDuration(weekFocusMs)}
                </p>
              </div>
              <button
                type="button"
                aria-label="下一周"
                disabled={weekOffset >= 0}
                onClick={() => setWeekOffset(value => Math.min(0, value + 1))}
                className={`text-ink-3 active:bg-ghost-press grid h-8 w-8 place-items-center rounded-full ${
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
                const isToday = weekOffset === 0 && index === weekdayIndex(new Date());
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
                        background: focusMs > 0 ? "var(--brand-grad)" : "var(--bg-input)",
                        boxShadow: isToday && focusMs > 0 ? "var(--shadow-accent)" : undefined,
                      }}
                    />
                    <span
                      className={`text-[9.5px] font-extrabold ${isToday ? "" : "text-ink-3"}`}
                      style={isToday ? { color: "var(--brand)" } : undefined}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 该周会话按日分组 */}
          {sessionsQuery.isLoading ? (
            <p className="text-ink-3 px-4 py-8 text-center text-sm">正在加载记录...</p>
          ) : grouped.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-ink-2 text-[13px] font-semibold">这一周还没有专注记录</p>
              <p className="text-ink-3 mt-1 text-[11.5px]">回番茄主页开始一次专注吧</p>
            </div>
          ) : (
            grouped.map(group => {
              const groupFocusMs = group.items.reduce((sum, s) => sum + s.focusMs, 0);
              return (
                <section key={group.dayStart}>
                  <div className="mb-2 mt-5 flex items-center gap-2 px-[19px]">
                    <h3 className="text-ink-3 text-[11.5px] font-extrabold">
                      {formatDayLabel(group.dayStart, today)}
                    </h3>
                    <span className="text-ink-3 text-[11px] font-bold tabular-nums">
                      · {group.items.length} 次 · {formatFocusDuration(groupFocusMs)}
                    </span>
                  </div>
                  <div className="list-group mx-[18px]">
                    {group.items.map(session => (
                      <div
                        key={session.id}
                        className="border-line flex items-center gap-3 border-b border-dashed px-3.5 py-3 last:border-b-0"
                      >
                        <span
                          className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
                          style={{
                            background:
                              session.status === "completed" ? "var(--sage)" : "var(--butter)",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-ink flex items-center gap-1.5 text-[13px] font-extrabold">
                            <span className="truncate">{presetNameOf(presets, session)}</span>
                            {session.status !== "completed" ? (
                              <span className="bg-butter-soft text-butter rounded-full px-1.5 py-0.5 text-[9.5px] font-bold leading-none">
                                提前结束
                              </span>
                            ) : null}
                          </p>
                          <p className="text-ink-3 mt-0.5 text-[10.5px] font-semibold tabular-nums">
                            {formatTimeOfDay(session.startTime)} –{" "}
                            {formatTimeOfDay(session.endTime ?? session.startTime)}
                            {session.pauseCount > 0 ? ` · 暂停 ${session.pauseCount} 次` : ""}
                          </p>
                        </div>
                        <span className="text-accent shrink-0 text-[13px] font-extrabold tabular-nums">
                          {formatFocusDuration(session.focusMs)}
                        </span>
                        <button
                          type="button"
                          aria-label="更多操作"
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
        kind="记录"
        items={moreSession ? moreItems(moreSession) : []}
        onClose={() => setMoreSession(null)}
      />

      {/* 修正专注时长 */}
      <BottomSheet
        open={editSession != null}
        title="修正专注时长"
        onClose={() => setEditSession(null)}
      >
        <div className="flex items-center gap-3 pb-1">
          <button
            type="button"
            aria-label="减少 5 分钟"
            onClick={() => setEditMinutes(value => Math.max(1, value - 5))}
            className="bg-input text-ink grid h-11 w-11 place-items-center rounded-[15px] text-xl font-black"
          >
            −
          </button>
          <span className="text-ink flex-1 text-center text-[21px] font-extrabold tabular-nums">
            {editMinutes}
            <em className="text-ink-3 ml-1 text-[12px] font-bold not-italic">分钟</em>
          </span>
          <button
            type="button"
            aria-label="增加 5 分钟"
            onClick={() => setEditMinutes(value => Math.min(600, value + 5))}
            className="bg-input text-ink grid h-11 w-11 place-items-center rounded-[15px] text-xl font-black"
          >
            ＋
          </button>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveFocusEdit()}
          className="shadow-accent mt-3 w-full rounded-[17px] py-[15px] text-[15px] font-extrabold text-white disabled:opacity-50"
          style={{ background: "var(--brand-grad)" }}
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </BottomSheet>

      <MobileConfirmDialog
        open={deleteSession != null}
        title="删除记录"
        description="删除这条专注记录？统计将同步扣减。"
        confirmText="删除"
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
              toast.success("已删除记录");
            } catch (error) {
              onError(error, "删除记录失败");
            }
          })();
        }}
      />
    </div>
  );
}
