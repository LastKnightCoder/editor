import { flashcardsTranslator, flashcardsCount, useFlashcardsI18n } from "../i18n";
import type { FlashcardReviewStats } from "@/types";
import { cn } from "@tau/ui";
import { RATINGS } from "../model";

import { RATING_BG } from "../reviewStyles";
import { Block } from "./Block";
import { ForecastChart } from "./ForecastChart";
export function OverviewSide({
  reviewStats,
  forecast,
  now,
}: {
  reviewStats: FlashcardReviewStats | null;
  forecast: number[];
  now: number;
}) {
  useFlashcardsI18n();
  const total = reviewStats?.total ?? 0;
  const remembered = reviewStats ? reviewStats.ratings.normal + reviewStats.ratings.easy : 0;
  return (
    <div className="flex flex-col gap-[22px] px-5 pt-[18px] pb-5">
      <Block
        title={flashcardsTranslator.t("ui.last7Days2")}
        meta={flashcardsCount("count.ratings", total)}
      >
        {total > 0 && reviewStats ? (
          <>
            <div className="text-ink-2 text-[13px]">
              <b className="text-ink-1 mr-1 text-[18px] font-semibold tabular-nums">
                {Math.round((remembered / total) * 100)}%
              </b>
              {flashcardsTranslator.t("ui.rememberedRememberedEasy")}
            </div>
            <div className="mt-2.5 flex h-2 gap-[1.5px] overflow-hidden rounded-full">
              {RATINGS.map(r => (
                <i
                  key={r.value}
                  className={cn("block h-full", RATING_BG[r.value])}
                  style={{ width: `${(reviewStats.ratings[r.value] / total) * 100}%` }}
                />
              ))}
            </div>
            <div className="text-ink-2 mt-2 grid grid-cols-4 gap-1 text-[11px]">
              {RATINGS.map(r => (
                <span key={r.value} className="inline-flex items-center gap-1.5">
                  <i className={cn("size-2 rounded-[2.5px]", RATING_BG[r.value])} />
                  {flashcardsTranslator.t(r.message)}
                  <span className="text-ink-3 tabular-nums">{reviewStats.ratings[r.value]}</span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-ink-3 text-[12px]">
            {flashcardsTranslator.t("ui.noReviewsOverTheLast7Days")}
          </p>
        )}
      </Block>
      <Block title={flashcardsTranslator.t("ui.dueOverTheNext7Days")}>
        <ForecastChart values={forecast} now={now} />
      </Block>
    </div>
  );
}
