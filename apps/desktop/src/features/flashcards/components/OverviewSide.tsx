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
  const total = reviewStats?.total ?? 0;
  const remembered = reviewStats ? reviewStats.ratings.normal + reviewStats.ratings.easy : 0;
  return (
    <div className="flex flex-col gap-[22px] px-5 pb-5 pt-[18px]">
      <Block title="近 7 天" meta={`${total} 次评分`}>
        {total > 0 && reviewStats ? (
          <>
            <div className="text-ink-2 text-[13px]">
              <b className="text-ink-1 mr-1 text-[18px] font-semibold tabular-nums">
                {Math.round((remembered / total) * 100)}%
              </b>
              记住（记得 + 轻松）
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
                  {r.label}
                  <span className="text-ink-3 tabular-nums">{reviewStats.ratings[r.value]}</span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-ink-3 text-[12px]">这 7 天还没有复习记录</p>
        )}
      </Block>
      <Block title="未来 7 天到期">
        <ForecastChart values={forecast} now={now} />
      </Block>
    </div>
  );
}
