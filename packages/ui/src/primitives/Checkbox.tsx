/**
 * Checkbox —— 勾选基础件（Input 方案 A「经典描边」语言，mockups/checkbox/，2026-09-19 定稿）。
 *
 * 原生 input[type=checkbox] 承载语义（appearance-none 自绘皮）：label 点击切换、
 * Space 原生支持、读屏语义白送。「浮起物」：16×16 视觉格 surface + line-1，
 * 选中转 accent 实底 + 反色勾（110ms 淡入，唯一的固定反馈——无动效 prop）。
 *
 * 结构铁律：input / 格子 / 勾图标必须在同一层互为兄弟——Tailwind 的 peer-* 变体
 * 只匹配 peer 的后续兄弟（`~ *`），挂在深层后代上会静默失效（勾选后无任何视觉）。
 * 状态语义（与 Input 裁决同源）：
 *  - 命中 24×24（input 绝对定位撑满锚格，宪法下限）；focus-visible 才显 ring
 *    （锚格经 has- 变体响应，因锚是 input 的父级而非兄弟）
 *  - hover 描边加深半档（未选中 ink-3/50 / 选中 accent-hover），聚焦时让位
 *  - indeterminate 半选（accent 实底 + 横线）：DOM 属性驱动，联动逻辑归调用方
 *  - 错误态正源 aria-invalid（未选中 danger；选中/半选保持 accent）；禁用降透明
 */

import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "../cn";
import { mergeRefs } from "./mergeRefs";

export interface CheckboxProps extends Omit<ComponentProps<"input">, "type"> {
  /** 可选：渲染关联 label（点文字切换）；不传则裸勾选框 */
  label?: ReactNode;
  /** 半选视觉态（DOM 属性驱动；点击行为仍由调用方决定全选/清空） */
  indeterminate?: boolean;
}

export function Checkbox({
  label,
  indeterminate = false,
  className,
  disabled,
  ref,
  ...props
}: CheckboxProps) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  // indeterminate 无对应 attribute，只能经 DOM 属性设置（checked 变化后也要重设）
  useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate, props.checked, props.defaultChecked]);

  return (
    <label className="group/cb inline-flex cursor-pointer select-none items-center gap-2 has-[:disabled]:cursor-default">
      <span
        className={cn(
          "relative inline-grid size-6 shrink-0 place-items-center",
          // 锚是 input 的父级（非兄弟），ring/disabled 走 has- 变体
          "rounded-[6px] has-[:focus-visible]:shadow-[var(--tau-focus-ring)]",
          "has-[:disabled]:pointer-events-none has-[:disabled]:opacity-55"
        )}
      >
        {/* input 在最前：格子与图标是它的后续兄弟，peer-* 变体才可达 */}
        <input
          {...props}
          type="checkbox"
          disabled={disabled}
          ref={mergeRefs(ref, el => {
            innerRef.current = el;
          })}
          className={cn(
            "peer absolute inset-0 cursor-pointer opacity-0",
            "disabled:cursor-default",
            className
          )}
        />
        <span
          className={cn(
            "bg-surface border-line-1 grid size-4 place-items-center rounded-[4.5px] border-[1.5px]",
            "ease-tau-out transition-[background-color,border-color] duration-[130ms]",
            "group-hover/cb:peer-not-focus-visible:border-ink-3/50",
            "peer-checked:border-accent peer-checked:bg-accent",
            "peer-checked:group-hover/cb:bg-accent-hover peer-checked:group-hover/cb:border-accent-hover",
            "peer-indeterminate:border-accent peer-indeterminate:bg-accent",
            // 错误态正源 aria-invalid：未选中 → danger；选中/半选保持 accent（选中优先）
            "peer-[&[aria-invalid=true]]:border-danger",
            "peer-checked:peer-[&[aria-invalid=true]]:border-accent",
            "peer-indeterminate:peer-[&[aria-invalid=true]]:border-accent"
          )}
        />
        <Check
          aria-hidden
          strokeWidth={2.5}
          className={cn(
            "text-ink-inverse pointer-events-none absolute size-3 scale-75 opacity-0",
            "ease-tau-out transition-[opacity,transform] duration-[110ms]",
            "peer-checked:scale-100 peer-checked:opacity-100"
          )}
        />
        <Minus
          aria-hidden
          strokeWidth={2.5}
          className={cn(
            "text-ink-inverse pointer-events-none absolute size-3 opacity-0",
            "peer-indeterminate:opacity-100"
          )}
        />
      </span>
      {label != null && <span className="text-ink-1 text-tau-body">{label}</span>}
    </label>
  );
}
