import { flashcardsTranslator, useFlashcardsI18n } from "../../i18n";
import type { Flashcard } from "@/types";
import { cn } from "@tau/ui";
import { submitsOnPick } from "../../model";
import { MOD } from "../../overlay";
import { LETTERS } from "../../reviewStyles";

export function KeyHints({
  card,
  revealed,
  className,
}: {
  card: Flashcard;
  revealed: boolean;
  className?: string;
}) {
  useFlashcardsI18n();
  const last =
    card.type === "boolean" ? "B" : LETTERS[Math.max(0, (card.data.options?.length ?? 1) - 1)];
  const items = revealed
    ? [
        ["1–4", flashcardsTranslator.t("ui.rate")],
        ["Space", flashcardsTranslator.t("ui.useRecommendation")],
        [`${MOD}Z`, flashcardsTranslator.t("ui.undoPrevious")],
        ["E", flashcardsTranslator.t("ui.edit")],
        ["Esc", flashcardsTranslator.t("ui.finish")],
      ]
    : submitsOnPick(card)
      ? [
          [`A–${last}`, flashcardsTranslator.t("ui.selectToSubmit")],
          ["Space", flashcardsTranslator.t("ui.revealAnswer")],
          ["S", flashcardsTranslator.t("ui.suspendCard")],
          ["Esc", flashcardsTranslator.t("ui.finish")],
        ]
      : [
          ["A–D", flashcardsTranslator.t("ui.select")],
          ["↵", flashcardsTranslator.t("ui.submit")],
          ["Space", flashcardsTranslator.t("ui.showAnswer")],
          ["S", flashcardsTranslator.t("ui.suspendCard")],
          ["Esc", flashcardsTranslator.t("ui.finish")],
        ];
  return (
    <div
      className={cn(
        "text-ink-3 mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]",
        className
      )}
    >
      {items.map(([k, label]) => (
        <span key={k} className="inline-flex items-center gap-1">
          <kbd className="bg-hover text-ink-2 rounded-[4px] px-1 font-mono text-[10.5px] leading-4">
            {k}
          </kbd>
          {label}
        </span>
      ))}
    </div>
  );
}
