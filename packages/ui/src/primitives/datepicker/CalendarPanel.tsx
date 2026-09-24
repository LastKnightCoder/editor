/**
 * CalendarPanel —— DatePicker / DateRangePicker 共享的月网格（A+ 基座形态）。
 *
 * 只管「网格怎么画、键盘怎么走」：选中/范围/禁用由 props 的谓词注入，点击与
 * 提交语义归调用方（单日期即点即定、minute 挂起等确认、范围收集端点）。
 *  - 六周固定 42 格，界外日 ink-3 参与导航与点选（跨月由 onMonthChange 接管）
 *  - 标题钻取：days → months（12 格）→ years（年代 12 格）；‹ › 步长随视图换
 *  - 键盘（容器承接焦点，aria-activedescendant 指向高亮格，Select 同口径）：
 *    方向键网格移动 / PgUp·PgDn 翻月 / T 今天 / Enter 拾取高亮日
 *  - 用色纪律：实底只给选中（accent + ink-inverse），范围中段 accent-soft，
 *    今天是 accent 文字 + 3px 圆点——安静的标记不抢选中
 */

import { useId, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../cn";
import { WEEKDAY_LABELS, addMonths, monthCells, sameDay, toDateKey } from "./calendarEngine";

export type CalendarView = "days" | "months" | "years";

export interface CalendarPanelProps {
  /** 视图月（该月 1 号；界外日点选后调用方应换月） */
  month: Date;
  onMonthChange: (month: Date) => void;
  view?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  /** 实底选中（范围端点/单值） */
  isSelected: (date: Date) => boolean;
  /** 范围中段（accent-soft） */
  isInRange?: (date: Date) => boolean;
  isDateDisabled?: (date: Date) => boolean;
  /** 键盘高亮日（受控；不传则面板自管） */
  highlighted?: Date | null;
  onHighlight?: (date: Date) => void;
  onPickDate: (date: Date) => void;
  /** 标题钻取（months/years 视图）；默认开 */
  drillable?: boolean;
  className?: string;
}

export function CalendarPanel({
  month,
  onMonthChange,
  view = "days",
  onViewChange,
  isSelected,
  isInRange,
  isDateDisabled,
  highlighted,
  onHighlight,
  onPickDate,
  drillable = true,
  className,
}: CalendarPanelProps) {
  const gridId = useId();
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const hlKey = highlighted ? toDateKey(highlighted) : null;
  const decadeStart = Math.floor(year / 10) * 10;

  const stepMonth = (delta: number) => onMonthChange(addMonths(month, delta));
  const drill = () => {
    if (!drillable || !onViewChange) return;
    onViewChange(view === "days" ? "months" : "years");
  };

  /** 网格键盘：days 视图移动高亮 / 翻月 / 今天；months·years 视图由调用方约定关闭（本组件只渲染 days 导航键） */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (view !== "days") return;
    const base = highlighted ?? month;
    const move = (delta: number) => {
      e.preventDefault();
      const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta);
      if (next.getMonth() !== monthIndex || next.getFullYear() !== year)
        onMonthChange(new Date(next.getFullYear(), next.getMonth(), 1));
      onHighlight?.(next);
    };
    if (e.key === "ArrowLeft") move(-1);
    else if (e.key === "ArrowRight") move(1);
    else if (e.key === "ArrowUp") move(-7);
    else if (e.key === "ArrowDown") move(7);
    else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const next = addMonths(month, e.key === "PageUp" ? -1 : 1);
      onMonthChange(next);
      const clamp = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      onHighlight?.(new Date(next.getFullYear(), next.getMonth(), Math.min(base.getDate(), clamp)));
    } else if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      const now = new Date();
      onMonthChange(new Date(now.getFullYear(), now.getMonth(), 1));
      onHighlight?.(now);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted && !isDateDisabled?.(highlighted)) onPickDate(highlighted);
    }
  };

  const navStep = view === "days" ? 1 : view === "months" ? 1 : 10;
  const navLabel = view === "days" ? "月" : view === "months" ? "年" : "十年";
  const label =
    view === "days"
      ? `${year}年${monthIndex + 1}月`
      : view === "months"
        ? `${year}年`
        : `${decadeStart} — ${decadeStart + 9}`;

  return (
    <div
      data-calendar-panel=""
      tabIndex={-1}
      className={cn("text-ink-1 w-[252px] outline-none", className)}
      onKeyDown={onKeyDown}
    >
      <div className="mb-1.5 flex items-center gap-1">
        <button
          type="button"
          aria-label={`上一${navLabel}`}
          onClick={() =>
            view === "days"
              ? stepMonth(-navStep)
              : onMonthChange(addMonths(month, view === "months" ? -12 : -120))
          }
          className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm grid h-[30px] w-[30px] place-items-center outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
        >
          <ChevronLeft className="size-[15px]" />
        </button>
        <button
          type="button"
          aria-live="polite"
          onClick={drill}
          tabIndex={drillable ? undefined : -1}
          className={cn(
            "text-ink-1 rounded-tau-sm flex h-[30px] flex-1 items-center justify-center gap-1.5 text-[13px] font-[600] tabular-nums outline-none",
            drillable && "hover:bg-hover focus-visible:shadow-[var(--tau-focus-ring)]",
            !drillable && "cursor-default"
          )}
        >
          {label}
          {drillable && <ChevronDown className="text-ink-3 size-[13px]" />}
        </button>
        <button
          type="button"
          aria-label={`下一${navLabel}`}
          onClick={() =>
            view === "days"
              ? stepMonth(navStep)
              : onMonthChange(addMonths(month, view === "months" ? 12 : 120))
          }
          className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm grid h-[30px] w-[30px] place-items-center outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
        >
          <ChevronRight className="size-[15px]" />
        </button>
      </div>

      {view === "days" ? (
        <div
          id={gridId}
          role="grid"
          aria-label={label}
          aria-activedescendant={hlKey ? `${gridId}-${hlKey}` : undefined}
          className="outline-none"
        >
          <div className="mb-0.5 grid grid-cols-7">
            {WEEKDAY_LABELS.map(day => (
              <span
                key={day}
                className="text-ink-3 h-[22px] text-center text-[11px] leading-[22px]"
              >
                {day}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[3px]">
            {monthCells(year, monthIndex).map(({ date, key, inMonth }) => {
              const selected = isSelected(date);
              const disabled = isDateDisabled?.(date) === true;
              const isToday = sameDay(date, new Date());
              return (
                <div
                  key={key}
                  id={`${gridId}-${key}`}
                  role="gridcell"
                  aria-selected={selected}
                  aria-disabled={disabled || undefined}
                  aria-current={isToday ? "date" : undefined}
                  data-hl={hlKey === key || undefined}
                  data-disabled={disabled || undefined}
                  onClick={() => !disabled && onPickDate(date)}
                  onPointerEnter={() => !disabled && onHighlight?.(date)}
                  className={cn(
                    "rounded-tau-sm relative flex h-8 cursor-pointer items-center justify-center text-[12.5px] tabular-nums",
                    "transition-[background,color] duration-[130ms]",
                    !selected && "hover:bg-hover data-[hl=true]:bg-hover",
                    !inMonth && "text-ink-3",
                    inMonth && !selected && "text-ink-1",
                    isToday && !selected && "text-accent-text font-[600]",
                    selected &&
                      "bg-accent text-ink-inverse hover:bg-accent-hover data-[hl=true]:bg-accent-hover font-[600]",
                    isInRange?.(date) &&
                      !selected &&
                      "bg-accent-soft text-accent-text hover:bg-accent-soft rounded-none",
                    disabled && "text-ink-3 pointer-events-none"
                  )}
                >
                  {date.getDate()}
                  {isToday && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute bottom-1 left-1/2 size-[3px] -translate-x-1/2 rounded-full",
                        selected ? "bg-ink-inverse" : "bg-accent-text"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div role="grid" aria-label={label} className="grid grid-cols-3 gap-[3px]">
          {(view === "months"
            ? Array.from({ length: 12 }, (_, i) => ({
                key: `m${i}`,
                text: `${i + 1}月`,
                on: i === monthIndex,
              }))
            : Array.from({ length: 12 }, (_, i) => {
                const y = decadeStart - 1 + i;
                return {
                  key: `y${y}`,
                  text: String(y),
                  on: y === year && y >= decadeStart && y <= decadeStart + 9,
                };
              })
          ).map(cell => (
            <button
              key={cell.key}
              type="button"
              aria-pressed={cell.on}
              onClick={() => {
                if (view === "months") {
                  onMonthChange(new Date(year, Number(cell.key.slice(1)), 1));
                  onViewChange?.("days");
                } else {
                  onMonthChange(new Date(Number(cell.key.slice(1)), monthIndex, 1));
                  onViewChange?.("months");
                }
              }}
              className={cn(
                "rounded-tau-sm flex h-[46px] items-center justify-center text-[12.5px] tabular-nums outline-none",
                "hover:bg-hover focus-visible:shadow-[var(--tau-focus-ring)]",
                cell.on && "bg-selected text-accent-text font-[600]"
              )}
            >
              {cell.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
