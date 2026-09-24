import type { Flashcard, FlashcardReviewRating } from "@/types";
import { cn } from "@tau/ui";
import { RATINGS, formatSpan, nextInterval } from "../../model";

import { RATING_HOVER, RATING_RING, RATING_TEXT } from "../../reviewStyles";

export function RatingBar({
  card,
  suggestion,
  busy,
  onRate,
}: {
  card: Flashcard;
  suggestion: FlashcardReviewRating | null;
  busy: boolean;
  onRate(rating: FlashcardReviewRating): void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {RATINGS.map(r => (
        <button
          key={r.value}
          type="button"
          disabled={busy}
          onClick={() => onRate(r.value)}
          className={cn(
            "bg-surface shadow-card ease-tau-out relative flex flex-col items-center gap-px rounded-[12px] px-1.5 pb-2 pt-[9px] outline-none transition-[background,transform] duration-150 focus-visible:shadow-[var(--tau-focus-ring)] active:translate-y-px disabled:opacity-60",
            RATING_HOVER[r.value],
            suggestion === r.value && cn("ring-[1.5px] ring-inset", RATING_RING[r.value])
          )}
        >
          <kbd className="bg-hover text-ink-2 absolute right-2 top-[7px] rounded-[4px] px-1 font-mono text-[10px] leading-4">
            {r.key}
          </kbd>
          <b className={cn("text-[13.5px] font-semibold", RATING_TEXT[r.value])}>{r.label}</b>
          <span className="text-ink-2 text-[11.5px] tabular-nums">
            {formatSpan(nextInterval(card, r.value))}后
          </span>
        </button>
      ))}
    </div>
  );
}
