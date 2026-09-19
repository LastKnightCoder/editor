/**
 * TimeField —— minute 精度的时刻区：可自由键入的时刻框 + 步长网格（快捷通道）。
 *
 *  - 键入归一化："9" → 09:00、"9:5" → 09:05、中文冒号兼容；只接受数字与冒号，
 *    越界标 danger、失焦还原上次有效值（打错字是常态，不弹错不阻塞）
 *  - 网格默认 15 分钟步长（timeStep 可调），键入值落在步长上则高亮、边输边滚动
 *    跟随；当前时段 accent 文字标记（nowMark，测试环境关闭）
 *  - Enter = 归一化 + 触发 onSubmit（组合进父级的「确定」路径）；
 *    Esc 只收网格（stopPropagation），面板层 Esc 由父级仲裁
 */

import { useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronDown, Clock } from "lucide-react";
import { cn } from "../../cn";
import { nearestStep, normalizeTimeInput, timeGridValues } from "./calendarEngine";

export interface TimeFieldProps {
  value: string;
  onValueChange: (time: string) => void;
  /** 网格步长（分钟），默认 15 */
  step?: number;
  /** Enter 时归一化后一并触发（父级接「确定」提交） */
  onSubmit?: () => void;
  /** 网格里标记当前时段（默认开；jsdom 环境的时间不稳定，测试关掉） */
  nowMark?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

export function TimeField({
  value,
  onValueChange,
  step = 15,
  onSubmit,
  nowMark = true,
  disabled = false,
  "aria-label": ariaLabel = "时刻",
}: TimeFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const inputId = useId();
  const values = timeGridValues(step);

  const shown = draft ?? value;
  const invalid = draft !== null && draft.trim() !== "" && normalizeTimeInput(draft) === null;
  const commitDraft = (text: string) => {
    const normalized = normalizeTimeInput(text);
    setDraft(null);
    if (normalized && normalized !== value) onValueChange(normalized);
    if (gridRef.current) {
      gridRef.current
        .querySelectorAll<HTMLElement>("[data-time]")
        .forEach(cell => (cell.dataset.on = String(cell.dataset.time === (normalized ?? value))));
    }
    scrollTo(normalized ?? value);
  };
  const scrollTo = (time: string) => {
    gridRef.current
      ?.querySelector(`[data-time="${nearestStep(time, step)}"]`)
      ?.scrollIntoView?.({ block: "center" });
  };

  const openGrid = () => {
    setGridOpen(true);
    requestAnimationFrame(() => scrollTo(value));
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commitDraft(e.currentTarget.value);
      onSubmit?.();
    } else if (e.key === "Escape" && gridOpen) {
      e.preventDefault();
      e.stopPropagation(); // 逐层退场：先收网格，面板 Esc 归父级
      if (invalid) {
        setDraft(null);
        e.currentTarget.value = value;
      }
      setGridOpen(false);
    } else if (e.key === "Escape" && invalid) {
      setDraft(null);
      e.currentTarget.value = value;
    } else if (e.key.length === 1 && !/[\d:]/.test(e.key)) {
      e.preventDefault(); // 只接受数字与冒号
    }
  };

  const nowLabel = nowMark
    ? nearestStep(
        `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`,
        step
      )
    : null;

  return (
    <div className="relative flex-1" data-open={gridOpen || undefined}>
      <div
        className={cn(
          "border-line-1 bg-surface inline-flex h-[28px] w-[96px] flex-none items-center gap-[3px] rounded-[8px] border pl-2 pr-[2px]",
          "transition-[border-color] duration-[130ms]",
          "hover:border-ink-3 data-[open]:border-accent",
          invalid && "border-danger"
        )}
        data-open={gridOpen || undefined}
      >
        <Clock className="text-ink-3 size-[13px] shrink-0" />
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          maxLength={5}
          spellCheck={false}
          aria-label={ariaLabel}
          disabled={disabled}
          value={shown}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commitDraft(e.target.value)}
          onKeyDown={onKeyDown}
          className="text-ink-1 w-full min-w-0 bg-transparent text-[12px] tabular-nums outline-none"
        />
        <button
          type="button"
          aria-label="时刻网格"
          aria-expanded={gridOpen}
          disabled={disabled}
          onClick={() => (gridOpen ? setGridOpen(false) : openGrid())}
          className="text-ink-3 hover:bg-hover hover:text-ink-1 grid h-[22px] w-5 shrink-0 place-items-center rounded-[5px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
        >
          <ChevronDown className="size-3" />
        </button>
      </div>
      {gridOpen && (
        <div
          ref={gridRef}
          role="listbox"
          aria-label={`${ariaLabel}网格`}
          className="bg-surface border-line-1 shadow-float rounded-tau-md absolute bottom-[38px] left-0 z-[5] max-h-[184px] w-[216px] overflow-y-auto border p-1.5"
        >
          <div className="grid grid-cols-4 gap-[2px]">
            {values.map(v => (
              <div
                key={v}
                role="option"
                aria-selected={v === value}
                data-time={v}
                data-on={v === value || undefined}
                onClick={() => {
                  onValueChange(v);
                  setDraft(null);
                  setGridOpen(false);
                }}
                className={cn(
                  "text-ink-1 flex h-[26px] cursor-pointer items-center justify-center rounded-[6px] text-[11.5px] tabular-nums",
                  "hover:bg-hover",
                  v === nowLabel && "text-accent-text font-[600]",
                  v === value && "bg-accent text-ink-inverse font-[600]"
                )}
              >
                {v}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
