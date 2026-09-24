import DeckIcon from "@/components/DeckIcon";
import type { FlashcardDeck } from "@/types";
import { cn } from "@tau/ui";
import { TONE_MARK, deckTone } from "../deckColors";

const MARK_SIZE = {
  xs: "size-4 rounded-[5px] [&_svg]:size-[10px]",
  sm: "size-5 rounded-[6px] [&_svg]:size-3",
  md: "size-7 rounded-[9px] [&_svg]:size-4",
  lg: "size-11 rounded-[13px] [&_svg]:size-[22px]",
} as const;

export function DeckMark({
  deck,
  size = "md",
  className,
}: {
  deck: Pick<FlashcardDeck, "emoji" | "coverColor">;
  size?: keyof typeof MARK_SIZE;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center leading-none",
        TONE_MARK[deckTone(deck.coverColor)],
        MARK_SIZE[size],
        className
      )}
    >
      <DeckIcon emoji={deck.emoji} />
    </span>
  );
}
