/**
 * Segmented —— 分段单选器（Input 家族「连体描边」语言，mockups/segmented/，2026-09-23 定稿）。
 *
 * 02 规范 §5.2 裁决的 Tabs 官定替代：内容形态切换（字段不同构）用分段，值切换
 * （字段同构）用 Select。容器是一枚 hairline 控件（surface + line-1，与 Input /
 * Select 触发器同皮），段间 hairline 分割；激活段 accent-soft 轻染 + accent-text
 * ——零轨道、零滑块、零投影（凹槽深底形态已否决，见 mockups/segmented/ 头注）。
 *
 * 原生 input[type=radio] 承载语义（隐藏自绘皮）：组内互斥、方向键移动即选择、
 * Tab 一次进组白送。状态纪律同 Input 家族：hover 淡墨只落未选段（不冲淡激活染）、
 * press 加深一档、focus-visible 才显 ring（inset 2px 不被容器圆角裁切）。
 * 段数口径 2–5，再多该用 Select；图标段与纯图标段（label 省略，aria-label 必填）
 * 均支持。复合组件 Segmented.Item 须包在 Segmented 内（经 context 取 name/受控值）。
 */

import {
  createContext,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
  useContext,
} from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../cn";

/** 组内受控通道：Item 消费（name/当前值/尺寸/组禁用）；组外 Item 退化为裸 radio */
const SegmentedContext = createContext<{
  name: string;
  value: string | null;
  size: "sm" | "md";
  disabled: boolean;
  onValueChange: (value: string) => void;
} | null>(null);

export interface SegmentedProps<Value extends string> {
  /** 组名（aria-label，读屏必读；不渲染可见标签——分段器的上下文由摆放位置给出） */
  label: string;
  value?: Value;
  defaultValue?: Value;
  onValueChange?: (value: Value) => void;
  size?: "sm" | "md";
  /** 组级禁用（压过单项）；单项禁用走 Item 的 disabled */
  disabled?: boolean;
  /** radio 组提交名（默认 useId 自动生成；覆盖时须全应用内唯一） */
  name?: string;
  className?: string;
  children: ReactNode;
}

export function SegmentedRoot<Value extends string>({
  label,
  value: valueProp,
  defaultValue,
  onValueChange,
  size = "sm",
  disabled,
  name: nameProp,
  className,
  children,
}: SegmentedProps<Value>) {
  const autoName = useId();
  const [internal, setInternal] = useState<Value | undefined>(defaultValue);
  const value = valueProp ?? internal ?? null;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "border-line-1 bg-surface rounded-tau-sm inline-flex items-stretch border",
        size === "md" && "rounded-[9px]",
        className
      )}
    >
      <SegmentedContext.Provider
        value={{
          name: nameProp ?? autoName,
          value,
          size,
          disabled: Boolean(disabled),
          onValueChange: next => {
            setInternal(next as Value);
            onValueChange?.(next as Value);
          },
        }}
      >
        {children}
      </SegmentedContext.Provider>
    </div>
  );
}

export interface SegmentedItemProps extends Omit<
  ComponentProps<"input">,
  "type" | "value" | "name" | "checked" | "defaultChecked"
> {
  /** 段值（组内唯一；选中态 = Segmented.value 等于此值） */
  value: string;
  /** 段文字；省略时为纯图标段，aria-label 必填 */
  label?: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
}

export function SegmentedItem({
  value,
  label,
  icon: Icon,
  disabled,
  className,
  ...props
}: SegmentedItemProps) {
  const group = useContext(SegmentedContext);

  const handleChange: ComponentProps<"input">["onChange"] = event => {
    props.onChange?.(event);
    if (group && event.target.checked) group.onValueChange(value);
  };

  return (
    <label
      className={cn(
        "text-ink-2 text-tau-sm relative inline-flex h-[26px] cursor-pointer items-center gap-1.5 px-[14px] font-medium",
        "ease-tau-out select-none transition-[background-color,color] duration-[160ms]",
        "border-line-1 [&+&]:border-l",
        // 首末段内圆角贴容器（外 radius 8/9 − 1px 描边）：激活染/hover 底不溢出圆角
        "first:rounded-l-[7px] last:rounded-r-[7px]",
        // hover/press 只落未选段：激活染不被冲淡（checked 判定走 :has，任意变体保序确定）
        "hover:[&:not(:has(:checked))]:bg-hover hover:[&:not(:has(:checked))]:text-ink-1",
        "active:[&:not(:has(:checked))]:bg-press",
        "has-[:checked]:bg-accent-soft has-[:checked]:text-accent-text has-[:checked]:font-semibold",
        "has-[:disabled]:pointer-events-none has-[:disabled]:opacity-55",
        group?.size === "md" &&
          "text-tau-meta h-[32px] px-[16px] first:rounded-l-[8px] last:rounded-r-[8px]",
        label == null && "px-2",
        className
      )}
    >
      <input
        {...props}
        type="radio"
        value={value}
        name={group?.name}
        disabled={disabled || group?.disabled}
        onChange={handleChange}
        {...(group ? { checked: group.value === value } : {})}
        className="peer absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
      />
      {/* ring 画在段内 inset 2px：不被容器 overflow 圆角裁切，peer 聚焦才显 */}
      <span
        aria-hidden
        className="pointer-events-none invisible absolute inset-[2px] rounded-[5px] shadow-[var(--tau-focus-ring)] peer-focus-visible:visible"
      />
      {Icon && (
        <Icon
          size={label == null ? 15 : group?.size === "md" ? 14 : 13}
          strokeWidth={1.75}
          className="shrink-0"
        />
      )}
      {label != null && <span className="min-w-0 truncate">{label}</span>}
    </label>
  );
}

export const Segmented = Object.assign(SegmentedRoot, { Item: SegmentedItem });
