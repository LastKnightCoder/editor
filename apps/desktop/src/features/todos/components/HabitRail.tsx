import { todosTranslator, todosNumber, todosCount, useTodosI18n } from "@/features/todos/i18n";
import { dayWord, weekday, monthDay } from "@/utils/date-format";
/**
 * 今日概览：今日打卡 / 本周负荷 / 最近完成，三段靠留白分组；承载在 TodayDrawer 里。
 */

import type { ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { cn } from "@tau/ui";
import {
  DAY_MS,
  doneToday,
  hm,
  isScheduledOn,
  occurrenceState,
  scheduledToday,
  startOfWeek,
  streakOf,
  dayDiff,
} from "../model";
import type { TodoEntry } from "../types";
import { CELL_CLASS, CELL_TITLE } from "./habitCellStyle";
import { TodoCheck } from "./TodoBits";
const t = todosTranslator.t;

export function HabitRail({
  roots,
  completed,
  now,
  selectedId,
  onOpen,
  onToggleHabit,
  onJump,
}: {
  roots: TodoEntry[];
  /** 全部已完成的一次性任务（含子任务），用于「最近完成」 */
  completed: TodoEntry[];
  now: number;
  selectedId: number | null;
  onOpen(entry: TodoEntry): void;
  onToggleHabit(entry: TodoEntry): void;
  /** 点击本周负荷某天：滚动议程到对应分段（dayOffset 相对今天） */
  onJump(dayOffset: number): void;
}) {
  const { locale } = useTodosI18n();
  const habits = roots.filter(e => e.type === "recurring" && e.recurrence);
  const today = habits.filter(e => scheduledToday(e, now));
  const resting = habits.filter(e => !scheduledToday(e, now));
  const doneCount = today.filter(e => doneToday(e, now)).length;

  const monday = startOfWeek(now);
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = monday + i * DAY_MS;
    const offset = dayDiff(day, now);
    const deadline = roots.filter(
      e => e.type === "deadline" && e.dueAt != null && dayDiff(e.dueAt, day) === 0
    ).length;
    const recurring = habits.filter(
      e => e.recurrence != null && isScheduledOn(e.recurrence, day)
    ).length;
    return { day, offset, deadline, recurring };
  });
  const max = Math.max(1, ...week.map(d => d.deadline + d.recurring));
  const recent = [...completed]
    .flatMap(e => (e.completedAt != null ? [{ entry: e, completedAt: e.completedAt }] : []))
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, 5);

  const C = 2 * Math.PI * 9;
  const frac = today.length ? doneCount / today.length : 0;

  return (
    <div className="flex min-w-0 flex-col pt-2 pr-3 pl-[18px]">
      <Block
        title={
          <>
            <svg viewBox="0 0 22 22" className="size-[22px] shrink-0" aria-hidden>
              <circle
                cx="11"
                cy="11"
                r="9"
                className="fill-none stroke-[var(--tau-bg-track)]"
                strokeWidth={3}
              />
              <circle
                cx="11"
                cy="11"
                r="9"
                className="ease-tau-out fill-none stroke-[var(--tau-ok)] transition-[stroke-dashoffset] duration-300"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - frac)}
                transform="rotate(-90 11 11)"
              />
            </svg>
            {t("habit.today")}
          </>
        }
        meta={`${todosNumber(doneCount)}/${todosNumber(today.length)}`}
      >
        {today.length === 0 && <p className="text-ink-3 py-1 text-[12px]">{t("habit.noToday")}</p>}
        {today.map(entry => (
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(entry)}
            onKeyDown={e => {
              if (e.target === e.currentTarget && e.key === "Enter") onOpen(entry);
            }}
            className={cn(
              "-mx-1.5 grid cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[9px] p-1.5 outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
              selectedId === entry.id ? "bg-selected" : "hover:bg-hover"
            )}
          >
            <TodoCheck
              checked={doneToday(entry, now)}
              recurring
              label={t("habit.today")}
              onToggle={() => onToggleHabit(entry)}
            />
            <span className="min-w-0">
              <span className="text-tau-meta block truncate">{entry.title}</span>
              <span className="text-ink-3 text-[11px] tabular-nums">
                {todosCount("count.streak", streakOf(entry, now))}
              </span>
            </span>
            <WeekDots entry={entry} now={now} />
          </div>
        ))}
        {resting.length > 0 && (
          <p className="text-ink-3 min-w-0 pt-1.5 text-[11.5px] break-words">
            {t("habit.resting", {
              titles: new Intl.ListFormat(locale).format(resting.map(entry => entry.title)),
            })}
          </p>
        )}
      </Block>

      <Block
        title={t("habit.weekLoad")}
        meta={`${monthDay(monday, locale)} – ${monthDay(monday + 6 * DAY_MS, locale)}`}
      >
        <div className="grid h-[92px] grid-cols-7 items-end gap-1.5 pt-1">
          {week.map(d => {
            const total = d.deadline + d.recurring;
            const unit = 58 / max;
            return (
              <button
                key={d.day}
                type="button"
                title={t("habit.load", {
                  weekday: weekday(d.day, locale),
                  deadline: todosNumber(d.deadline),
                  recurring: todosNumber(d.recurring),
                })}
                onClick={() => onJump(d.offset)}
                className="ease-tau-out hover:bg-hover flex h-full flex-col items-center justify-end gap-1 rounded-[8px] py-0.5 transition-[background-color] duration-150"
              >
                <span className="text-ink-2 text-[11px] tabular-nums">
                  {total ? todosNumber(total) : ""}
                </span>
                <span
                  className="bg-track flex w-4 flex-col-reverse overflow-hidden rounded-[5px]"
                  style={{ height: Math.max(4, total * unit) }}
                >
                  {d.deadline > 0 && (
                    <i className="bg-warn block" style={{ height: d.deadline * unit }} />
                  )}
                  {d.recurring > 0 && (
                    <i className="bg-ok block opacity-80" style={{ height: d.recurring * unit }} />
                  )}
                </span>
                <span
                  className={cn(
                    "text-[11px]",
                    d.offset === 0 ? "text-accent-text font-semibold" : "text-ink-3"
                  )}
                >
                  {d.offset === 0
                    ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "day")
                    : weekday(d.day, locale, "narrow")}
                </span>
              </button>
            );
          })}
        </div>
        <div className="text-ink-3 mt-2 flex gap-3 text-[11px]">
          <Legend className="bg-warn">{t("kind.deadline")}</Legend>
          <Legend className="bg-ok">{t("agenda.checkIn")}</Legend>
        </div>
      </Block>

      <Block title={t("habit.recent")}>
        {recent.length === 0 && (
          <p className="text-ink-3 py-1 text-[12px]">{t("habit.noRecent")}</p>
        )}
        {recent.map(({ entry, completedAt }) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onOpen(entry)}
            className="hover:bg-hover grid min-h-8 w-full min-w-0 grid-cols-[13px_minmax(0,1fr)_auto] items-center gap-2 rounded-[8px] px-1.5 text-left"
          >
            <CircleCheck className="text-ok size-[13px] shrink-0" strokeWidth={1.75} />
            <span className="text-ink-2 text-tau-meta min-w-0 flex-1 truncate">{entry.title}</span>
            <span className="text-ink-3 text-[11px] whitespace-nowrap tabular-nums">
              {dayWord(completedAt, now, locale)} {hm(completedAt)}
            </span>
          </button>
        ))}
      </Block>
    </div>
  );
}

/** 本周一 → 周日 7 个打卡点 */
export function WeekDots({ entry, now }: { entry: TodoEntry; now: number }) {
  useTodosI18n();
  const monday = startOfWeek(now);
  return (
    <span className="flex gap-[3px]" title={t("habit.weekHint")}>
      {Array.from({ length: 7 }, (_, i) => {
        const day = monday + i * DAY_MS;
        const state = occurrenceState(entry, day, now);
        return (
          <i
            key={i}
            title={CELL_TITLE[state]}
            className={cn("block size-[9px] rounded-[3px]", CELL_CLASS[state])}
          />
        );
      })}
    </span>
  );
}

function Block({
  title,
  meta,
  children,
}: {
  title: ReactNode;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="pb-[26px]">
      <header className="mb-2 flex items-center gap-2">
        <span className="text-tau-body-lg flex items-center gap-2 font-semibold">{title}</span>
        {meta && <span className="text-ink-3 ml-auto text-[11.5px] tabular-nums">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

function Legend({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <i className={cn("inline-block size-[7px] rounded-[2px]", className)} />
      {children}
    </span>
  );
}
