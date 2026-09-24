import type { Flashcard } from "@/types";
import { cn } from "@tau/ui";
import { dueText } from "../model";

export function DueLabel({ card, now }: { card: Flashcard; now: number }) {
  const { text, tone } = dueText(card, now);
  return (
    <span
      className={cn(
        "whitespace-nowrap text-[11.5px] tabular-nums",
        tone === "late" && "text-danger font-medium",
        tone === "now" && "text-accent-text font-medium",
        (tone === "later" || tone === "muted") && "text-ink-3"
      )}
    >
      {text}
    </span>
  );
}
