/**
 * 账本时间导航：‹ 当前范围 ▾ › + 回到今天（「全部」概览时只留范围按钮）。
 * 点当前范围打开选择面板——左列快捷项（近 N 天 / 本月 / 上个月 / 今年 / 过去一年 / 往年 / 全部），
 * 右侧月历点两次选起止（同一天点两次 = 跳到那天前后），有记录的日子带点，未来日与最早记录之前禁用。
 */

import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IconButton, Popover, cn } from "@tau/ui";
import { listPomodoroSessions } from "@/commands/pomodoro";
import { startOfDay } from "../model";
import {
  addDays,
  quickRanges,
  shiftWindow,
  windowDays,
  windowLabel,
  type DayWindow,
  type QuickKey,
} from "../range";

const WEEK_HEAD = "一二三四五六日";

export function RangeNav({
  window: win,
  quickKey,
  now,
  earliest,
  all,
  onChange,
  onPickAll,
  onJumpToDay,
  onToday,
}: {
  window: DayWindow;
  quickKey: QuickKey | null;
  now: number;
  earliest: number | null;
  /** 当前为「全部」概览 */
  all: boolean;
  onChange(window: DayWindow, key: QuickKey | null): void;
  onPickAll(): void;
  onJumpToDay(day: number): void;
  onToday(): void;
}) {
  const [open, setOpen] = useState(false);
  const today = startOfDay(now);
  const atStart = earliest != null && win.from <= earliest;

  return (
    <div className="flex flex-none items-center gap-0.5">
      {!all && (
        <IconButton
          aria-label={`往前 ${windowDays(win)} 天`}
          title={`往前 ${windowDays(win)} 天`}
          className="size-[26px]"
          disabled={atStart}
          onClick={() => onChange(shiftWindow(win, -1, now), null)}
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} />
        </IconButton>
      )}
      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="bottom-start"
        arrow={false}
        className="w-[480px] max-w-none"
        trigger={
          <button
            type="button"
            className="text-tau-meta hover:bg-hover text-ink-1 inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-lg px-2 font-medium tabular-nums"
          >
            <CalendarDays className="text-ink-2 size-[13px]" strokeWidth={1.75} />
            {all ? "全部" : windowLabel(win, quickKey, now, earliest)}
            <ChevronDown className="text-ink-3 size-3" strokeWidth={1.75} />
          </button>
        }
      >
        {open && (
          <RangePanel
            window={win}
            quickKey={quickKey}
            now={now}
            earliest={earliest}
            all={all}
            onPickAll={() => {
              setOpen(false);
              onPickAll();
            }}
            onPick={(w, key) => {
              setOpen(false);
              onChange(w, key);
            }}
            onPickDay={day => {
              setOpen(false);
              onJumpToDay(day);
            }}
          />
        )}
      </Popover>
      {!all && (
        <IconButton
          aria-label={`往后 ${windowDays(win)} 天`}
          title={`往后 ${windowDays(win)} 天`}
          className="size-[26px]"
          disabled={win.to >= today}
          onClick={() => onChange(shiftWindow(win, 1, now), null)}
        >
          <ChevronRight className="size-4" strokeWidth={1.75} />
        </IconButton>
      )}
      {!all && win.to < today && (
        <button
          type="button"
          onClick={onToday}
          className="text-accent-text hover:bg-accent-soft text-tau-sm h-[26px] whitespace-nowrap rounded-lg px-2 font-medium"
        >
          回到今天
        </button>
      )}
    </div>
  );
}

function RangePanel({
  window: win,
  quickKey,
  now,
  earliest,
  all,
  onPickAll,
  onPick,
  onPickDay,
}: {
  window: DayWindow;
  quickKey: QuickKey | null;
  now: number;
  earliest: number | null;
  all: boolean;
  onPickAll(): void;
  onPick(window: DayWindow, key: QuickKey | null): void;
  onPickDay(day: number): void;
}) {
  const today = startOfDay(now);
  const [month, setMonth] = useState(() => {
    const d = new Date(win.to);
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const [pending, setPending] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const quick = useMemo(() => quickRanges(now, earliest), [now, earliest]);

  const m = new Date(month);
  const lead = (m.getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => addDays(month, i - lead));
  // 月历打点：按当前显示的 6 周取会话（只要开始时刻）
  const dots = useQuery({
    queryKey: ["pomodoro", "sessions", "month-dots", cells[0]],
    queryFn: async () => {
      const list = await listPomodoroSessions({
        start: cells[0],
        end: addDays(cells[41], 1),
        limit: 100_000,
      });
      return new Set(list.map(s => startOfDay(s.startTime)));
    },
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const activeDays = dots.data;
  // 「全部」时月历不标当前窗口，只在选起止时预览
  const lo = pending != null ? Math.min(pending, hover ?? pending) : all ? NaN : win.from;
  const hi = pending != null ? Math.max(pending, hover ?? pending) : all ? NaN : win.to;
  const monthStep = (n: number) =>
    setMonth(new Date(m.getFullYear(), m.getMonth() + n, 1).getTime());
  const nextDisabled = new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime() > today;
  const prevDisabled = earliest != null && month <= earliest;

  const pickDay = (day: number) => {
    if (pending == null) {
      setPending(day);
      setHover(day);
      return;
    }
    if (day === pending) return onPickDay(day);
    onPick({ from: Math.min(day, pending), to: Math.max(day, pending) }, null);
  };

  return (
    <div className="grid grid-cols-[148px_minmax(0,1fr)] gap-3 p-3">
      <div className="border-line-2 -my-0.5 flex flex-col gap-px border-r pr-2.5">
        {quick.map((q, i) =>
          q === "-" ? (
            <i key={`sep-${i}`} className="bg-line-2 mx-1 my-1 h-px" />
          ) : (
            <button
              key={q.key}
              type="button"
              onClick={() => onPick(q.window, q.key)}
              className={cn(
                "text-tau-meta flex h-[30px] items-center justify-between rounded-lg px-2.5 text-left",
                !all && q.key === quickKey
                  ? "bg-selected text-accent-text font-medium"
                  : "text-ink-1 hover:bg-hover"
              )}
            >
              {q.label}
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  !all && q.key === quickKey ? "text-accent-text" : "text-ink-3"
                )}
              >
                {windowDays(q.window)} 天
              </span>
            </button>
          )
        )}
        <i className="bg-line-2 mx-1 my-1 h-px" />
        <button
          type="button"
          onClick={onPickAll}
          className={cn(
            "text-tau-meta flex h-[30px] items-center justify-between rounded-lg px-2.5 text-left",
            all ? "bg-selected text-accent-text font-medium" : "text-ink-1 hover:bg-hover"
          )}
        >
          全部
          {earliest != null && (
            <span
              className={cn("text-[11px] tabular-nums", all ? "text-accent-text" : "text-ink-3")}
            >
              {windowDays({ from: earliest, to: today })} 天
            </span>
          )}
        </button>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1">
          <IconButton
            aria-label="上个月"
            className="size-7"
            disabled={prevDisabled}
            onClick={() => monthStep(-1)}
          >
            <ChevronLeft className="size-4" strokeWidth={1.75} />
          </IconButton>
          <b className="text-tau-body flex-1 text-center font-semibold tabular-nums">
            {m.getFullYear()}年{m.getMonth() + 1}月
          </b>
          <IconButton
            aria-label="下个月"
            className="size-7"
            disabled={nextDisabled}
            onClick={() => monthStep(1)}
          >
            <ChevronRight className="size-4" strokeWidth={1.75} />
          </IconButton>
        </div>
        <div
          className="grid grid-cols-7 gap-0.5"
          onMouseLeave={() => pending != null && setHover(pending)}
        >
          {[...WEEK_HEAD].map(w => (
            <span key={w} className="text-ink-3 h-[22px] text-center text-[11px] leading-[22px]">
              {w}
            </span>
          ))}
          {cells.map(day => {
            const d = new Date(day);
            const disabled = day > today || (earliest != null && day < earliest);
            const edge = day === lo || day === hi;
            const inside = day > lo && day < hi;
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => pickDay(day)}
                onMouseEnter={() => pending != null && !disabled && setHover(day)}
                className={cn(
                  "text-tau-meta relative h-8 rounded-lg tabular-nums",
                  d.getMonth() !== m.getMonth() ? "text-ink-3" : "text-ink-1",
                  edge && "bg-accent text-ink-inverse font-semibold",
                  inside && "bg-selected rounded-none",
                  !edge && !inside && "enabled:hover:bg-hover",
                  "disabled:opacity-40"
                )}
              >
                {d.getDate()}
                {activeDays?.has(day) && (
                  <i
                    aria-hidden
                    className={cn(
                      "absolute bottom-1 left-1/2 -ml-0.5 size-1 rounded-full",
                      edge ? "bg-ink-inverse" : "bg-accent"
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-ink-3 mt-2.5 text-[12px]">
          {pending != null
            ? `起点 ${new Date(pending).getMonth() + 1}月${new Date(pending).getDate()}日，再点选终点（点同一天 = 跳到那天）`
            : "点两次选起止 · 带点 = 有记录"}
        </p>
      </div>
    </div>
  );
}
