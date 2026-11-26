import { useHomeI18n } from "../i18n";
import { METRIC_VALUE, MetricText } from "./MetricText";
/**
 * 今日页 · 回顾段（原统计页并入）：
 * 分段标题（右端时间窗）→ 全年热力图 → 写作趋势 + 知识构成 → 记忆保持 + 专注节律。
 * 去重约定：今天的数字（专注/字数/连续活跃）只在 hero，卡组只在「今天 · 复习」，此处不再重复。
 * 时间窗只作用于趋势 / 评分 / 节律三类窗口化数据；热力图固定全年、知识构成为累计。
 * 首屏不为回顾买单：段落进入滚动区视口（含预读余量）才拉取窗口化数据。
 */

import clsx from "clsx";
import { useContext, useEffect, useRef, useState } from "react";
import { usePage } from "@/page/PageProvider";
import {
  EmptyNote,
  Loading,
  Panel,
  PanelAction,
  PanelNote,
  PanelTitle,
  Segmented,
  Tooltip,
  YearHeatmap,
} from "@tau/ui";
import { useRetroSnapshot } from "../retroQueries";
import { useHomeSnapshot } from "../queries";
import { minutesToHM, displayPercent, compactNumber } from "../format";
import {
  RETRO_RANGES,
  type HeatmapStats,
  type RetroRange,
  type RetroSnapshot,
  type RetroTotals,
} from "../types";
import { RetroTrend } from "./RetroTrend";
import { SectionHeading } from "./SectionHeading";
import { HomeScrollRootContext } from "./HomePanels";

const RANGE_LABEL = {
  d30: "retro.range.d30",
  d90: "retro.range.d90",
  year: "retro.range.year",
  all: "retro.range.all",
} as const;

/** 首页面板：热力图取首页快照，懒加载以首页滚动容器为可见性根 */
export function RetroPanel() {
  const { data } = useHomeSnapshot();
  const scrollRoot = useContext(HomeScrollRootContext);
  if (!data) return null;
  return <RetroSection heatmap={data.heatmap} scrollRoot={scrollRoot} />;
}

export function RetroSection({
  heatmap,
  scrollRoot,
}: {
  heatmap: HeatmapStats;
  /** 今日页滚动容器：懒加载的可见性以它为根 */
  scrollRoot: HTMLElement | null;
}) {
  const { t, locale } = useHomeI18n();
  const number = new Intl.NumberFormat(locale);
  const [range, setRange] = useState<RetroRange>("d30");

  // 进入视口（预读 240px）后常驻开启，之后切时间窗照常拉取
  const rootRef = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (seen || !el || !scrollRoot) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) setSeen(true);
      },
      { root: scrollRoot, rootMargin: "0px 0px 240px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen, scrollRoot]);

  const { data } = useRetroSnapshot(range, seen);

  return (
    <section ref={rootRef} className="flex flex-col gap-3">
      <SectionHeading title={t("panels.retro")}>
        <Segmented
          label={t("retro.rangeLabel")}
          value={range}
          onValueChange={(v: RetroRange) => setRange(v)}
        >
          {RETRO_RANGES.map(key => (
            <Segmented.Item key={key} value={key} label={t(RANGE_LABEL[key])} />
          ))}
        </Segmented>
      </SectionHeading>

      <div className="grid grid-flow-row-dense grid-cols-12 gap-3">
        {/* ── 活动：全年热力图 ── */}
        <Panel variant="outline" pad="compact" className="col-span-12">
          <PanelTitle className="mb-2.5">
            {t("retro.activity")}
            <PanelNote>{t("retro.year", { year: String(new Date().getFullYear()) })}</PanelNote>
            <span className="text-tau-micro text-ink-3 ml-auto tabular-nums">
              <MetricText
                text={t("retro.activeDays", { count: heatmap.activeDays, value: METRIC_VALUE })}
                className="text-ink-1 font-semibold"
              >
                {number.format(heatmap.activeDays)}
              </MetricText>
            </span>
          </PanelTitle>
          {heatmap.days.length > 0 ? (
            <div className="overflow-x-auto pb-1.5">
              <div className="min-w-[560px]">
                <YearHeatmap days={heatmap.days} caption="" />
              </div>
            </div>
          ) : (
            <EmptyNote>{t("retro.noActivity")}</EmptyNote>
          )}
        </Panel>

        {data ? (
          <RetroPanels data={data} range={range} />
        ) : (
          <Panel
            variant="outline"
            pad="compact"
            className="col-span-12 grid h-[260px] place-items-center"
          >
            <Loading label={t("loading")} />
          </Panel>
        )}
      </div>
    </section>
  );
}

function RetroPanels({ data, range }: { data: RetroSnapshot; range: RetroRange }) {
  const { t, locale } = useHomeI18n();
  const number = new Intl.NumberFormat(locale);
  const { navigator } = usePage();
  const { totals, trend, previous, review, rhythm } = data;

  const words = trend.reduce((s, d) => s + d.words, 0);
  const wordsDelta =
    previous && previous.words > 0 ? (words - previous.words) / previous.words : null;
  const dailyAvg = trend.length > 0 ? Math.round(words / trend.length) : 0;

  return (
    <>
      {/* ── 写作趋势（面积 + 7 日均线；窗口汇总并入标题行）── */}
      <Panel variant="outline" pad="compact" className="col-span-8 @max-[1179px]:col-span-12">
        <PanelTitle className="mb-2.5">
          {t("retro.writing")}
          <PanelNote>{t("retro.writingScope", { range: t(RANGE_LABEL[range]) })}</PanelNote>
          <span className="text-tau-micro text-ink-3 ml-auto tabular-nums">
            <MetricText
              text={t("retro.totalWords", { count: words, value: METRIC_VALUE })}
              className="text-ink-1 font-semibold"
            >
              {number.format(words)}
            </MetricText>
            {wordsDelta !== null && (
              <span className={clsx("ml-1.5", wordsDelta >= 0 ? "text-ok" : "text-danger")}>
                {wordsDelta >= 0 ? "▲" : "▼"} {displayPercent(Math.abs(wordsDelta), 1)}
              </span>
            )}
            <span className="text-ink-3 mx-1.5">·</span>
            {t("retro.dailyAverage", { value: number.format(dailyAvg) })}
          </span>
        </PanelTitle>
        {trend.length > 1 ? (
          <RetroTrend trend={trend} />
        ) : (
          <EmptyNote>{t("retro.noTrend")}</EmptyNote>
        )}
      </Panel>

      {/* ── 知识构成（累计；行点击进对应列表）── */}
      <Panel
        variant="outline"
        pad="compact"
        className="col-span-4 flex flex-col @max-[1179px]:col-span-12"
      >
        <PanelTitle className="mb-2.5">
          {t("retro.composition")}
          <PanelNote>
            {t("retro.accumulated", {
              count: totals.wordsTotal,
              value: compactNumber(totals.wordsTotal),
            })}
          </PanelNote>
        </PanelTitle>
        {totals.wordsTotal > 0 ? (
          <>
            <div className="mt-3 flex h-4 overflow-hidden rounded-lg">
              {COMP_ROWS.map(row => (
                <Tooltip
                  key={row.name}
                  content={`${t(row.name)} ${displayPercent(row.words(totals), totals.wordsTotal)}`}
                >
                  <i
                    className={row.colorClass}
                    style={{ width: pct(row.words(totals), totals.wordsTotal) }}
                  />
                </Tooltip>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-0.5">
              {COMP_ROWS.map(row => (
                <button
                  key={row.name}
                  type="button"
                  title={t("retro.openKind", { name: t(row.name) })}
                  onClick={() => navigator.push(row.target)}
                  className="rounded-tau-sm ease-tau-out hover:bg-hover flex items-center gap-2 px-2 py-[5px] text-left transition-[background] duration-[160ms]"
                >
                  <i className={clsx("size-2 rounded-[3px]", row.colorClass)} />
                  <span className="text-tau-body w-10 font-medium">{t(row.name)}</span>
                  <span className="text-tau-micro text-ink-3 tabular-nums">
                    {t(row.unit, {
                      count: row.count(totals),
                      value: number.format(row.count(totals)),
                    })}
                  </span>
                  <span className="text-tau-micro text-ink-2 ml-auto tabular-nums">
                    <MetricText
                      text={t("retro.words", { count: row.words(totals), value: METRIC_VALUE })}
                      className="text-ink-1"
                    >
                      {number.format(row.words(totals))}
                    </MetricText>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <EmptyNote>{t("retro.noContent")}</EmptyNote>
        )}
      </Panel>

      {/* ── 记忆保持 ── */}
      <Panel variant="outline" pad="compact" className="col-span-6 @max-[859px]:col-span-12">
        <PanelTitle className="mb-2.5">
          {t("retro.memory")}
          <PanelNote>
            {t("retro.ratings", {
              range: t(RANGE_LABEL[range]),
              count: review?.total ?? 0,
              value: number.format(review?.total ?? 0),
            })}
          </PanelNote>
          <PanelAction onClick={() => navigator.push("review")} title={t("review.openHint")}>
            {t("review.open")}
          </PanelAction>
        </PanelTitle>
        {review && review.total > 0 ? (
          <>
            <div className="mt-1 flex h-3 overflow-hidden rounded-md">
              {RATING_ROWS.map(row => (
                <Tooltip
                  key={row.key}
                  content={`${t(row.label)} ${displayPercent(review.ratings[row.key], review.total)}`}
                >
                  <i
                    className={row.colorClass}
                    style={{ width: pct(review.ratings[row.key], review.total) }}
                  />
                </Tooltip>
              ))}
            </div>
            <div className="text-ink-2 mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px]">
              {RATING_ROWS.map(row => (
                <span key={row.key} className="inline-flex items-center gap-1.5">
                  <i className={clsx("size-[7px] rounded-[2.5px]", row.colorClass)} />
                  {t(row.label)}{" "}
                  <b className="text-ink-1 tabular-nums">
                    {number.format(review.ratings[row.key])}
                  </b>
                </span>
              ))}
              <span className="ml-auto inline-flex items-baseline gap-1.5">
                <span className="text-ok text-[14px] font-semibold tabular-nums">
                  {displayPercent(review.ratings.normal + review.ratings.easy, review.total)}
                </span>
                <span className="text-tau-micro text-ink-3">{t("retro.retention")}</span>
              </span>
            </div>
            <DueStrip buckets={review.dueBuckets} />
          </>
        ) : (
          <EmptyNote>{t("retro.noReviews")}</EmptyNote>
        )}
      </Panel>

      {/* ── 专注节律 ── */}
      <Panel variant="outline" pad="compact" className="col-span-6 @max-[859px]:col-span-12">
        <PanelTitle className="mb-2.5">
          {t("retro.focus")}
          <PanelNote>
            {t("retro.sessions", {
              range: t(RANGE_LABEL[range]),
              count: rhythm?.sessionCount ?? 0,
              value: number.format(rhythm?.sessionCount ?? 0),
            })}
            {rhythm && rhythm.focusMinutes > 0
              ? t("retro.duration", { duration: minutesToHM(rhythm.focusMinutes) })
              : ""}
          </PanelNote>
          <PanelAction onClick={() => navigator.push("pomodoro")} title={t("hero.focusLink")}>
            {t("hero.focusLink")}
          </PanelAction>
        </PanelTitle>
        {rhythm && rhythm.sessionCount > 0 ? (
          <>
            <div className="flex h-[96px] items-end gap-[3px]">
              {rhythm.hourBuckets.map((n, h) => (
                <Tooltip
                  key={h}
                  content={t("retro.hourSessions", {
                    hour: `${String(h).padStart(2, "0")}:00`,
                    count: n,
                    value: number.format(n),
                  })}
                >
                  <div className="flex h-full min-w-0 flex-1 flex-col justify-end">
                    <i
                      className={clsx(
                        "rounded-t-[3px]",
                        h === rhythm.peakHour ? "bg-accent" : "bg-accent opacity-50"
                      )}
                      style={{
                        height: `${Math.max(4, (n / maxOf(rhythm.hourBuckets)) * 100)}%`,
                      }}
                    />
                  </div>
                </Tooltip>
              ))}
            </div>
            <div className="text-ink-3 mt-1 flex gap-[3px] text-[9.5px]">
              {rhythm.hourBuckets.map((_, h) => (
                <span key={h} className="min-w-0 flex-1 text-center">
                  {[0, 6, 12, 18, 23].includes(h) ? String(h).padStart(2, "0") : ""}
                </span>
              ))}
            </div>
            <div className="mt-2.5 flex gap-5">
              <RhythmNum
                value={
                  rhythm.peakHour !== null ? `${String(rhythm.peakHour).padStart(2, "0")}:00` : "—"
                }
                label={t("retro.peakHour")}
              />
              <RhythmNum
                value={t("duration.minutes", { value: number.format(rhythm.avgSessionMinutes) })}
                label={t("retro.averageSession")}
              />
              {rhythm.interruptRate !== null && (
                <RhythmNum
                  value={new Intl.NumberFormat(locale, {
                    style: "percent",
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }).format(rhythm.interruptRate)}
                  label={t("retro.interruptRate")}
                />
              )}
            </div>
          </>
        ) : (
          <EmptyNote>{t("retro.noFocus")}</EmptyNote>
        )}
      </Panel>
    </>
  );
}

/* ---------- 域内私有组件 ---------- */

/** 到期预告：未来 7 天（含今日）逐日柱 */
function DueStrip({ buckets }: { buckets: number[] }) {
  const { t, locale } = useHomeI18n();
  const number = new Intl.NumberFormat(locale);
  const max = maxOf(buckets);
  const labels = [t("retro.today"), "+1", "+2", "+3", "+4", "+5", "+6"];
  return (
    <div className="mt-2.5">
      <div className="text-tau-micro text-ink-3">{t("retro.dueWeek")}</div>
      <div className="mt-1 flex h-[52px] items-end gap-[3px]">
        {buckets.map((n, i) => (
          <Tooltip
            key={i}
            content={t("retro.dueDay", { day: labels[i], count: n, value: number.format(n) })}
          >
            <div className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <i
                className={clsx("rounded-t-[3px]", i === 0 ? "bg-accent" : "bg-accent opacity-40")}
                style={{ height: `${max > 0 ? Math.max(6, (n / max) * 100) : 6}%` }}
              />
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="text-ink-3 mt-0.5 flex gap-[3px] text-[9.5px]">
        {labels.map(l => (
          <span key={l} className="min-w-0 flex-1 text-center">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function RhythmNum({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[14px] font-semibold tabular-nums">{value}</div>
      <div className="text-tau-micro text-ink-3">{label}</div>
    </div>
  );
}

/* ---------- 小工具 ---------- */

/** 构成四分类（顺序即展示顺序）：卡片 → 文章 → 项目 → 日记 */
const COMP_ROWS = [
  {
    name: "kind.card",
    unit: "retro.count.card",
    target: "cards",
    colorClass: "bg-accent",
    words: (t: RetroTotals) => t.cardWords,
    count: (t: RetroTotals) => t.cards,
  },
  {
    name: "kind.article",
    unit: "retro.count.article",
    target: "articles",
    colorClass: "bg-tag-1",
    words: (t: RetroTotals) => t.articleWords,
    count: (t: RetroTotals) => t.articles,
  },
  {
    name: "kind.project",
    unit: "retro.count.project",
    target: "projects",
    colorClass: "bg-tag-2",
    words: (t: RetroTotals) => t.projectWords,
    count: (t: RetroTotals) => t.projects,
  },
  {
    name: "kind.diary",
    unit: "retro.count.diary",
    target: "diary",
    colorClass: "bg-tag-4",
    words: (t: RetroTotals) => t.diaryWords,
    count: (t: RetroTotals) => t.diaries,
  },
] as const;

const RATING_ROWS = [
  { key: "normal", label: "retro.rating.normal", colorClass: "bg-ok" },
  { key: "easy", label: "retro.rating.easy", colorClass: "bg-tag-2" },
  { key: "struggle", label: "retro.rating.struggle", colorClass: "bg-tag-4" },
  { key: "hard", label: "retro.rating.hard", colorClass: "bg-danger" },
] as const;

function pct(part: number, total: number): string {
  return total <= 0 ? "0%" : `${(part / total) * 100}%`;
}

function maxOf(nums: number[]): number {
  return Math.max(...nums, 1);
}
