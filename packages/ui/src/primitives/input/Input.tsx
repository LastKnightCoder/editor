/**
 * Input —— 文本输入基础件（方案 A「经典描边」，mockups/input/，2026-09-19 定稿）。
 *
 * 形制：surface 亮底 + line-1 描边 + radius-sm——「浮起物」语感（2026-09-17 表单
 * 控件口径），与 Select / DatePicker 触发器同族同皮；focus = accent 描边 + 3px ring。
 * 原生 input 零样式透传（IME / autofill / 无障碍白送），形制挂容器上。
 *
 * 状态语义：
 *  - 错误态正源是原生 aria-invalid（无 status prop）：容器经 has- 变体换 danger
 *    描边 / danger-soft ring——视觉与读屏语义锁死在同一属性上；判定（zod）与
 *    错误文案（Field 体系框外）、touched 策略都归表单层
 *  - 只读：框在、精气神收掉——readOnly 透传后文字转 ink-2、光标 default、
 *    hover/focus 零响应（仍可选中复制）；禁用 = 原生 disabled + 整体降透明
 *
 * 槽位：lead 前缀 icon（16px lucide，focus 转 accent-text）+ clearable 清空 ×
 * （容器 hover/focus 且有值时显现——visibility:hidden 不响应自身 hover，挂容器；
 * tabIndex=-1 不抢 Tab 流，清空后焦点留在输入框）。
 * 文本后缀 / addon 组合等装备位归后续裁决（mockups 方案 D），不预置。
 */

import { useRef, useState, type ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { cn } from "../../cn";
import { mergeRefs } from "../mergeRefs";

export interface InputProps extends Omit<ComponentProps<"input">, "size"> {
  /** 前缀 icon（16px lucide；focus 时转 accent-text） */
  lead?: LucideIcon;
  /** 有值时容器 hover/focus 显现清空 ×；点击清空并保留焦点 */
  clearable?: boolean;
  size?: "sm" | "md";
  /** 形态：outlined（默认，亮底描边浮起物）| bare（无皮行内形态——无边框背景与
   *  focus 反馈，高度与选中表现归宿主，如行内编辑单元格） */
  variant?: "outlined" | "bare";
  /** 外框容器的类名（默认 w-full 撑满）：定宽 / flex 伸缩等布局写这里；
   *  className 落到内部 <input>（文字对齐、字号等） */
  wrapperClassName?: string;
}

/** 受控清空：走原生 setter + input 事件，受控 onChange 自然触发（焦点留在输入框） */
function clearInputElement(el: HTMLInputElement) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(el, "");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
}

export function Input({
  lead: Lead,
  clearable = false,
  size = "md",
  variant = "outlined",
  className,
  wrapperClassName,
  onChange,
  defaultValue,
  ref,
  ...props
}: InputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // 非受控时镜像有值态驱动 ×；受控时以 value 为准
  const [mirror, setMirror] = useState(() => String(defaultValue ?? "") !== "");
  const hasValue = props.value !== undefined ? String(props.value) !== "" : mirror;

  return (
    <div
      data-disabled={props.disabled || undefined}
      className={cn(
        "group/input flex w-full items-center gap-2",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-55",
        variant === "outlined" &&
          cn(
            "border-line-1 bg-surface",
            "rounded-tau-sm ease-tau-out border transition-[border-color,box-shadow] duration-[160ms]",
            "hover:not-focus-within:border-ink-3/50 focus-within:border-accent focus-within:shadow-[var(--tau-focus-ring)]",
            // 错误态：正源 aria-invalid（挂在 input 上，容器经 has- 响应）
            "has-[[aria-invalid=true]]:border-danger has-[[aria-invalid=true]:hover]:border-danger",
            "has-[[aria-invalid=true]]:focus-within:border-danger",
            "has-[[aria-invalid=true]]:focus-within:shadow-[0_0_0_3px_var(--tau-danger-soft)]",
            // 只读：框在、零响应——:read-only 必须限定 input，否则容器里的 span/button
            // （任意不可编辑元素）会让 :has() 恒真，盖掉全部 focus 效果
            "has-[input:read-only]:border-line-1 has-[input:read-only]:hover:border-line-1",
            "has-[input:read-only]:focus-within:border-line-1 has-[input:read-only]:focus-within:shadow-none",
            size === "sm" ? "h-[28px] pl-2.5 pr-[3px]" : "h-[34px] pl-3 pr-1"
          ),
        wrapperClassName
      )}
    >
      {Lead && (
        <Lead
          className={cn(
            "text-ink-3 pointer-events-none size-[15px] shrink-0",
            "group-focus-within/input:text-accent-text"
          )}
        />
      )}
      <input
        {...props}
        ref={mergeRefs(ref, el => {
          inputRef.current = el;
        })}
        defaultValue={defaultValue}
        onChange={e => {
          setMirror(e.target.value !== "");
          onChange?.(e);
        }}
        className={cn(
          "text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[13px] outline-none",
          "read-only:text-ink-2 read-only:cursor-default",
          "selection:bg-selected",
          size === "sm" && "text-tau-sm",
          className
        )}
      />
      {clearable && (
        <button
          type="button"
          aria-label="清空"
          tabIndex={-1}
          hidden={!hasValue}
          onClick={() => inputRef.current && clearInputElement(inputRef.current)}
          className={cn(
            "text-ink-3 hover:bg-hover hover:text-ink-1 invisible grid size-[22px] shrink-0 place-items-center rounded-[6px]",
            "group-focus-within/input:visible group-hover/input:visible",
            "outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
          )}
        >
          <X className="size-[13px]" />
        </button>
      )}
    </div>
  );
}
