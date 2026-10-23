// 复习统计页：概览 + 复习热力图（P2，设计稿画框①）+ 近 7 天趋势 + 评分分布。
// 一次 365 天查询供全部区块复用（趋势/分布取末 7 天切片）；数据来自 flashcard_reviews。

import { useMemo, useRef } from "react";
import { PageHeader } from "../../components/PageHeader";
import { useEdgeFade } from "../../hooks/useScrollState";
import {
  todayReviewedCount,
  totalDueOf,
  useFlashcardDecks,
  useFlashcardReviewStats,
} from "./queries";
import { ReviewHeatmap } from "./ReviewHeatmap";
import { REVIEW_RATINGS } from "./constants";
import type { FlashcardReviewRating } from "./types";

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];
/** 热力图 1 年视图需要的最大天数，趋势/分布取末 7 天切片 */
const STATS_DAYS = 52 * 7;

type FlashcardStatsPageProps = {
  onBack: () => void;
  onOpenReview: () => void;
};

export function FlashcardStatsPage({ onBack, onOpenReview }: FlashcardStatsPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef);
  const statsQuery = useFlashcardReviewStats(STATS_DAYS);
  const decksQuery = useFlashcardDecks();
  const allStats = useMemo(() => statsQuery.data ?? [], [statsQuery.data]);
  const stats = useMemo(() => allStats.slice(-7), [allStats]);

  const maxCount = Math.max(1, ...stats.map(day => day.count));
  const weekTotal = stats.reduce((sum, day) => sum + day.count, 0);
  const distribution = useMemo(() => {
    const result = { easy: 0, normal: 0, struggle: 0, hard: 0 } as Record<
      FlashcardReviewRating,
      number
    >;
    for (const day of stats) {
      for (const item of REVIEW_RATINGS) result[item.value] += day[item.value];
    }
    return result;
  }, [stats]);
  const dueToday = totalDueOf(decksQuery.data ?? []);

  return (
    <div className="mobile-kb-screen bg-page flex h-full flex-col">
      <PageHeader title="复习统计" onBack={onBack} />
      <div
        ref={scrollRef}
        className="edge-fade-scroll flex-1 overflow-y-auto"
        style={{ paddingBottom: "var(--page-bottom-inset)" }}
      >
        <div className="flex flex-col gap-3.5 px-5 pt-2">
          {/* 概览 */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-surface shadow-card rounded-[20px] p-4">
              <div className="text-accent text-[19px] font-extrabold">
                {todayReviewedCount(allStats)}
              </div>
              <div className="text-ink-2 mt-0.5 text-[11px] font-bold">今日已复习</div>
            </div>
            <div className="bg-surface shadow-card rounded-[20px] p-4">
              <div className="text-ink-1 text-[19px] font-extrabold">{weekTotal}</div>
              <div className="text-ink-2 mt-0.5 text-[11px] font-bold">近 7 天合计</div>
            </div>
          </div>

          {/* 复习热力图 */}
          {statsQuery.isLoading ? (
            <div className="bg-surface shadow-card rounded-[20px] p-4">
              <div className="text-ink-3 py-6 text-center text-[13px] font-semibold">加载中…</div>
            </div>
          ) : statsQuery.isError ? (
            <div className="bg-surface shadow-card rounded-[20px] p-4">
              <div className="text-danger py-6 text-center text-[13px] font-semibold">
                加载失败
                <button
                  type="button"
                  onClick={() => void statsQuery.refetch()}
                  className="text-accent ml-2 font-extrabold"
                >
                  重试
                </button>
              </div>
            </div>
          ) : (
            <ReviewHeatmap stats={allStats} dueToday={dueToday} onOpenReview={onOpenReview} />
          )}

          {/* 7 天趋势 */}
          <div className="bg-surface shadow-card rounded-[20px] p-4">
            <div className="text-ink-2 mb-3 text-[12.5px] font-extrabold">近 7 天趋势</div>
            <div className="flex h-36 items-end gap-2.5">
              {stats.map(day => {
                const date = new Date(day.dayStart);
                const isToday = day === stats[stats.length - 1];
                return (
                  <div key={day.dayStart} className="flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-ink-2 text-[10.5px] font-extrabold">
                      {day.count || ""}
                    </span>
                    <div
                      className="w-full rounded-t-[8px] transition-[height]"
                      style={{
                        height: `${Math.max(4, (day.count / maxCount) * 96)}px`,
                        background: isToday ? "var(--tau-accent)" : "var(--tau-accent-soft)",
                      }}
                    />
                    <span
                      className={`text-[10.5px] font-bold ${isToday ? "text-accent" : "text-ink-3"}`}
                    >
                      {WEEKDAY_LABEL[date.getDay()]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 评分分布 */}
          <div className="bg-surface shadow-card rounded-[20px] p-4">
            <div className="text-ink-2 mb-3 text-[12.5px] font-extrabold">近 7 天评分分布</div>
            <div className="flex flex-col gap-2.5">
              {REVIEW_RATINGS.slice()
                .reverse()
                .map(item => {
                  const count = distribution[item.value];
                  const percent = weekTotal > 0 ? Math.round((count / weekTotal) * 100) : 0;
                  return (
                    <div key={item.value} className="flex items-center gap-3">
                      <span
                        className="w-9 flex-none text-[12px] font-extrabold"
                        style={{ color: item.color }}
                      >
                        {item.label}
                      </span>
                      <div className="bg-page h-[14px] flex-1 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${percent}%`, background: item.color, opacity: 0.85 }}
                        />
                      </div>
                      <span className="text-ink-2 w-14 flex-none text-right text-[11.5px] font-bold">
                        {count} · {percent}%
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
