/**
 * DatePicker 基础件 —— 经典月历单日期（A+ 形态，mockups/datepicker/）。
 *
 * 值形状拆分的单日期侧：value: string | null（"YYYY-MM-DD"，precision="minute"
 * 时 "YYYY-MM-DD HH:mm"）；范围归 DateRangePicker（同一引擎，别在此加 range）。
 *
 * 分层（同 Popover/AnchoredPanel）：DatePickerPanel 是可独立使用的内嵌面板
 * （受控显示 + onCommit 确定，块级渲染，无开合无定位——宿主托管场景直接用它，
 * 如行内编辑器浮层）；DatePicker = 触发器 + 开合 + 定位 + 外点仲裁 + Panel。
 *
 * 行为内建（不做成 props）：
 *  - 提交模型跟着 precision 走：day 点日期即提交；minute 点日期只挂起，
 *    底栏时刻区（TimeField：自由键入 + 步长网格）+「确定」显式提交——带时间的
 *    值改起来贵，不做即点即定；预设（presets）取值即完整，一律即点即定
 *  - 钻取导航：点标题 days → months → 年代（12 格），‹ › 步长随视图换
 *  - 键盘全表：触发器 ↑↓·Enter 开面板；面板内方向键 / PgUp·PgDn 翻月 / T 今天 /
 *    Enter 提交；Esc 逐层退场（时刻网格先收，再关面板），焦点归还触发器
 *  - 定位复用 D-004 引擎（bottom + gap 4，flip 跟随）；外点关闭（useLayerDismiss）；
 *    层级 z-[250] 与 Select/Menu 同层
 *  - 预设行显示在日历下方：presets 数据驱动（label + 取值函数），内容与措辞
 *    归使用方，组件不内置业务词表；当前值命中时该 chip 高亮回显
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
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
  formatDisplay,
  formatValue,
  parseValue,
  sameDay,
  type DatePrecision,
} from "./calendarEngine";
import { CalendarPanel, type CalendarView } from "./CalendarPanel";
import { TimeField } from "./TimeField";

export type { DatePrecision } from "./calendarEngine";

export interface DatePickerPreset {
  label: ReactNode;
  /** 调用时求值（"今天"这类动态日期每次打开都新鲜）；返回 null 表示清空 */
  value: () => string | null;
}

/* ───────── 内嵌面板（宿主托管） ───────── */

export interface DatePickerPanelProps {
  /** 受控显示值（"YYYY-MM-DD" / "YYYY-MM-DD HH:mm"） */
  value: string | null;
  /** 确定提交：day 点日期 / minute 确定 / 预设 / 今天 / 清空 */
  onCommit: (value: string | null) => void;
  precision?: DatePrecision;
  presets?: readonly DatePickerPreset[];
  timeStep?: number;
  disabled?: boolean;
  /** 禁用日期谓词（入参 "YYYY-MM-DD"，业务侧零 Date 依赖） */
  isDateDisabled?: (day: string) => boolean;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

export function DatePickerPanel({
  value,
  onCommit,
  precision = "day",
  presets,
  timeStep = 15,
  disabled = false,
  isDateDisabled,
  className,
  ref,
}: DatePickerPanelProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<CalendarView>("days");
  const [month, setMonth] = useState(() => {
    const base = parseValue(value ?? "") ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [hl, setHl] = useState<Date | null>(() => parseValue(value ?? "") ?? new Date());
  const [pending, setPending] = useState<Date | null>(null); // minute：已点选未确认的日期
  const [time, setTime] = useState(() => value?.slice(11) || "09:00");

  const valueDate = parseValue(value ?? "");
  /** minute 精度的当前日期展示位：挂起值优先（选了还没确认） */
  const activeDate = precision === "minute" ? (pending ?? valueDate) : valueDate;
  /** 分钟精度的确认就绪：有挂起日期或已有值即可确定 */
  const minuteReady = precision !== "minute" || activeDate != null;
  const presetActive = (preset: DatePickerPreset) => value != null && value === preset.value();

  const dateDisabled = isDateDisabled
    ? (date: Date) =>
        isDateDisabled(
          `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
        )
    : undefined;

  const pickDate = (date: Date) => {
    if (precision === "minute") {
      setPending(date);
      setHl(date);
      return;
    }
    onCommit(formatValue(date, precision));
  };
  const applyMinute = () => {
    if (!activeDate) return;
    activeDate.setHours(Number(time.slice(0, 2)), Number(time.slice(3)), 0, 0);
    onCommit(formatValue(activeDate, precision));
  };
  const applyPresets = (preset: DatePickerPreset) => {
    const next = preset.value();
    if (next === null) {
      onCommit(null);
      return;
    }
    const date = parseValue(next);
    if (!date) return;
    if (precision === "minute" && next.includes(" ")) setTime(next.slice(11));
    onCommit(formatValue(date, precision));
  };
  const pickToday = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    onCommit(formatValue(now, precision));
  };

  // 挂载即聚焦网格（键盘导航入口；宿主浮层常驻渲染时随 key 重挂复位）
  useEffect(() => {
    try {
      rootRef.current
        ?.querySelector<HTMLElement>("[data-calendar-panel]")
        ?.focus({ preventScroll: true });
    } catch {
      /* jsdom 部分元素无 focus */
    }
  }, []);

  return (
    <div ref={mergeRefs(ref, rootRef)} className={cn("w-[276px] p-3", className)}>
      <CalendarPanel
        month={month}
        onMonthChange={setMonth}
        view={view}
        onViewChange={setView}
        isSelected={date => activeDate != null && sameDay(date, activeDate)}
        isDateDisabled={dateDisabled}
        highlighted={view === "days" ? hl : null}
        onHighlight={setHl}
        onPickDate={pickDate}
      />
      {presets && presets.length > 0 && (
        <div className="border-line-2 mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
          <span className="text-ink-3 mr-0.5 text-[11px]">常用</span>
          {presets.map((preset, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={presetActive(preset)}
              data-on={presetActive(preset) || undefined}
              onClick={() => applyPresets(preset)}
              className={cn(
                "text-ink-2 bg-group hover:bg-hover hover:text-ink-1 h-[26px] rounded-[7px] px-[11px] text-[11.5px]",
                "data-[on]:bg-selected data-[on]:text-accent-text data-[on]:font-[550]"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      {precision === "minute" ? (
        <div className="border-line-2 mt-2 flex items-center gap-2 border-t pt-2">
          <TimeField
            value={time}
            onValueChange={setTime}
            step={timeStep}
            onSubmit={applyMinute}
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => onCommit(null)}
            className="text-ink-2 hover:bg-hover hover:text-ink-1 h-[28px] rounded-[8px] px-3 text-[12px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
          >
            清空
          </button>
          <button
            type="button"
            disabled={!minuteReady}
            onClick={applyMinute}
            className="bg-accent text-ink-inverse hover:bg-accent-hover ml-auto h-[28px] rounded-[8px] px-4 text-[12px] font-[550] outline-none focus-visible:shadow-[var(--tau-focus-ring)] disabled:pointer-events-none disabled:opacity-50"
          >
            确定
          </button>
        </div>
      ) : (
        <div className="border-line-2 mt-2 flex items-center justify-between border-t pt-2">
          <button
            type="button"
            onClick={pickToday}
            className="text-accent-text hover:bg-selected rounded-[7px] px-2.5 py-1 text-[12px] font-[550] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
          >
            今天
          </button>
          <button
            type="button"
            onClick={() => onCommit(null)}
            className="text-ink-2 hover:bg-hover hover:text-ink-1 rounded-[7px] px-2.5 py-1 text-[12px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
          >
            清空
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────── 触发式组合件 ───────── */

export interface DatePickerProps {
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string | null) => void;
  /** 值粒度：day（默认，"YYYY-MM-DD"）| minute（"YYYY-MM-DD HH:mm"，底栏时刻区 + 确定提交） */
  precision?: DatePrecision;
  /** 预设行（日历下方）：数据驱动，即点即定 */
  presets?: readonly DatePickerPreset[];
  placeholder?: string;
  size?: "sm" | "md";
  /** 触发器 hover 浮出清除（值回 null） */
  clearable?: boolean;
  /** 禁用日期谓词（入参 "YYYY-MM-DD"，业务侧零 Date 依赖） */
  isDateDisabled?: (day: string) => boolean;
  /** 时刻网格步长（分钟），默认 15 */
  timeStep?: number;
  disabled?: boolean;
  /** Field 体系错误态（danger 描边） */
  status?: "error";
  /** 浮层受控（§5.3 契约；样板间常显标本用它） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

export function DatePicker({
  value: valueProp,
  defaultValue = null,
  onValueChange,
  precision = "day",
  presets,
  placeholder = "选择日期",
  size = "md",
  clearable = false,
  isDateDisabled,
  timeStep = 15,
  disabled = false,
  status,
  open: openProp,
  onOpenChange,
  className,
  ref,
}: DatePickerProps) {
  const portalContainer = usePortalContainer();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [internalValue, setInternalValue] = useState<string | null>(defaultValue);
  const [internalOpen, setInternalOpen] = useState(false);
  // 打开会话号：递增即重挂 DatePickerPanel（视图/挂起/月份/高亮复位 + 落焦网格）
  const [session, setSession] = useState(0);

  const value = valueProp !== undefined ? valueProp : internalValue;
  const open = openProp ?? internalOpen;
  const panelId = useId();

  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  const commit = (next: string | null) => {
    setInternalValue(next);
    onValueChange?.(next);
  };

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
      setSession(session => session + 1);
      setOpen(true);
    }
  };

  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // 焦点链 LIFO：Esc 只关本层
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
    // Enter 不在此处理：day 由网格容器的键盘路径提交，minute 由 TimeField 提交
    // （避免同一事件冒泡双路径重复提交）
  };

  const display = value == null ? null : formatDisplay(value);

  const panel = createPortal(
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label="选择日期"
      aria-hidden={!open}
      data-open={open}
      onKeyDown={onPanelKeyDown}
      tabIndex={-1}
      className={cn(
        "bg-surface border-line-1 shadow-float rounded-tau-lg border",
        "fixed left-0 top-0 z-[250]",
        "ease-tau-out outline-none transition-[opacity,transform,visibility] duration-[160ms]",
        open ? "opacity-100" : "invisible translate-y-[4px] opacity-0",
        !open && "data-[dir=up]:-translate-y-[4px]"
      )}
    >
      <DatePickerPanel
        key={session}
        value={value}
        precision={precision}
        presets={presets}
        timeStep={timeStep}
        disabled={disabled}
        isDateDisabled={isDateDisabled}
        onCommit={next => {
          commit(next);
          setOpen(false);
          triggerRef.current?.focus();
        }}
      />
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
        onClick={() => {
          if (open) setOpen(false);
          else {
            setSession(session => session + 1);
            setOpen(true);
          }
        }}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "border-line-1 bg-surface text-ink-1 group/trigger",
          "rounded-tau-sm inline-flex items-center gap-2 border",
          "ease-tau-out transition-[border-color,box-shadow] duration-[160ms]",
          "hover:not-focus-visible:border-ink-3/50 focus-visible:border-accent outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
          "data-[open=true]:border-accent data-[status=error]:border-danger",
          "disabled:pointer-events-none disabled:opacity-55",
          "tabular-nums",
          size === "sm"
            ? "text-tau-sm h-[28px] min-w-[138px] pl-2.5 pr-1"
            : "text-tau-body h-[34px] min-w-[168px] pl-3 pr-1.5"
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
              commit(null);
              setOpen(false);
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
