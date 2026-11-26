import { flashcardsTranslator, useFlashcardsI18n } from "../i18n";
import type { FlashcardType } from "@/types";
import { cn } from "@tau/ui";
import { TYPE_MESSAGE } from "../model";

import { TYPE_ICON } from "../typeIcons";

export function TypeChip({ type, className }: { type: FlashcardType; className?: string }) {
  useFlashcardsI18n();
  const Icon = TYPE_ICON[type];
  return (
    <span
      className={cn(
        "bg-hover text-ink-2 inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-[6px] px-1.5 text-[11px]",
        className
      )}
    >
      <Icon className="size-[11px]" strokeWidth={1.75} />
      {flashcardsTranslator.t(TYPE_MESSAGE[type])}
    </span>
  );
}
