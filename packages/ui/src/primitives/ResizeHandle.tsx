/**
 * 侧栏拖宽热区：透明 8px 竖条，hover / 拖动时中部显出 2px accent 短线（不画分隔线）。
 * 栏在热区的哪一侧由 side 决定——side="left" 表示栏在热区左边（向右拖变宽），
 * "right" 表示栏在右边（向左拖变宽）。宽度夹在 [min, max]；←/→ 每次 ±16px，双击回默认宽度。
 * 定位由调用方给（className，通常 absolute 贴在栏的内缘）。pointer capture 保证拖出窗口不丢事件。
 */

import { useCallback, useRef, useState, type PointerEvent } from "react";
import { cn } from "../cn";

export interface ResizeHandleProps {
  /** 当前宽度（受控） */
  value: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
  /** 栏在热区的哪一侧 */
  side: "left" | "right";
  /** 读屏用：调整的是什么（「AI 对话栏宽度」） */
  label: string;
  /** 双击恢复的宽度；不传则双击无操作 */
  defaultValue?: number;
  /** 拖动开始 / 结束（调用方可在拖动期间关掉宽度过渡，免得跟手滞后） */
  onActiveChange?: (active: boolean) => void;
  className?: string;
}

const KEY_STEP = 16;

export function ResizeHandle({
  value,
  min,
  max,
  onChange,
  side,
  label,
  defaultValue,
  onActiveChange,
  className,
}: ResizeHandleProps) {
  const dragging = useRef<{ x: number; startW: number } | null>(null);
  const [active, setActive] = useState(false);
  const clamp = (w: number) => Math.min(max, Math.max(min, Math.round(w)));
  // 向右拖（dx > 0）：栏在左边时变宽，在右边时变窄
  const direction = side === "left" ? 1 : -1;

  const endDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    setActive(false);
    onActiveChange?.(false);
  }, [onActiveChange]);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragging.current;
    if (drag) onChange(clamp(drag.startW + (e.clientX - drag.x) * direction));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      title={defaultValue != null ? `拖动调整${label}，双击恢复默认` : `拖动调整${label}`}
      className={cn(
        "group w-2 cursor-col-resize outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
        className
      )}
      onKeyDown={e => {
        const step = e.key === "ArrowRight" ? KEY_STEP : e.key === "ArrowLeft" ? -KEY_STEP : 0;
        if (step === 0) return;
        e.preventDefault();
        onChange(clamp(value + step * direction));
      }}
      onDoubleClick={() => defaultValue != null && onChange(clamp(defaultValue))}
      onPointerDown={e => {
        if (e.button !== 0) return;
        dragging.current = { x: e.clientX, startW: value };
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
        setActive(true);
        onActiveChange?.(true);
        e.preventDefault();
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onLostPointerCapture={endDrag}
    >
      <span
        aria-hidden
        data-active={active || undefined}
        className={cn(
          "ease-tau-out pointer-events-none relative left-[3px] top-1/2 -mt-[18px] block h-9 w-0.5 rounded-full transition-colors duration-[160ms]",
          active ? "bg-accent" : "group-hover:bg-accent bg-transparent"
        )}
      />
    </div>
  );
}
