// 任务圆形复选框（v2 模板）：勾选时 360° 旋转 + 弹性打勾动画。

import { Check } from "lucide-react";

type TodoCheckProps = {
  checked: boolean;
  onToggle: (next: boolean) => void;
  small?: boolean;
};

export function TodoCheck({ checked, onToggle, small = false }: TodoCheckProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={event => {
        event.stopPropagation();
        onToggle(!checked);
      }}
      className={`grid shrink-0 place-items-center rounded-full border-2 ${
        small ? "h-4 w-4" : "h-[22px] w-[22px]"
      } ${checked ? "text-ink-inverse border-transparent" : "border-ink-3 text-transparent"}`}
      style={{
        background: checked ? "var(--tau-accent)" : undefined,
        transform: checked ? "rotate(360deg)" : undefined,
        boxShadow: checked ? "var(--tau-shadow-lift)" : undefined,
        transition: "all 0.25s var(--ease-bounce)",
      }}
    >
      <Check
        size={small ? 9 : 12}
        strokeWidth={3.4}
        aria-hidden="true"
        style={{
          opacity: checked ? 1 : 0,
          transform: checked ? "scale(1)" : "scale(0.3)",
          transition: "all 0.22s var(--ease-bounce)",
        }}
      />
    </button>
  );
}
