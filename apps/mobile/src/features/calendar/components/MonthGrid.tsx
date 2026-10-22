// 月历网格（定稿 D 交互 + A 视觉）：周一起始、固定 6 行、今天品牌实底圆、选中品牌浅底圆环、
// 事件彩点 ≤3 超出「·N」；折叠态仅保留选中周行（week-only，把手动画由外层承载）。
// 两个高亮圆都画在数字盒（26px）之外一圈 36px：数字盒固定尺寸才能保证各周行高一致。
// 格高 62、彩点 mt-8 都跟着 36px 圆走，改圆径必须同步这三个值（外层折叠 max-height 亦然）。

import { memo } from "react";
import type { CalendarEvent } from "../types";
import { eventDotsForDay, eventOccursOnDay, getMonthGrid, getWeekStart } from "../utils";

type MonthGridProps = {
  anchorDate: number;
  selectedDate: number;
  /** 今天（本地 0 点）由父层传入：memo 组件不因跨天自行重渲染 */
  today: number;
  events: CalendarEvent[];
  expanded: boolean;
  resolveColor: (event: CalendarEvent) => string;
  onSelectDate: (date: number) => void;
};

const WEEKDAY_HEADERS = ["一", "二", "三", "四", "五", "六", "日"];
const DAY_MS = 24 * 60 * 60 * 1000;

function MonthGridImpl({
  anchorDate,
  selectedDate,
  today,
  events,
  expanded,
  resolveColor,
  onSelectDate,
}: MonthGridProps) {
  const cells = getMonthGrid(anchorDate);
  // 折叠态只渲染选中周行；selectedDate 不在当前网格（翻月后）时按周起始差定位并夹回网格，
  // 避免 findIndex = -1 折叠出空白
  const foundIndex = cells.findIndex(cell => cell.date === selectedDate);
  const selectedWeekIndex =
    foundIndex >= 0
      ? Math.floor(foundIndex / 7)
      : Math.min(
          5,
          Math.max(0, Math.round((getWeekStart(selectedDate) - cells[0].date) / (7 * DAY_MS)))
        );
  const visibleWeeks = expanded
    ? cells
    : cells.filter((_, index) => Math.floor(index / 7) === selectedWeekIndex);

  return (
    <div id="calendar-month-grid" className="select-none px-3">
      <div className="grid grid-cols-7">
        {WEEKDAY_HEADERS.map((label, index) => (
          <span
            key={label}
            className={`text-ink-3 py-[6px] pb-2 text-center text-[11.5px] font-bold ${
              index >= 5 ? "opacity-75" : ""
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {visibleWeeks.map(cell => {
          const isToday = cell.date === today;
          const isSelected = cell.date === selectedDate;
          const dayEvents = events.filter(event => eventOccursOnDay(event, cell.date));
          const timedCount = dayEvents.filter(event => !event.allDay).length;
          const dots = eventDotsForDay(events, cell.date, resolveColor);
          const moreCount = timedCount - dots.length;
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onSelectDate(cell.date)}
              aria-label={`${cell.dayOfMonth}日`}
              aria-pressed={isSelected}
              className="flex h-[62px] cursor-pointer flex-col items-center pt-1.5"
            >
              {/* 数字盒固定 26px（保证各周行高一致），高亮圆画到盒外一圈 36px：
                  26px 的圆紧贴两位数，选中/今天看起来像"字把圆撑满了"。
                  圆底 = 6 + 26 + 5 = 37，故彩点行下移到 40 才留得下 3px 间隙，
                  格高 62 才容得下「彩点 + ·N」（48~60） */}
              <span className="relative grid h-[26px] w-[26px] place-items-center text-[14.5px] font-bold leading-[1.2]">
                {isToday || isSelected ? (
                  <span
                    aria-hidden
                    className={`absolute -inset-[5px] rounded-full transition-colors ${
                      isToday
                        ? "shadow-lift bg-accent"
                        : // 选中只圈日期本身，不铺满整格：整格高亮在无日程的日期上会留一大块空白
                          "bg-accent-soft border-accent/35 border-[1.5px]"
                    }`}
                  />
                ) : null}
                <span
                  className={`relative ${
                    isToday
                      ? "text-ink-inverse"
                      : cell.inAnchorMonth
                        ? "text-ink-1"
                        : "text-ink-3 font-semibold"
                  }`}
                >
                  {cell.dayOfMonth}
                </span>
              </span>
              {dots.length > 0 ? (
                <span className="mt-[8px] flex gap-[3px]">
                  {dots.map((color, index) => (
                    <i
                      key={`${cell.date}-dot-${index}`}
                      className="h-[5px] w-[5px] rounded-full"
                      style={{ background: color }}
                    />
                  ))}
                </span>
              ) : null}
              {moreCount > 0 ? (
                <span className="text-ink-3 mt-[3px] text-[9.5px] font-bold">·{moreCount}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const MonthGrid = memo(MonthGridImpl);
