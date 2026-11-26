import { calendarDate } from "../format";
import {
  flashcardsTranslator,
  flashcardsCount,
  flashcardsDisplayContext,
  useFlashcardsI18n,
} from "../i18n";
import type { FlashcardType } from "@/types";
import { TYPE_MESSAGE, TYPE_ORDER, dayDiff, type DeckStats } from "../model";
import { MixBar } from "./FlashcardBits";

import { Block } from "./Block";
import { ForecastChart } from "./ForecastChart";
import { Legend } from "./Legend";
export function DeckSide({
  stats,
  typeCounts,
  now,
  createTime,
}: {
  stats: DeckStats;
  typeCounts: Map<FlashcardType, number>;
  now: number;
  createTime: number;
}) {
  useFlashcardsI18n();
  const maxType = Math.max(1, ...typeCounts.values());
  const lastDays = stats.lastReviewTime == null ? null : -dayDiff(stats.lastReviewTime, now);
  const created = new Date(createTime);
  return (
    <div className="flex flex-col gap-[22px] px-5 pt-[18px] pb-5">
      <Block
        title={flashcardsTranslator.t("ui.cardComposition")}
        meta={flashcardsCount("count.cards", stats.total)}
      >
        {stats.total > 0 && <MixBar stats={stats} />}
        <Legend
          items={[
            ["bg-info", flashcardsCount("stats.new", stats.fresh)],
            ["bg-warn", flashcardsCount("stats.learning", stats.learning)],
            ["bg-ok", flashcardsCount("stats.review", stats.review)],
            ...(stats.suspended
              ? ([["bg-ink-3", flashcardsCount("stats.suspended", stats.suspended)]] as [
                  string,
                  string,
                ][])
              : []),
          ]}
        />
      </Block>
      <Block title={flashcardsTranslator.t("ui.questionType")}>
        <div className="flex flex-col gap-1.5">
          {TYPE_ORDER.map(type => {
            const n = typeCounts.get(type) ?? 0;
            return (
              <div
                key={type}
                className="text-ink-2 grid grid-cols-[40px_1fr_24px] items-center gap-2.5 text-[12px]"
              >
                <span>{flashcardsTranslator.t(TYPE_MESSAGE[type])}</span>
                <span className="bg-track h-1.5 overflow-hidden rounded-full">
                  <i
                    className="bg-ink-3 block h-full rounded-full"
                    style={{ width: `${(n / maxType) * 100}%` }}
                  />
                </span>
                <b className="text-right font-medium tabular-nums">{n}</b>
              </div>
            );
          })}
        </div>
      </Block>
      <Block title={flashcardsTranslator.t("ui.dueOverTheNext7Days")}>
        <ForecastChart values={stats.forecast} now={now} />
      </Block>
      <Block title={flashcardsTranslator.t("ui.history")}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[12.5px]">
          <dt className="text-ink-3">{flashcardsTranslator.t("ui.lastReview")}</dt>
          <dd className="text-right tabular-nums">
            {lastDays == null
              ? "—"
              : lastDays <= 0
                ? flashcardsTranslator.t("ui.today")
                : flashcardsCount("stats.daysAgo", lastDays)}
          </dd>
          <dt className="text-ink-3">{flashcardsTranslator.t("ui.totalReviews")}</dt>
          <dd className="text-right tabular-nums">
            {flashcardsCount("count.reviews", stats.reviewCount)}
          </dd>
          <dt className="text-ink-3">{flashcardsTranslator.t("ui.created")}</dt>
          <dd className="text-right tabular-nums">
            {calendarDate(created, flashcardsDisplayContext().locale)}
          </dd>
        </dl>
      </Block>
    </div>
  );
}
