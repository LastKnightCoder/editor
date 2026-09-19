/**
 * Switch —— 开关基础件（Input 方案 A 语言，mockups/switch/，2026-09-19 定稿）。
 *
 * 语义载体 button[role=switch][aria-checked]：值语义是开/关（对读屏比 checkbox
 * 准确），Space/Enter 原生切换，focus-visible 才显 ring。
 *
 * 形制（「轨道是槽、thumb 是浮起物」，mockups 定稿）：
 *  - 未选中轨道消费 bg-track（控件轨道语义 token，非表面阶梯——深色主题取
 *    中调暖棕，亮于 surface 使 thumb 可辨且不显黑；新增主题零组件改动）
 *  - thumb 恒为 surface 亮底 + ink-3 描边环（在其上清晰分辨），选中后描边
 *    功成身退（透明）；选中轨道转 accent 实底
 *  - hover 落在 thumb 描边加深（ink-2），聚焦时让位；拨动 160ms ease-out
 */

import { useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "../cn";

export interface SwitchProps extends Omit<ComponentProps<"button">, "onChange" | "children"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (value: boolean) => void;
  /** 渲染在开关左侧的关联文字（点击切换）；纯读屏标签用 aria-label */
  label?: ReactNode;
  size?: "sm" | "md";
}

export function Switch({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  label,
  size = "md",
  disabled,
  className,
  ...props
}: SwitchProps) {
  const [internal, setInternal] = useState(defaultChecked);
  const checked = checkedProp ?? internal;

  const toggle = () => {
    if (disabled) return;
    const next = !checked;
    setInternal(next);
    onCheckedChange?.(next);
  };

  const track = cn(
    "group/sw relative shrink-0 cursor-pointer rounded-full border-[1.5px] border-transparent",
    "transition-[background-color] duration-[160ms] ease-tau-out outline-none",
    "focus-visible:shadow-[var(--tau-focus-ring)]",
    "disabled:pointer-events-none disabled:cursor-default disabled:opacity-55",
    // 轨道色条件互斥（未选中 bg-track / 选中 accent），不经 cn 叠加
    checked ? "bg-accent group-hover/sw:bg-accent-hover" : "bg-track",
    size === "sm" ? "h-[17px] w-[30px]" : "h-5 w-9"
  );
  const thumb = cn(
    "bg-surface absolute top-0.5 left-0.5 rounded-full border",
    "transition-[left,border-color] duration-[160ms] ease-tau-out",
    "shadow-[0_1px_2px_rgba(0,0,0,0.12)]",
    "group-hover/sw:group-not-focus-visible/sw:border-ink-2",
    // 描边色条件互斥（选中后功成身退），位移只在选中时出现
    checked ? "border-transparent" : "border-ink-3",
    size === "sm" ? "size-[11px]" : "size-3.5",
    checked && (size === "sm" ? "left-[14px]" : "left-[17px]")
  );
  const control = (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={e => {
        toggle();
        props.onClick?.(e);
      }}
      className={cn(track, className)}
    >
      <span aria-hidden className={thumb} />
    </button>
  );

  if (label == null) return control;
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer select-none items-center gap-2.5",
        disabled && "cursor-default opacity-55"
      )}
    >
      <span className="text-ink-1 text-tau-body">{label}</span>
      {control}
    </label>
  );
}
