import { flashcardsTranslator, flashcardsCount, useFlashcardsI18n } from "../../i18n";
import { Button, cn } from "@tau/ui";
import { Undo2 } from "lucide-react";
import { RATINGS } from "../../model";

import { RATING_TEXT, type Dist } from "../../reviewStyles";

export function DoneSummary({
  dist,
  reviewed,
  minutes,
  onUndo,
  onExit,
}: {
  dist: Dist;
  reviewed: number;
  minutes: number;
  onUndo?: () => void;
  onExit(): void;
}) {
  useFlashcardsI18n();
  const remembered = dist.normal + dist.easy;
  return (
    <div className="px-3 pt-6 pb-1.5 text-center">
      <div className="text-[22px] font-semibold tracking-[-0.01em]">
        {reviewed
          ? flashcardsTranslator.t("ui.reviewCompleted2")
          : flashcardsTranslator.t("ui.noCardsToReview")}
      </div>
      <p className="text-ink-2 mt-1.5">
        {reviewed
          ? flashcardsCount("review.summary", reviewed, {
              reviewed: reviewed,
              percent: Math.round((remembered / reviewed) * 100),
              minutes: minutes,
            })
          : flashcardsTranslator.t("ui.queueCleared")}
      </p>
      {reviewed > 0 && (
        <div className="mx-auto mt-[22px] grid max-w-[440px] grid-cols-4 gap-2.5">
          {RATINGS.map(r => (
            <div key={r.value} className="border-line-1 rounded-[12px] border px-1 py-2">
              <b className={cn("block text-[17px] tabular-nums", RATING_TEXT[r.value])}>
                {dist[r.value]}
              </b>
              <span className="text-ink-3 text-[11.5px]">{flashcardsTranslator.t(r.message)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-[22px] flex justify-center gap-2">
        {onUndo && (
          <Button variant="ghost" icon={Undo2} onClick={onUndo}>
            {flashcardsTranslator.t("ui.undoLastCard")}
          </Button>
        )}
        <Button variant="primary" onClick={onExit}>
          {flashcardsTranslator.t("ui.done")}
        </Button>
      </div>
    </div>
  );
}
