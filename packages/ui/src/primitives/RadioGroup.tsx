/**
 * RadioGroup —— 单选组（Input 方案 A 语言，mockups/radio/，2026-09-19 定稿）。
 *
 * fieldset/legend 承载组语义，原生 radio 组行为白送：Tab 一次进组（选中项/
 * 首个可用项）、方向键移动即选择、组内互斥。组合式 children（描述行只有
 * 组合式能表达，antd options 数据驱动不采）；排布两档 orientation，legend
 * 随流向排（横向在行首、纵向独占一行）。
 *
 * 组级 disabled 走 fieldset[disabled]（浏览器原生向内传播 :disabled，
 * Radio 的单项降透明随之生效）；name 默认 useId 生成，可显式覆盖（表单提交）。
 */

import { createContext, useId, useState, type ReactNode } from "react";
import { cn } from "../cn";

/** 组内受控通道：Radio 消费（name/当前值/回报）；组外 Radio 退化为裸原生 radio */
export const RadioGroupContext = createContext<{
  name: string;
  value: string | null;
  onValueChange: (value: string) => void;
} | null>(null);

export interface RadioGroupProps<Value extends string> {
  /** 组名（legend，读屏必读；默认可见） */
  label: ReactNode;
  value?: Value;
  defaultValue?: Value;
  onValueChange?: (value: Value) => void;
  orientation?: "horizontal" | "vertical";
  /** radio 组提交名（默认 useId 自动生成；覆盖时须全应用内唯一） */
  name?: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

export function RadioGroup<Value extends string>({
  label,
  value: valueProp,
  defaultValue,
  onValueChange,
  orientation = "horizontal",
  name: nameProp,
  disabled,
  children,
  className,
}: RadioGroupProps<Value>) {
  const autoName = useId();
  const [internal, setInternal] = useState<Value | undefined>(defaultValue);
  const value = valueProp ?? internal ?? null;

  return (
    <fieldset
      disabled={disabled}
      className={cn(
        "min-w-0",
        orientation === "vertical"
          ? "flex flex-col items-start gap-2.5"
          : "flex flex-wrap gap-x-5 gap-y-2.5",
        className
      )}
    >
      <legend className="text-ink-2 text-tau-meta mb-2.5 font-medium">{label}</legend>
      <RadioGroupContext.Provider
        value={{
          name: nameProp ?? autoName,
          value,
          onValueChange: next => {
            setInternal(next as Value);
            onValueChange?.(next as Value);
          },
        }}
      >
        {children}
      </RadioGroupContext.Provider>
    </fieldset>
  );
}
