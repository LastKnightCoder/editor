/**
 * 「全部」概览：累计数字 → 按自然年的热力格（新年在上，区内滚动）→ 首条记录以来的单色月度柱。
 * 点格子跳到那天所在的账本；点年份 / 月份标签 / 月度柱打开那段时间的账本。
 * highlight 非空时热力格与月度柱只统计该预设。
 */

import { useMemo, useState } from "react";
import { cn, useEdgeFade } from "@tau/ui";
import type { PomodoroPreset, PomodoroSession } from "@/types";
import { HOUR_MS, MINUTE_MS, formatDuration, startOfDay, weekdayLabel } from "../model";
import { addDays, monthWindow, type DayWindow, type QuickKey } from "../range";
import { DELETED_PRESET_NAME } from "./presetTone";

const LEVEL = [
  "bg-track",
  "bg-[color-mix(in_srgb,var(--tau-accent)_28%,var(--tau-bg-track))]",
  "bg-[color-mix(in_srgb,var(--tau-accent)_50%,var(--tau-bg-track))]",
  "bg-[color-mix(in_srgb,var(--tau-accent)_74%,var(--tau-bg-track))]",
  "bg-accent",
];
const levelOf = (ms: number) =>
  ms <= 0 ? 0 : ms < 30 * MINUTE_MS ? 1 : ms < 60 * MINUTE_MS ? 2 : ms < 120 * MINUTE_MS ? 3 : 4;
const WEEKDAY_LABELS = ["一", "", "三", "", "五", "", "日"];

interface DayStat {
  ms: number;
  count: number;
}

export function AllOverview({
  sessions,
  now,
  presetsById,
  highlight,
  selectedDay,
  onJumpToDay,
  onOpenWindow,
}: {
  sessions: PomodoroSession[];
  now: number;
  presetsById: Map<number, PomodoroPreset>;
  highlight: number | null;
  selectedDay: number;
  onJumpToDay(day: number): void;
  onOpenWindow(window: DayWindow, key: QuickKey | null): void;
}) {
  const [yearsEl, setYearsEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(yearsEl);
  const today = startOfDay(now);
  const thisYear = new Date(now).getFullYear();

  const data = useMemo(() => {
    const list = highlight == null ? sessions : sessions.filter(s => s.presetId === highlight);
    const byDay = new Map<number, DayStat>();
    for (const s of list) {
      const day = startOfDay(s.startTime);
      const stat = byDay.get(day) ?? { ms: 0, count: 0 };
      stat.ms += s.focusMs;
      stat.count++;
      byDay.set(day, stat);
    }
    const total = list.reduce((acc, s) => acc + s.focusMs, 0);
    const first = list.length ? Math.min(...byDay.keys()) : today;
    let best = 0;
    let run = 0;
    for (let d = first; d <= today; d = addDays(d, 1)) {
      run = byDay.has(d) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    const months: { year: number; month: number; ms: number }[] = [];
    const firstDate = new Date(first);
    for (
      let cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
      cursor.getTime() <= now;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    ) {
      const start = cursor.getTime();
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime();
      let ms = 0;
      for (const [day, stat] of byDay) if (day >= start && day < end) ms += stat.ms;
      months.push({ year: cursor.getFullYear(), month: cursor.getMonth(), ms });
    }
    return { list, byDay, total, best, months, firstYear: firstDate.getFullYear() };
  }, [sessions, highlight, today, now]);

  const bestMonth = data.months.reduce((a, m) => (m.ms > a.ms ? m : a), data.months[0]);
  const monthMax = Math.max(HOUR_MS, ...data.months.map(m => m.ms));
  const years: number[] = [];
  for (let y = thisYear; y >= data.firstYear; y--) years.push(y);
  const highlightName =
    highlight != null ? (presetsById.get(highlight)?.name ?? DELETED_PRESET_NAME) : null;

  if (data.list.length === 0)
    return (
      <div className="text-ink-2 text-tau-meta flex flex-1 items-center justify-center pb-10">
        {highlightName
          ? `「${highlightName}」还没有专注记录`
          : "还没有专注记录，完成第一个番茄后这里会出现全年热力格"}
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col pr-3">
      <div className="mt-1 flex flex-none gap-[30px]">
        <Figure value={`${Math.round(data.total / HOUR_MS)} 小时`} label="累计专注" />
        <Figure value={String(data.byDay.size)} label="有专注的天" />
        <Figure value={String(data.best)} label="最长连续（天）" />
        <Figure
          value={formatDuration(data.total / Math.max(1, data.byDay.size))}
          label="专注日日均"
        />
        {bestMonth && bestMonth.ms > 0 && (
          <Figure
            value={`${bestMonth.year !== thisYear ? `${bestMonth.year}.` : ""}${bestMonth.month + 1}月`}
            label={`最投入的月份 · ${formatDuration(bestMonth.ms)}`}
          />
        )}
      </div>

      <div
        ref={setYearsEl}
        className="edge-fade-scroll mt-3 min-h-[172px] flex-[0_1_auto] overflow-y-auto pr-0.5"
      >
        {years.map(year => (
          <YearHeatmap
            key={year}
            year={year}
            today={today}
            byDay={data.byDay}
            selectedDay={selectedDay}
            onJumpToDay={onJumpToDay}
            onOpenYear={() => {
              const from = new Date(year, 0, 1).getTime();
              const to = Math.min(today, new Date(year, 11, 31).getTime());
              onOpenWindow({ from, to }, year === thisYear ? "thisYear" : `year-${year}`);
            }}
            onOpenMonth={month => onOpenWindow(monthWindow(year, month, now), null)}
          />
        ))}
        <div className="text-ink-3 mt-2 flex items-center justify-end gap-1 text-[11px]">
          少
          {LEVEL.map(tone => (
            <i key={tone} className={cn("size-[11px] rounded-[3px]", tone)} />
          ))}
          多（30 分 / 1 时 / 2 时）
        </div>
      </div>

      <div className="text-ink-3 mt-3.5 flex flex-none items-baseline gap-2 text-[12px]">
        <b className="text-ink-1 text-tau-body font-semibold">按月</b>
        {highlightName ? `只看「${highlightName}」 · ` : ""}点月份看那个月
      </div>
      <div
        className="mt-2 grid min-h-[84px] flex-1 items-end gap-1"
        style={{ gridTemplateColumns: `repeat(${data.months.length}, minmax(0, 1fr))` }}
      >
        {data.months.map((m, i) => {
          const current = i === data.months.length - 1;
          return (
            <button
              key={`${m.year}-${m.month}`}
              type="button"
              title={`${m.year}年${m.month + 1}月 · ${formatDuration(m.ms)}`}
              onClick={() => onOpenWindow(monthWindow(m.year, m.month, now), null)}
              className="group/bar hover:bg-hover flex h-full flex-col justify-end gap-1 rounded-lg px-1 pt-1"
            >
              <span className="text-ink-2 text-center text-[11px] tabular-nums">
                {m.ms ? `${Math.round(m.ms / HOUR_MS)}h` : "—"}
              </span>
              <span
                className={cn(
                  "min-h-0.5 rounded",
                  current
                    ? "bg-accent"
                    : "group-hover/bar:bg-accent bg-[color-mix(in_srgb,var(--tau-accent)_42%,var(--tau-bg-track))]"
                )}
                style={{ height: m.ms ? `${Math.max(3, (m.ms / monthMax) * 74)}%` : undefined }}
              />
              <span
                className={cn(
                  "pb-1 text-center text-[11.5px]",
                  current ? "text-accent-text font-semibold" : "text-ink-3"
                )}
              >
                {(m.month === 0 || i === 0) && (
                  <em className="text-ink-3 mr-px text-[10px] not-italic">
                    {String(m.year).slice(2)}
                  </em>
                )}
                {m.month + 1}月
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-ink-3 text-[12px]">
      <b className="text-ink-1 block text-[17px] font-semibold tabular-nums">{value}</b>
      {label}
    </div>
  );
}

function YearHeatmap({
  year,
  today,
  byDay,
  selectedDay,
  onJumpToDay,
  onOpenYear,
  onOpenMonth,
}: {
  year: number;
  today: number;
  byDay: Map<number, DayStat>;
  selectedDay: number;
  onJumpToDay(day: number): void;
  onOpenYear(): void;
  onOpenMonth(month: number): void;
}) {
  const jan1 = new Date(year, 0, 1).getTime();
  const gridStart = addDays(jan1, -((new Date(jan1).getDay() + 6) % 7));
  let yearMs = 0;
  let yearDays = 0;
  const cells: { day: number; outside: boolean; stat?: DayStat }[] = [];
  const monthCols: { month: number; col: number }[] = [];
  for (let col = 0; col < 54; col++) {
    const colStart = addDays(gridStart, col * 7);
    if (new Date(colStart).getFullYear() > year) break;
    const month = new Date(colStart).getFullYear() < year ? 0 : new Date(colStart).getMonth();
    if (!monthCols.length || monthCols[monthCols.length - 1].month !== month)
      monthCols.push({ month, col });
    for (let row = 0; row < 7; row++) {
      const day = addDays(colStart, row);
      const outside = new Date(day).getFullYear() !== year || day > today;
      const stat = outside ? undefined : byDay.get(day);
      if (stat) {
        yearMs += stat.ms;
        yearDays++;
      }
      cells.push({ day, outside, stat });
    }
  }
  const columns = Math.ceil(cells.length / 7);

  return (
    <section className="[&+&]:mt-3.5">
      <button
        type="button"
        onClick={onOpenYear}
        className="hover:bg-hover -ml-1.5 inline-flex h-6 items-baseline gap-2 rounded-[7px] px-1.5"
      >
        <b className="text-tau-body font-semibold tabular-nums">{year}</b>
        <span className="text-ink-3 text-[12px] tabular-nums">
          {yearDays} 天 · {Math.round(yearMs / HOUR_MS)} 小时
        </span>
      </button>
      <div className="mt-1 grid grid-cols-[22px_minmax(0,1fr)] gap-x-1.5">
        <div
          className="col-start-2 grid h-[18px] gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {monthCols.map(({ month, col }) => (
            <button
              key={month}
              type="button"
              onClick={() => onOpenMonth(month)}
              className="text-ink-3 hover:bg-accent-soft hover:text-accent-text -ml-0.5 whitespace-nowrap rounded px-0.5 text-left text-[11px]"
              style={{ gridColumn: col + 1 }}
            >
              {month + 1}月
            </button>
          ))}
        </div>
        <div className="text-ink-3 grid grid-rows-7 gap-[3px] text-[10.5px]">
          {WEEKDAY_LABELS.map((w, i) => (
            <span key={i} className="flex items-center">
              {w}
            </span>
          ))}
        </div>
        <div
          className="grid grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {cells.map(({ day, outside, stat }) =>
            outside ? (
              <i key={day} aria-hidden className="aspect-square" />
            ) : (
              <button
                key={day}
                type="button"
                title={`${new Date(day).getMonth() + 1}月${new Date(day).getDate()}日 ${weekdayLabel(day)} · ${stat ? `${stat.count} 个 · ${formatDuration(stat.ms)}` : "无记录"}`}
                onClick={() => onJumpToDay(day)}
                className={cn(
                  "aspect-square rounded-[3px] transition-transform duration-100 hover:scale-125",
                  LEVEL[levelOf(stat?.ms ?? 0)],
                  day === today && "ring-ink-1 ring-[1.5px] ring-inset",
                  day === selectedDay && "ring-ink-1 ring-offset-surface ring-[1.5px] ring-offset-2"
                )}
              />
            )
          )}
        </div>
      </div>
    </section>
  );
}
