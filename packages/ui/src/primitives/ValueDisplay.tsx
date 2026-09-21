/**
 * ValueDisplay —— 值展示件（占位迁移合集）：ColorSwatch / ProgressBar / Rating。
 * Tag 已按设计稿定稿拆出 primitives/Tag.tsx（2026-09-19）；本文件剩余三件
 * 仍是未经设计稿评审的占位实现（ValueDisplay 族逐件定稿时迁出），勿在
 * 此基础上加能力。
 */

import { Star } from "lucide-react";
import { TAG_COLORS, type TagColor } from "./Tag";
import { cn } from "../cn";

/** 色板选择器的按钮底色（soft 系；选中态 ring-accent） */
const SWATCH_STYLES: Record<TagColor, string> = {
  red: "bg-danger-soft",
  orange: "bg-accent-soft",
  yellow: "bg-warn-soft",
  green: "bg-ok-soft",
  gray: "bg-group",
  blue: "bg-info-soft",
  purple: "bg-tag-3-soft",
};

export function ColorSwatch({
  value,
  onChange,
  disabled,
}: {
  value: TagColor;
  onChange: (value: TagColor) => void;
  disabled?: boolean;
}) {
  const labels: Record<TagColor, string> = {
    red: "红",
    orange: "橙",
    yellow: "黄",
    green: "绿",
    gray: "灰",
    blue: "蓝",
    purple: "紫",
  };
  return (
    <div role="group" aria-label="选项颜色" className="flex flex-wrap gap-1">
      {TAG_COLORS.map(color => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          aria-label={labels[color]}
          aria-pressed={value === color}
          onClick={() => onChange(color)}
          className={cn(
            "rounded-tau-sm size-7 cursor-pointer text-xs focus-visible:shadow-[var(--tau-focus-ring)]",
            SWATCH_STYLES[color],
            value === color && "ring-accent ring-2"
          )}
        >
          {labels[color]}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  label,
}: {
  value: number;
  max?: number;
  label: string;
}) {
  const ratio = max > 0 && Number.isFinite(value) ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="bg-group h-2 w-full overflow-hidden rounded-full"
    >
      <div className="bg-accent h-full rounded-full" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

export function Rating({
  value,
  onValueChange,
  max = 5,
  step = 0.5,
  readOnly = false,
  label = "评分",
}: {
  value: number | null;
  onValueChange?: (value: number | null) => void;
  max?: number;
  step?: 0.5 | 1;
  readOnly?: boolean;
  label?: string;
}) {
  const limit = Math.max(1, Math.floor(max));
  const commit = (next: number | null) => {
    if (!readOnly) onValueChange?.(next == null ? null : Math.min(limit, Math.max(0, next)));
  };
  return (
    <div
      role="slider"
      tabIndex={readOnly ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={value ?? 0}
      aria-disabled={readOnly}
      className="text-accent flex w-fit rounded focus-visible:shadow-[var(--tau-focus-ring)]"
      onKeyDown={event => {
        if (
          readOnly ||
          event.nativeEvent.isComposing ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        )
          return;
        if (
          [
            "ArrowLeft",
            "ArrowDown",
            "ArrowRight",
            "ArrowUp",
            "Home",
            "End",
            "Delete",
            "Backspace",
          ].includes(event.key)
        ) {
          event.preventDefault();
          event.stopPropagation();
          commit(
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? limit
                : ["Delete", "Backspace"].includes(event.key)
                  ? null
                  : (value ?? 0) + (["ArrowRight", "ArrowUp"].includes(event.key) ? step : -step)
          );
        }
      }}
    >
      {Array.from({ length: limit }, (_, index) => (
        <span
          key={index}
          className="relative block size-6"
          onPointerDown={event => {
            if (readOnly) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            commit(
              index + (step === 0.5 && event.clientX - bounds.left < bounds.width / 2 ? 0.5 : 1)
            );
          }}
        >
          <Star className="text-ink-3 absolute inset-0 size-6" />
          <span
            className="absolute inset-0 overflow-hidden"
            style={{ width: `${Math.min(1, Math.max(0, (value ?? 0) - index)) * 100}%` }}
          >
            <Star className="size-6 fill-current" />
          </span>
        </span>
      ))}
    </div>
  );
}
