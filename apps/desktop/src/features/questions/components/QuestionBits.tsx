/**
 * 问题域小件：状态环（待探究 = 虚线空圈 / 探究中 = 半满 accent / 已解答 = ok 实心勾）、
 * 分组色点、材料构成计数。
 */

import { Check } from "lucide-react";
import { cn } from "@tau/ui";
import type { QuestionCompositionKind, QuestionStatus } from "@/types";
import { groupDotClass } from "@/utils/groupTone";
import { COMPOSITION_ORDER, STATUS_META, TARGET_META } from "../model";

export function StatusRing({
  status,
  size = "md",
  className,
}: {
  status: QuestionStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-label={STATUS_META[status].label}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full",
        size === "md" ? "size-4" : "size-[13px]",
        status === "not_started" && "border-ink-3 border-[1.5px] border-dashed",
        status === "in_progress" &&
          cn(
            "border-accent border-[1.5px] bg-clip-content",
            size === "md" ? "p-[2px]" : "p-[1.5px]",
            "bg-[conic-gradient(var(--tau-accent)_0_50%,transparent_50%_100%)]"
          ),
        status === "resolved" && "bg-ok text-ink-inverse",
        className
      )}
    >
      {status === "resolved" && (
        <Check className={size === "md" ? "size-2.5" : "size-2"} strokeWidth={3} />
      )}
    </span>
  );
}

export function GroupDot({ color, className }: { color?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-[7px] shrink-0 rounded-[2.5px]", groupDotClass(color), className)}
    />
  );
}

export function Composition({
  counts,
  className,
}: {
  counts: Partial<Record<QuestionCompositionKind, number>>;
  className?: string;
}) {
  const entries = COMPOSITION_ORDER.filter(type => counts[type]);
  if (!entries.length) return null;
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {entries.map(type => {
        const Icon = TARGET_META[type].icon;
        return (
          <span
            key={type}
            title={`${TARGET_META[type].label} ${counts[type]}`}
            className="text-ink-3 inline-flex items-center gap-[3px] text-[11.5px] tabular-nums"
          >
            <Icon className="size-3" strokeWidth={1.75} />
            {counts[type]}
          </span>
        );
      })}
    </span>
  );
}
