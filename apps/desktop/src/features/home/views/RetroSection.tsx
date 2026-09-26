/**
 * 今日页 · 回顾段（原统计页并入）：
 * 分段标题（右端时间窗）→ 全年热力图 → 写作趋势 + 知识构成 → 记忆保持 + 专注节律。
 * 去重约定：今天的数字（专注/字数/连续活跃）只在 hero，卡组只在「今天 · 复习」，此处不再重复。
 * 时间窗只作用于趋势 / 评分 / 节律三类窗口化数据；热力图固定全年、知识构成为累计。
 * 首屏不为回顾买单：段落进入滚动区视口（含预读余量）才拉取窗口化数据。
 */

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Brain, Flame, Layers, Timer, TrendingUp } from "lucide-react";
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
import { minutesToHM } from "../queries";
import {
  RETRO_RANGES,
  type HeatmapStats,
  type RetroRange,
  type RetroSnapshot,
  type RetroTotals,
} from "../types";
import { RetroTrend } from "./RetroTrend";
import { SectionHeading } from "./SectionHeading";
import { TitleIcon } from "./TitleIcon";

const RANGE_LABEL: Record<RetroRange, string> = {
  d30: "近 30 天",
  d90: "近 90 天",
  year: "今年",
  all: "全部",
};

export function RetroSection({
  heatmap,
  scrollRoot,
}: {
  heatmap: HeatmapStats;
  /** 今日页滚动容器：懒加载的可见性以它为根 */
  scrollRoot: HTMLElement | null;
}) {
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
      <SectionHeading title="回顾" className="pt-3">
        <Segmented label="回顾时间窗" value={range} onValueChange={(v: RetroRange) => setRange(v)}>
          {RETRO_RANGES.map(r => (
            <Segmented.Item key={r.key} value={r.key} label={r.label} />
          ))}
        </Segmented>
      </SectionHeading>

      <div className="grid grid-flow-row-dense grid-cols-12 gap-3">
        {/* ── 活动：全年热力图 ── */}
        <Panel variant="outline" pad="compact" className="col-span-12">
          <PanelTitle className="mb-2.5">
            <TitleIcon icon={Flame} tone="accent" />
            活动
            <PanelNote>{new Date().getFullYear()} 年全年 · 每日操作</PanelNote>
            <span className="text-tau-micro text-ink-3 ml-auto tabular-nums">
              今年 <b className="text-ink-1 font-semibold">{heatmap.activeDays}</b> 个活跃日
            </span>
          </PanelTitle>
          {heatmap.days.length > 0 ? (
            <div className="overflow-x-auto pb-1.5">
              <div className="min-w-[560px]">
                <YearHeatmap days={heatmap.days} caption="" />
              </div>
            </div>
          ) : (
            <EmptyNote>暂无活动数据</EmptyNote>
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
            <Loading />
          </Panel>
        )}
      </div>
    </section>
  );
}

function RetroPanels({ data, range }: { data: RetroSnapshot; range: RetroRange }) {
  const { navigator } = usePage();
  const { totals, trend, previous, review, rhythm } = data;

  const words = trend.reduce((s, d) => s + d.words, 0);
  const wordsDelta =
    previous && previous.words > 0 ? (words - previous.words) / previous.words : null;
  const dailyAvg = trend.length > 0 ? Math.round(words / trend.length) : 0;

  return (
    <>
      {/* ── 写作趋势（面积 + 7 日均线；窗口汇总并入标题行）── */}
      <Panel variant="outline" pad="compact" className="@max-[1179px]:col-span-12 col-span-8">
        <PanelTitle className="mb-2.5">
          <TitleIcon icon={TrendingUp} tone="ochre" />
          写作趋势
          <PanelNote>{RANGE_LABEL[range]} · 日字数与 7 日均线</PanelNote>
          <span className="text-tau-micro text-ink-3 ml-auto tabular-nums">
            共 <b className="text-ink-1 font-semibold">{words.toLocaleString("zh-CN")}</b> 字
            {wordsDelta !== null && (
              <span className={clsx("ml-1.5", wordsDelta >= 0 ? "text-ok" : "text-danger")}>
                {wordsDelta >= 0 ? "▲" : "▼"} {Math.round(Math.abs(wordsDelta) * 100)}%
              </span>
            )}
            <span className="text-ink-3 mx-1.5">·</span>日均 {dailyAvg.toLocaleString("zh-CN")}
          </span>
        </PanelTitle>
        {trend.length > 1 ? (
          <RetroTrend trend={trend} />
        ) : (
          <EmptyNote>暂无趋势数据——写下第一篇内容后这里会开始生长</EmptyNote>
        )}
      </Panel>

      {/* ── 知识构成（累计；行点击进对应列表）── */}
      <Panel
        variant="outline"
        pad="compact"
        className="@max-[1179px]:col-span-12 col-span-4 flex flex-col"
      >
        <PanelTitle className="mb-2.5">
          <TitleIcon icon={Layers} tone="blue" />
          知识构成<PanelNote>累计 {fmtWan(totals.wordsTotal)} 字</PanelNote>
        </PanelTitle>
        {totals.wordsTotal > 0 ? (
          <>
            <div className="mt-3 flex h-4 overflow-hidden rounded-lg">
              {COMP_ROWS.map(row => (
                <Tooltip
                  key={row.name}
                  content={`${row.name} ${pctStr(row.words(totals), totals.wordsTotal)}`}
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
                  title={`前往${row.name}`}
                  onClick={() => navigator.push(row.target)}
                  className="rounded-tau-sm ease-tau-out hover:bg-hover flex items-center gap-2 px-2 py-[5px] text-left transition-[background] duration-[160ms]"
                >
                  <i className={clsx("size-2 rounded-[3px]", row.colorClass)} />
                  <span className="text-tau-body w-10 font-medium">{row.name}</span>
                  <span className="text-tau-micro text-ink-3 tabular-nums">
                    {row.count(totals).toLocaleString("zh-CN")} {row.unit}
                  </span>
                  <span className="text-tau-micro text-ink-2 ml-auto tabular-nums">
                    <b className="text-ink-1">{row.words(totals).toLocaleString("zh-CN")}</b> 字
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <EmptyNote>还没有内容——构成会随写作积累出现</EmptyNote>
        )}
      </Panel>

      {/* ── 记忆保持 ── */}
      <Panel variant="outline" pad="compact" className="@max-[859px]:col-span-12 col-span-6">
        <PanelTitle className="mb-2.5">
          <TitleIcon icon={Brain} tone="rose" />
          记忆保持
          <PanelNote>
            {RANGE_LABEL[range]} · {review ? review.total.toLocaleString("zh-CN") : 0} 次评分
          </PanelNote>
          <PanelAction onClick={() => navigator.push("review")} title="前往闪卡复习">
            前往复习
          </PanelAction>
        </PanelTitle>
        {review && review.total > 0 ? (
          <>
            <div className="mt-1 flex h-3 overflow-hidden rounded-md">
              {RATING_ROWS.map(row => (
                <Tooltip
                  key={row.key}
                  content={`${row.label} ${pctStr(review.ratings[row.key], review.total)}`}
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
                  {row.label}{" "}
                  <b className="text-ink-1 tabular-nums">
                    {review.ratings[row.key].toLocaleString("zh-CN")}
                  </b>
                </span>
              ))}
              <span className="ml-auto inline-flex items-baseline gap-1.5">
                <span className="text-ok text-[14px] font-semibold tabular-nums">
                  {pctStr(review.ratings.normal + review.ratings.easy, review.total)}
                </span>
                <span className="text-tau-micro text-ink-3">保持率（记得 + 轻松）</span>
              </span>
            </div>
            <DueStrip buckets={review.dueBuckets} />
          </>
        ) : (
          <EmptyNote>还没有复习记录</EmptyNote>
        )}
      </Panel>

      {/* ── 专注节律 ── */}
      <Panel variant="outline" pad="compact" className="@max-[859px]:col-span-12 col-span-6">
        <PanelTitle className="mb-2.5">
          <TitleIcon icon={Timer} tone="green" />
          专注节律
          <PanelNote>
            {RANGE_LABEL[range]} · {rhythm ? rhythm.sessionCount : 0} 个番茄
            {rhythm && rhythm.focusMinutes > 0 ? ` · 共 ${minutesToHM(rhythm.focusMinutes)}` : ""}
          </PanelNote>
          <PanelAction onClick={() => navigator.push("pomodoro")} title="前往番茄专注">
            前往番茄专注
          </PanelAction>
        </PanelTitle>
        {rhythm && rhythm.sessionCount > 0 ? (
          <>
            <div className="flex h-[96px] items-end gap-[3px]">
              {rhythm.hourBuckets.map((n, h) => (
                <Tooltip key={h} content={`${String(h).padStart(2, "0")}:00 · ${n} 个番茄`}>
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
                label="最活跃时段"
              />
              <RhythmNum value={`${rhythm.avgSessionMinutes} 分钟`} label="平均单次" />
              {rhythm.interruptRate !== null && (
                <RhythmNum value={`${(rhythm.interruptRate * 100).toFixed(1)}%`} label="中断率" />
              )}
            </div>
          </>
        ) : (
          <EmptyNote>还没有番茄记录</EmptyNote>
        )}
      </Panel>
    </>
  );
}

/* ---------- 域内私有组件 ---------- */

/** 到期预告：未来 7 天（含今日）逐日柱 */
function DueStrip({ buckets }: { buckets: number[] }) {
  const max = maxOf(buckets);
  const labels = ["今天", "+1", "+2", "+3", "+4", "+5", "+6"];
  return (
    <div className="mt-2.5">
      <div className="text-tau-micro text-ink-3">未来 7 天到期</div>
      <div className="mt-1 flex h-[52px] items-end gap-[3px]">
        {buckets.map((n, i) => (
          <Tooltip key={i} content={`${labels[i]} · ${n} 张到期`}>
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
    name: "卡片",
    unit: "张",
    target: "cards",
    colorClass: "bg-accent",
    words: (t: RetroTotals) => t.cardWords,
    count: (t: RetroTotals) => t.cards,
  },
  {
    name: "文章",
    unit: "篇",
    target: "articles",
    colorClass: "bg-tag-1",
    words: (t: RetroTotals) => t.articleWords,
    count: (t: RetroTotals) => t.articles,
  },
  {
    name: "项目",
    unit: "篇",
    target: "projects",
    colorClass: "bg-tag-2",
    words: (t: RetroTotals) => t.projectWords,
    count: (t: RetroTotals) => t.projects,
  },
  {
    name: "日记",
    unit: "篇",
    target: "diary",
    colorClass: "bg-tag-4",
    words: (t: RetroTotals) => t.diaryWords,
    count: (t: RetroTotals) => t.diaries,
  },
] as const;

const RATING_ROWS = [
  { key: "normal", label: "记得", colorClass: "bg-ok" },
  { key: "easy", label: "轻松", colorClass: "bg-tag-2" },
  { key: "struggle", label: "模糊", colorClass: "bg-tag-4" },
  { key: "hard", label: "忘记", colorClass: "bg-danger" },
] as const;

function pct(part: number, total: number): string {
  return total <= 0 ? "0%" : `${(part / total) * 100}%`;
}

function pctStr(part: number, total: number): string {
  return total <= 0 ? "0%" : `${Math.round((part / total) * 100)}%`;
}

function maxOf(nums: number[]): number {
  return Math.max(...nums, 1);
}

function fmtWan(n: number): string {
  return n >= 10_000 ? `${(n / 10_000).toFixed(1)} 万` : n.toLocaleString("zh-CN");
}
