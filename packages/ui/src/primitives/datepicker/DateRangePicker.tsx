/**
 * DateRangePicker 基础件 —— 范围形态（B 形态并入，mockups/datepicker/ 方案 B）。
 *
 * 值形状拆分的范围侧：value: readonly [string, string] | null（两端均
 * "YYYY-MM-DD"，升序）。与 DatePicker 同一引擎（CalendarPanel/弹层契约/触发器皮），
 * 收起预设列与底栏、去掉 range 即回到单日期形态——不是第二个日历，是同一结构的
 * 范围扩展态。
 *
 * 行为内建（不做成 props）：
 *  - 提交模型：手选范围走「点起点 → 悬停预览 → 点终点（自动交换）→ 确定」三道闸
 *    （范围错一格就触发下游重查询，不做即点即定）；预设即选即定
 *  - 双月并排（跨月范围不翻页）：左 ‹ 右 › 承载翻月，中间 line-2 弱分隔
 *  - 用色纪律：端点 accent 实底、中段 accent-soft，色彩表意不装饰
 *  - 底栏摘要（"9月12日 – 9月19日 · 共 8 天"）是提交前最后一眼确认
 *  - 键盘：Enter 确定 / Esc 放弃预览并关闭（焦点归还触发器）
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Calendar, X } from "lucide-react";
import { usePortalContainer } from "../../UiProvider";
import { cn } from "../../cn";
import { mergeRefs } from "../mergeRefs";
import { useAnchoredPosition } from "../useAnchoredPosition";
import { useLayerDismiss } from "../useLayerDismiss";
import {
  addMonths,
  formatDisplay,
  formatRangeDisplay,
  parseValue,
  sameDay,
  toDateKey,
} from "./calendarEngine";
import { CalendarPanel } from "./CalendarPanel";

export interface DateRangePreset {
  label: string;
  /** 调用时求值（"本周"这类动态范围每次打开都新鲜）；返回 null 表示清空 */
  range: () => readonly [string, string] | null;
}

export interface DateRangePickerProps {
  value?: readonly [string, string] | null;
  defaultValue?: readonly [string, string] | null;
  onValueChange?: (value: [string, string] | null) => void;
  /** 预设列（面板左列）：数据驱动，即选即定 */
  presets?: readonly DateRangePreset[];
  placeholder?: string;
  size?: "sm" | "md";
  clearable?: boolean;
  isDateDisabled?: (day: string) => boolean;
  disabled?: boolean;
  status?: "error";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/** 排序 + 升序化（终点早于起点时交换） */
const ordered = (a: string, b: string): [string, string] =>
  toDateKey(parseValue(a) ?? new Date(0)) <= toDateKey(parseValue(b) ?? new Date(0))
    ? [a, b]
    : [b, a];

const daysBetween = (start: Date, end: Date) =>
  Math.round(
    (new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() -
      new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()) /
      86400000
  ) + 1;

export function DateRangePicker({
  value: valueProp,
  defaultValue = null,
  onValueChange,
  presets,
  placeholder = "日期范围",
  size = "md",
  clearable = false,
  isDateDisabled,
  disabled = false,
  status,
  open: openProp,
  onOpenChange,
  className,
  ref,
}: DateRangePickerProps) {
  const portalContainer = usePortalContainer();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [internalValue, setInternalValue] = useState<readonly [string, string] | null>(
    defaultValue
  );
  const [internalOpen, setInternalOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const base = parseValue((valueProp ?? defaultValue)?.[0] ?? "") ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  /** 手选草稿：start 有了 end 未定时展示悬停预览 */
  const [draft, setDraft] = useState<{ start: Date; end: Date | null } | null>(null);
  const [hover, setHover] = useState<Date | null>(null);

  const value = valueProp !== undefined ? valueProp : internalValue;
  const open = openProp ?? internalOpen;
  const panelId = useId();

  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  const commit = (next: [string, string] | null) => {
    setInternalValue(next);
    onValueChange?.(next);
  };
  const commitAndClose = (next: [string, string]) => {
    commit(next);
    setDraft(null);
    setHover(null);
    setOpen(false);
    triggerRef.current?.focus();
  };
  const clear = () => {
    commit(null);
    setDraft(null);
    setHover(null);
    setOpen(false);
  };

  /** 面板当前展示的区间：手选草稿优先，否则已提交值 */
  const rangeStart = draft?.start ?? parseValue(value?.[0] ?? "") ?? null;
  const rangeEnd = draft?.end ?? parseValue(value?.[1] ?? "") ?? null;
  /** 预览终点：end 已定用 end，否则用 hover（悬停预览） */
  const previewEnd = rangeEnd ?? hover;
  const inRange = (date: Date) => {
    if (!rangeStart || !previewEnd) return false;
    const a = toDateKey(rangeStart <= previewEnd ? rangeStart : previewEnd);
    const b = toDateKey(rangeStart <= previewEnd ? previewEnd : rangeStart);
    const k = toDateKey(date);
    return k > a && k < b;
  };
  const isEdge = (date: Date) =>
    (rangeStart != null && sameDay(date, rangeStart)) ||
    (previewEnd != null && sameDay(date, previewEnd));

  const dateDisabled = isDateDisabled
    ? (date: Date) =>
        isDateDisabled(
          `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
        )
    : undefined;

  useAnchoredPosition({
    open,
    getAnchor: () => triggerRef.current?.getBoundingClientRect() ?? null,
    popRef: panelRef,
    placement: "bottom",
    gap: 4,
    onPlace: ({ side }, el) => {
      el.dataset.dir = side === "top" ? "up" : "down";
    },
  });

  useLayerDismiss({
    open,
    layerRef: panelRef,
    close: () => setOpen(false),
    isAnchor: target => rootRef.current?.contains(target) ?? false,
    getAnchorEl: () => triggerRef.current,
  });

  const pickDate = (date: Date) => {
    if (!draft || draft.end != null) {
      setDraft({ start: date, end: null });
      setHover(date);
      return;
    }
    const [s, e] = draft.start <= date ? [draft.start, date] : [date, draft.start];
    setDraft({ start: s, end: e }); // 等确定才提交
  };

  const apply = () => {
    if (!rangeStart || !rangeEnd) return;
    commitAndClose([toDateKey(rangeStart), toDateKey(rangeEnd)]);
  };

  // 打开落初始焦点到网格容器（键盘导航的 target；Esc/Enter 面板层仲裁）
  useEffect(() => {
    if (!open) return;
    try {
      panelRef.current
        ?.querySelector<HTMLElement>("[data-calendar-panel]")
        ?.focus({ preventScroll: true });
    } catch {
      /* jsdom 部分元素无 focus */
    }
  }, [open]);

  const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Tab" && open) {
      setOpen(false);
    } else if (
      !open &&
      (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")
    ) {
      e.preventDefault();
      setDraft(null);
      setOpen(true);
    }
  };

  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key === "Enter" && rangeStart && rangeEnd) {
      e.preventDefault();
      apply();
    }
  };

  const summary = !rangeStart
    ? "选择起始日期…"
    : !rangeEnd
      ? `起 ${formatDisplay(toDateKey(rangeStart))} · 再选终止日期`
      : (() => {
          const [s, e] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
          return `${formatRangeDisplay(toDateKey(s), toDateKey(e))} · 共 ${daysBetween(s, e)} 天`;
        })();

  /** 预设高亮回显：动态预设调用时求值比对（升序化后端点相等） */
  const presetMatches = (preset: DateRangePreset) => {
    if (value == null) return false;
    const next = preset.range();
    if (!next) return false;
    const [s, e] = ordered(next[0], next[1]);
    return value[0] === s && value[1] === e;
  };

  const display = value == null ? null : formatRangeDisplay(value[0], value[1]);

  const panel = createPortal(
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label="选择日期范围"
      aria-hidden={!open}
      data-open={open}
      onKeyDown={onPanelKeyDown}
      tabIndex={-1}
      onMouseLeave={() => setHover(null)}
      className={cn(
        "bg-surface border-line-1 shadow-float rounded-tau-lg border p-3",
        "fixed left-0 top-0 z-[250]",
        "ease-tau-out outline-none transition-[opacity,transform,visibility] duration-[160ms]",
        open ? "opacity-100" : "invisible translate-y-[4px] opacity-0",
        !open && "data-[dir=up]:-translate-y-[4px]"
      )}
    >
      <div className="flex gap-2.5">
        {presets && presets.length > 0 && (
          <div className="border-line-2 w-[128px] flex-none pr-2.5">
            <div className="text-ink-3 px-2 pb-1.5 pt-1 text-[11px] font-[600]">常用范围</div>
            <div className="flex flex-col gap-0.5">
              {presets.map((preset, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={presetMatches(preset)}
                  onClick={() => {
                    const next = preset.range();
                    if (next === null) {
                      clear();
                      return;
                    }
                    const [s, e] = ordered(next[0], next[1]);
                    const start = parseValue(s);
                    if (start) setMonth(new Date(start.getFullYear(), start.getMonth(), 1));
                    commitAndClose([s, e]);
                  }}
                  className={cn(
                    "text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm h-[28px] px-2 text-left text-[12.5px]",
                    presetMatches(preset) && "bg-selected text-accent-text font-[550]"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2.5">
          <CalendarPanel
            month={month}
            onMonthChange={setMonth}
            drillable={false}
            isSelected={isEdge}
            isInRange={inRange}
            isDateDisabled={dateDisabled}
            onPickDate={pickDate}
            onHighlight={setHover}
          />
          <div className="border-line-2 flex gap-2.5 border-l pl-2.5">
            <CalendarPanel
              month={addMonths(month, 1)}
              onMonthChange={next => setMonth(addMonths(next, -1))}
              drillable={false}
              isSelected={isEdge}
              isInRange={inRange}
              isDateDisabled={dateDisabled}
              onPickDate={pickDate}
              onHighlight={setHover}
            />
          </div>
        </div>
      </div>
      <div className="border-line-2 mt-2.5 flex items-center gap-2 border-t pt-2.5">
        <span
          aria-live="polite"
          className="text-ink-2 min-w-0 flex-1 truncate text-[12px] tabular-nums"
        >
          {summary}
        </span>
        <button
          type="button"
          onClick={clear}
          className="text-ink-2 hover:bg-hover hover:text-ink-1 h-[28px] rounded-[8px] px-3 text-[12px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
        >
          清空
        </button>
        <button
          type="button"
          disabled={!(rangeStart && rangeEnd)}
          onClick={apply}
          className="bg-accent text-ink-inverse hover:bg-accent-hover h-[28px] rounded-[8px] px-4 text-[12px] font-[550] outline-none focus-visible:shadow-[var(--tau-focus-ring)] disabled:pointer-events-none disabled:opacity-50"
        >
          确定
        </button>
      </div>
    </div>,
    portalContainer
  );

  return (
    <div ref={rootRef} className={cn("inline-flex", className)} data-disabled={disabled}>
      <button
        ref={mergeRefs(ref, el => {
          triggerRef.current = el;
        })}
        type="button"
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        data-open={open}
        data-status={status}
        onClick={() => (open ? setOpen(false) : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "border-line-1 bg-surface text-ink-1 group/trigger",
          "rounded-tau-sm inline-flex items-center gap-2 border",
          "ease-tau-out transition-[border-color,box-shadow] duration-[160ms]",
          "hover:border-ink-3 focus-visible:border-accent outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
          "data-[open=true]:border-accent data-[status=error]:border-danger",
          "disabled:pointer-events-none disabled:opacity-55",
          "tabular-nums",
          size === "sm"
            ? "text-tau-sm h-[28px] min-w-[178px] pl-2.5 pr-1"
            : "text-tau-body h-[34px] min-w-[210px] pl-3 pr-1.5"
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate text-left", display == null && "text-ink-3")}>
          {display ?? placeholder}
        </span>
        {clearable && display != null && (
          <span
            role="button"
            aria-label="清空"
            tabIndex={-1}
            onClick={(e: ReactMouseEvent) => {
              e.stopPropagation();
              clear();
            }}
            className="text-ink-3 hover:bg-hover hover:text-ink-1 invisible grid size-[22px] place-items-center rounded-[6px] group-hover/trigger:visible"
          >
            <X className="size-[13px]" />
          </span>
        )}
        <Calendar
          className={cn(
            "text-ink-3 size-[15px] shrink-0",
            "group-data-[open=true]/trigger:text-accent-text"
          )}
        />
      </button>
      {panel}
    </div>
  );
}
