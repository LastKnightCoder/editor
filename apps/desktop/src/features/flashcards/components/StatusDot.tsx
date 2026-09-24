import type { FlashcardStatus } from "@/types";
import { cn } from "@tau/ui";
import { STATUS_LABEL } from "../model";

const STATUS_DOT: Record<FlashcardStatus, string> = {
  new: "bg-info",
  learning: "bg-warn",
  review: "bg-ok",
  suspended: "bg-ink-3",
};

export function StatusDot({ status }: { status: FlashcardStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px]",
        status === "suspended" ? "text-ink-3" : "text-ink-2"
      )}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}
