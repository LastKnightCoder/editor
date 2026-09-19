/**
 * ⚠️ 占位迁移（未经设计稿评审）：原 primitives/Choice.tsx 中 RadioGroup 的原样
 * 搬迁——Choice.tsx 已按 Checkbox / Switch 各自定稿重写而拆除，Radio 尚无设计稿。
 * 待 Radio 形制定稿后整体重做（届时本导出名与 API 均可能变化），在此之前请勿
 * 在此基础上加能力。
 */

import { useId, type ReactNode } from "react";
import { cn } from "../cn";

export function RadioGroup<Value extends string>({
  value,
  onValueChange,
  options,
  label,
  disabled,
}: {
  value: Value;
  onValueChange: (value: Value) => void;
  label: string;
  disabled?: boolean;
  options: readonly { value: Value; label: ReactNode }[];
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className="flex flex-wrap gap-3">
      <legend className="sr-only">{label}</legend>
      {options.map(option => (
        <label
          key={option.value}
          className="text-ink-1 text-tau-body flex cursor-pointer items-center gap-2"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onValueChange(option.value)}
            className={cn("accent-[var(--tau-accent)]")}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
