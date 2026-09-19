/**
 * Radio —— 单选基础件（Input 方案 A「经典描边」语言，mockups/radio/，2026-09-19 定稿）。
 *
 * 原生 input[type=radio] 承载语义（appearance-none 自绘皮）：组内互斥、
 * 方向键移动即选择、读屏语义白送。形制是 Checkbox 的圆形同构：16×16 视觉圆
 * surface + line-1，选中 = 描边转 accent + 中心 accent 实点（110ms 缩放进场）。
 *
 * 结构铁律（同 Checkbox）：input / 圆环 / 中心点在同一层互为兄弟——peer-*
 * 变体只匹配 peer 的后续兄弟，深层后代会静默失效。状态语义（与 Input 裁决
 * 同源）：
 *  - 命中 24×24；focus-visible 才显 ring；hover 描边加深半档，聚焦时让位
 *  - 错误态正源 aria-invalid（未选中 danger），选中压过错误（选中优先）
 *  - 禁用：label 整项降透明 55%（fieldSet 组禁用时经 :disabled 传播同样生效）
 *
 * 单项不单独成组：须包在 RadioGroup 内（经 context 取 name/受控值），脱离组
 * 使用时自传 name，checked/defaultChecked/onChange 走原生透传。
 */

import { type ComponentProps, type ReactNode, useContext } from "react";
import { cn } from "../cn";
import { RadioGroupContext } from "./RadioGroup";

export interface RadioProps extends Omit<ComponentProps<"input">, "type"> {
  /** 选项值（组内唯一；选中态 = RadioGroup.value 等于此值） */
  value: string;
  /** 主标签（点文字同选；组内忽略 checked 类受控 prop，值归组） */
  label?: ReactNode;
  /** 描述行（label 下方两行排布，顶对齐；说明性文案走 tau-meta 下限） */
  description?: ReactNode;
}

export function Radio({ value, label, description, className, disabled, ...props }: RadioProps) {
  const group = useContext(RadioGroupContext);

  const handleChange: ComponentProps<"input">["onChange"] = event => {
    props.onChange?.(event);
    if (group && event.target.checked) group.onValueChange(value);
  };

  return (
    <label
      className={cn(
        "group/rd inline-flex cursor-pointer select-none gap-2",
        // 描述行顶对齐与单行居中互斥，走 JS 三元（同传会被 tailwind-merge 判组留一）
        description == null ? "items-center" : "items-start",
        "has-[:disabled]:cursor-default has-[:disabled]:opacity-55"
      )}
    >
      <span
        className={cn(
          "relative inline-grid size-6 shrink-0 place-items-center",
          // 锚是 input 的父级（非兄弟），ring/禁用走 has- 变体
          "rounded-full has-[:focus-visible]:shadow-[var(--tau-focus-ring)]",
          "has-[:disabled]:pointer-events-none"
        )}
      >
        {/* input 在最前：圆环与中心点是它的后续兄弟，peer-* 变体才可达 */}
        <input
          {...props}
          type="radio"
          value={value}
          name={group?.name ?? props.name}
          disabled={disabled}
          onChange={handleChange}
          {...(group ? { checked: group.value === value } : {})}
          className={cn(
            "peer absolute inset-0 cursor-pointer opacity-0",
            "disabled:cursor-default",
            className
          )}
        />
        <span
          className={cn(
            "border-line-1 bg-surface grid size-4 place-items-center rounded-full border-[1.5px]",
            "ease-tau-out transition-[background-color,border-color] duration-[130ms]",
            "group-hover/rd:peer-not-focus-visible:border-ink-3/50",
            "peer-checked:border-accent",
            "peer-checked:group-hover/rd:peer-not-focus-visible:border-accent-hover",
            // 错误态正源 aria-invalid：未选中 → danger；选中保持 accent（选中优先）
            "peer-[&[aria-invalid=true]]:border-danger",
            "peer-checked:peer-[&[aria-invalid=true]]:border-accent"
          )}
        />
        <span
          aria-hidden
          className={cn(
            "bg-accent pointer-events-none absolute size-[7px] rounded-full",
            "ease-tau-out transition-[opacity,transform,background-color] duration-[110ms]",
            "scale-[0.4] opacity-0",
            "peer-checked:scale-100 peer-checked:opacity-100",
            "peer-checked:group-hover/rd:peer-not-focus-visible:bg-accent-hover"
          )}
        />
      </span>
      {(label != null || description != null) && (
        <span className="flex min-w-0 flex-col gap-px">
          {label != null && <span className="text-ink-1 text-tau-body">{label}</span>}
          {description != null && (
            <span className="text-ink-3 text-tau-meta leading-[1.55]">{description}</span>
          )}
        </span>
      )}
    </label>
  );
}
