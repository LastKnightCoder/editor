import { cn } from "@tau/ui";
import type { SubmissionCounts, SubmissionStatus } from "../../../../contracts";

export type StatusOption = { value: SubmissionStatus | null; label: string };

/** 状态筛选：带计数的药丸按钮组（选项少且需要同时看到计数，不收进菜单） */
export function StatusFilter({
  options,
  value,
  counts,
  onChange,
}: {
  options: StatusOption[];
  value: SubmissionStatus | null;
  counts: SubmissionCounts | undefined;
  onChange: (value: SubmissionStatus | null) => void;
}) {
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : undefined;
  return (
    <div role="group" aria-label="按状态筛选" className="flex flex-wrap gap-1.5">
      {options.map(option => {
        const active = option.value === value;
        const count = option.value ? counts?.[option.value] : total;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "text-tau-sm inline-flex h-7 items-center gap-1.5 rounded-full border px-3 transition-colors",
              active
                ? "bg-ink-1 text-ink-inverse border-transparent"
                : "border-line-1 bg-surface text-ink-2 hover:bg-surface-hover"
            )}
          >
            {option.label}
            {count !== undefined && <span className="text-tau-micro opacity-70">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
