/**
 * Textarea —— 多行文本输入（与 Input 同形，mockups/input/ 方案 A）。
 *
 * 与 Input 共用形制语言（surface + line-1 + focus ring）；差异只有三点：
 * 多行布局、纵向起始对齐、maxLength 传值时右下角自动出计数器
 * （超限转 danger——超限即不可再输，计数是唯一提示，安静而确定）。
 * 错误态同样走原生 aria-invalid（视觉与读屏同源），文案归 Field 体系。
 */

import { useState, type ComponentProps } from "react";
import { cn } from "../../cn";

export interface TextareaProps extends ComponentProps<"textarea"> {
  /** 传值即在右下角渲染计数器（n / maxLength，超限转 danger） */
  maxLength?: number;
}

export function Textarea({
  className,
  onChange,
  defaultValue,
  maxLength,
  rows = 3,
  ...props
}: TextareaProps) {
  const [mirror, setMirror] = useState(() => String(defaultValue ?? "").length);
  const length = props.value !== undefined ? String(props.value).length : mirror;

  return (
    <div
      data-disabled={props.disabled || undefined}
      className={cn(
        "border-line-1 bg-surface group/textarea flex items-start gap-2",
        "rounded-tau-sm ease-tau-out w-full border transition-[border-color,box-shadow] duration-[160ms]",
        "hover:not-focus-within:border-ink-3/50 focus-within:border-accent focus-within:shadow-[var(--tau-focus-ring)]",
        "has-[[aria-invalid=true]]:border-danger has-[[aria-invalid=true]:hover]:border-danger",
        "has-[[aria-invalid=true]]:focus-within:border-danger",
        "has-[[aria-invalid=true]]:focus-within:shadow-[0_0_0_3px_var(--tau-danger-soft)]",
        "has-[textarea:read-only]:border-line-1 has-[textarea:read-only]:hover:border-line-1",
        "has-[textarea:read-only]:focus-within:border-line-1 has-[textarea:read-only]:focus-within:shadow-none",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-55",
        "p-2"
      )}
    >
      <textarea
        {...props}
        maxLength={maxLength}
        defaultValue={defaultValue}
        rows={rows}
        onChange={e => {
          setMirror(e.target.value.length);
          onChange?.(e);
        }}
        className={cn(
          "text-ink-1 placeholder:text-ink-3 min-h-16 min-w-0 flex-1 resize-none bg-transparent",
          "text-[13px] leading-[1.65] outline-none",
          "read-only:text-ink-2 read-only:cursor-default",
          "selection:bg-selected",
          className
        )}
      />
      {maxLength !== undefined && (
        <span
          aria-hidden
          className={cn(
            "text-ink-3 self-end px-0.5 pb-0.5 text-[11px] tabular-nums",
            length >= maxLength && "text-danger"
          )}
        >
          {length} / {maxLength}
        </span>
      )}
    </div>
  );
}
