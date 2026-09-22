/**
 * 统计（Bento 数据面板）视图：
 * 速览小 tile 群 → 趋势面积图 + 知识构成 → 全年热力图 → 记忆保持 + 专注节律 + 牌组。
 * 响应式为容器驱动（@container 锚点在根，断点 1179/859 对齐 HomeView 的 1180/860 惯例，
 * 侧栏拖宽/折叠改变容器宽而非窗口宽）；grid dense 回流让 tile 折行不重排 DOM。
 * 图表全手写（零 antd/echarts），配色走 --tau-* 语义类（趋势渐变为 accent 的 alpha 派生）。
 */

import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { Flame, PenLine, Repeat, Timer, type LucideIcon } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { openPomodoroWindow } from "@/commands";
import {
  useEdgeFade,
  EmptyNote,
  Panel,
  PanelAction,
  PanelNote,
  PanelTitle,
  Loading,
  Tooltip,
  YearHeatmap,
} from "@tau/ui";
import { useStatsSnapshot } from "../queries";
import { STATS_RANGES, type StatsRange, type StatsTotals } from "../types";
import { StatsTrend } from "./StatsTrend";

const RANGE_LABEL: Record<StatsRange, string> = {
  d30: "近 30 天",
  d90: "近 90 天",
  year: "今年",
  all: "累计",
};

export function StatsView() {
  const [range, setRange] = useState<StatsRange>("d30");
  const { data, loading } = useStatsSnapshot(range);
  const { navigator } = usePage();
  // callback ref（非 useRef）：loading 早退分支下滚动容器晚于首帧挂载，
  // 经 state 触发 useEdgeFade 在挂载后重新接线
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  if (loading) return <Loading />;
  if (!data) return null;
  const { totals, heatmap, decks, trend, previous, review, rhythm } = data;

  const words = trend.reduce((s, d) => s + d.words, 0);
  const wordsDelta =
    previous && previous.words > 0 ? (words - previous.words) / previous.words : null;
  const dailyAvg = trend.length > 0 ? Math.round(words / trend.length) : 0;
  const dueToday = decks.reduce((s, d) => s + d.dueCount, 0);
  const due7 = review ? review.dueBuckets.reduce((s, n) => s + n, 0) : 0;
  // 累计条数 = 五类内容条目全口径（卡片/文章/项目文档/知识库文档/日记）
  const totalEntries =
    totals.cards + totals.articles + totals.projects + totals.documents + totals.diaries;

  return (
    <div className="@container pt-6.5 mx-auto flex h-full max-w-[1680px] flex-col gap-3 px-[34px]">
      {/* hero：标题 + 时间范围 tabs + 累计摘要 */}
      <header className="flex flex-none items-center gap-4">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em]">统计</h1>
        <div className="bg-surface shadow-card flex items-center gap-0.5 rounded-[10px] p-[2.5px]">
          {STATS_RANGES.map(r => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={clsx(
                "ease-tau-out h-6 rounded-[8px] px-3 text-[11.5px] transition-[background,color] duration-[160ms]",
                range === r.key
                  ? "bg-accent text-ink-inverse font-medium"
                  : "text-ink-2 hover:text-ink-1"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-tau-sm text-ink-2 ml-auto tabular-nums">
          累计 <b className="text-ink-1 font-semibold">{fmtWan(totals.wordsTotal)}</b> 字
          <span className="text-ink-3 mx-2">·</span>
          <b className="text-ink-1 font-semibold">{totalEntries.toLocaleString("zh-CN")}</b> 条
          <span className="text-ink-3 mx-2">·</span>连续活跃{" "}
          <b className="text-ink-1 font-semibold">{heatmap.streak}</b> 天
        </span>
      </header>

      {/* 滚动区：边缘渐隐（edge-fade-scroll 通用类 + useEdgeFade 驱动 mask 变量）；
          -mr/pr 借壳层右内边距把滚动条移进留白（内容盒右缘不动） */}
      <div
        ref={setScrollEl}
        className="edge-fade-scroll -mr-[18px] flex min-h-0 flex-1 flex-col overflow-y-auto pb-1 pr-[18px] pt-2"
      >
        <div className="grid grid-flow-row-dense grid-cols-12 gap-3">
          {/* ── 速览小 tile 群 ── */}
          <MiniTile
            className="@max-[859px]:col-span-6 col-span-3"
            icon={Flame}
            label="连续活跃"
            value={heatmap.streak}
            suffix="天"
            foot={`今年 ${heatmap.activeDays} 个活跃日`}
          />
          <MiniTile
            className="@max-[859px]:col-span-6 col-span-3"
            icon={PenLine}
            label={`${RANGE_LABEL[range]}写下`}
            value={words.toLocaleString("zh-CN")}
            suffix="字"
            foot={
              <>
                {wordsDelta !== null && (
                  <span className={wordsDelta >= 0 ? "text-ok" : "text-danger"}>
                    {wordsDelta >= 0 ? "▲" : "▼"} {Math.round(Math.abs(wordsDelta) * 100)}% 环比
                    ·{" "}
                  </span>
                )}
                日均 {dailyAvg.toLocaleString("zh-CN")}
              </>
            }
          />
          <MiniTile
            className="@max-[859px]:col-span-6 col-span-3"
            icon={Repeat}
            label="今日待复习"
            value={dueToday}
            suffix="张"
            foot={`${decks.length} 个牌组 · 未来 7 天 ${due7} 张`}
          />
          <MiniTile
            className="@max-[859px]:col-span-6 col-span-3"
            icon={Timer}
            label="累计专注"
            value={formatHours(totals.focusMinutesTotal)}
            foot={`${totals.focusSessions} 个番茄`}
          />

          {/* ── 写作趋势（面积 + 7 日均线）── */}
          <Panel pad="compact" className="@max-[1179px]:col-span-12 col-span-8">
            <PanelTitle className="mb-2.5">
              写作趋势
              <PanelNote>{RANGE_LABEL[range]} · 日字数与 7 日均线</PanelNote>
            </PanelTitle>
            {trend.length > 1 ? (
              <StatsTrend trend={trend} />
            ) : (
              <EmptyNote>暂无趋势数据——写下第一篇内容后这里会开始生长</EmptyNote>
            )}
          </Panel>

          {/* ── 知识构成 ── */}
          <Panel pad="compact" className="@max-[859px]:col-span-12 col-span-4 flex flex-col">
            <PanelTitle className="mb-2.5">
              知识构成<PanelNote>累计 {fmtWan(totals.wordsTotal)} 字</PanelNote>
            </PanelTitle>
            {totals.wordsTotal > 0 ? (
              <>
                <div className="mt-3 flex h-4 overflow-hidden rounded-lg">
                  {COMP_ROWS.map(row => (
                    <Tooltip
                      key={row.name}
                      content={`${row.name} ${pctStr(row.pick(totals), totals.wordsTotal)}`}
                    >
                      <i
                        className={row.barClass}
                        style={{ width: pct(row.pick(totals), totals.wordsTotal) }}
                      />
                    </Tooltip>
                  ))}
                </div>
                <div className="mt-2 flex flex-col gap-0.5">
                  {COMP_ROWS.map(row => (
                    <CompRow
                      key={row.name}
                      dot={row.dotClass}
                      name={row.name}
                      words={row.pick(totals)}
                    />
                  ))}
                </div>
                {/* mt-auto：与左侧趋势 tile 等高时注脚贴底，两卡底部对称 */}
                <p className="text-tau-micro text-ink-3 mt-auto px-2 pt-2">
                  {totals.cards.toLocaleString("zh-CN")} 张卡片 ·{" "}
                  {totals.articles.toLocaleString("zh-CN")} 篇文章 ·{" "}
                  {totals.projects.toLocaleString("zh-CN")} 篇项目文档 ·{" "}
                  {totals.documents.toLocaleString("zh-CN")} 篇知识库文档 · {totals.diaries} 篇日记
                </p>
              </>
            ) : (
              <EmptyNote>还没有内容——构成会随写作积累出现</EmptyNote>
            )}
          </Panel>

          {/* ── 活动：全年热力图 ── */}
          <Panel pad="compact" className="col-span-12">
            <PanelTitle className="mb-2.5">
              活动
              <PanelNote>{new Date().getFullYear()} 年 · 每日操作</PanelNote>
              <span className="text-tau-micro text-ink-3 ml-auto tabular-nums">
                连续活跃{" "}
                <b className="text-accent-text text-[13px] font-semibold">{heatmap.streak}</b> 天 ·
                今年 {heatmap.activeDays} 个活跃日
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

          {/* ── 记忆保持 ── */}
          <Panel pad="compact" className="@max-[859px]:col-span-6 col-span-4">
            <PanelTitle className="mb-2.5">
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
                        className={row.barClass}
                        style={{ width: pct(review.ratings[row.key], review.total) }}
                      />
                    </Tooltip>
                  ))}
                </div>
                <div className="text-ink-2 mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px]">
                  {RATING_ROWS.map(row => (
                    <span key={row.key} className="inline-flex items-center gap-1.5">
                      <i className={clsx("size-[7px] rounded-[2.5px]", row.dotClass)} />
                      {row.label}{" "}
                      <b className="text-ink-1 tabular-nums">
                        {review.ratings[row.key].toLocaleString("zh-CN")}
                      </b>
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <span className="text-ok text-[14px] font-semibold tabular-nums">
                    {pctStr(review.ratings.normal + review.ratings.easy, review.total)}
                  </span>
                  <span className="text-tau-micro text-ink-3">记得 + 轻松保持率</span>
                  <span className="text-tau-sm text-ink-2 ml-auto tabular-nums">
                    今天 <b className="text-accent-text">{dueToday}</b> 张到期
                  </span>
                </div>
                <DueStrip buckets={review.dueBuckets} />
              </>
            ) : (
              <EmptyNote>还没有复习记录</EmptyNote>
            )}
          </Panel>

          {/* ── 专注节律 ── */}
          <Panel pad="compact" className="@max-[859px]:col-span-6 col-span-4">
            <PanelTitle className="mb-2.5">
              专注节律
              <PanelNote>
                {RANGE_LABEL[range]} · {rhythm ? rhythm.sessionCount : 0} 个番茄
              </PanelNote>
              <PanelAction onClick={() => openPomodoroWindow()} title="打开番茄钟">
                打开番茄钟
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
                      rhythm.peakHour !== null
                        ? `${String(rhythm.peakHour).padStart(2, "0")}:00`
                        : "—"
                    }
                    label="最活跃时段"
                  />
                  <RhythmNum value={`${rhythm.avgSessionMinutes} 分钟`} label="平均单次" />
                  {rhythm.interruptRate !== null && (
                    <RhythmNum
                      value={`${(rhythm.interruptRate * 100).toFixed(1)}%`}
                      label="中断率"
                    />
                  )}
                </div>
              </>
            ) : (
              <EmptyNote>还没有番茄记录</EmptyNote>
            )}
          </Panel>

          {/* ── 闪卡牌组 ── */}
          <Panel pad="compact" className="@max-[1179px]:col-span-12 col-span-4">
            <PanelTitle className="mb-2.5">
              闪卡牌组
              <PanelNote>
                {decks.length} 组 · {decks.reduce((s, d) => s + d.totalCards, 0)} 张
              </PanelNote>
              <PanelAction onClick={() => navigator.push("review")} title="前往闪卡复习">
                前往复习
              </PanelAction>
            </PanelTitle>
            {decks.length > 0 ? (
              decks.map(deck => {
                const done = Math.max(
                  0,
                  deck.totalCards - deck.dueCount - deck.learningCount - deck.newCount
                );
                return (
                  <div
                    key={deck.id}
                    className="rounded-tau-sm ease-tau-out hover:bg-hover flex items-center gap-3 px-2 py-2 transition-[background] duration-[160ms]"
                  >
                    <span className="text-tau-body w-24 truncate font-medium" title={deck.name}>
                      {deck.name}
                    </span>
                    <span className="bg-sunken flex h-2 flex-1 overflow-hidden rounded">
                      <i
                        className="bg-warn"
                        style={{ width: pct(deck.dueCount, deck.totalCards) }}
                      />
                      <i
                        className="bg-accent opacity-80"
                        style={{ width: pct(deck.learningCount, deck.totalCards) }}
                      />
                      <i
                        className="bg-ok opacity-55"
                        style={{ width: pct(done, deck.totalCards) }}
                      />
                    </span>
                    <span className="text-tau-micro text-ink-2 truncate whitespace-nowrap tabular-nums">
                      <b className={deck.dueCount > 0 ? "text-accent-text" : "text-ink-1"}>
                        {deck.dueCount}
                      </b>{" "}
                      / {deck.totalCards}
                    </span>
                  </div>
                );
              })
            ) : (
              <EmptyNote>还没有闪卡牌组</EmptyNote>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ---------- 域内私有组件 ---------- */

/** 速览小 tile：图标徽标 + 大数字 + 注脚 */
function MiniTile({
  className,
  icon: Icon,
  label,
  value,
  suffix,
  foot,
}: {
  className?: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  suffix?: string;
  foot: ReactNode;
}) {
  return (
    <Panel
      pad="none"
      className={clsx("flex flex-col justify-center gap-0.5 px-[18px] py-4", className)}
    >
      <span className="text-tau-micro text-ink-3 flex items-center gap-1.5">
        <span className="bg-accent-soft text-accent-text grid size-[17px] place-items-center rounded-[5px]">
          <Icon size={11} strokeWidth={1.75} />
        </span>
        {label}
      </span>
      <b className="text-[25px] font-bold tabular-nums leading-[1.25] tracking-[-0.02em]">
        {value}
        {suffix && <small className="text-tau-micro text-ink-3 ml-1 font-normal">{suffix}</small>}
      </b>
      <span className="text-tau-micro text-ink-3">{foot}</span>
    </Panel>
  );
}

function CompRow({ dot, name, words }: { dot: string; name: string; words: number }) {
  return (
    <div className="rounded-tau-sm ease-tau-out hover:bg-hover flex items-center gap-2 px-2 py-[5px] transition-[background] duration-[160ms]">
      <i className={clsx("size-2 rounded-[3px]", dot)} />
      <span className="text-tau-body w-10 font-medium">{name}</span>
      <span className="text-tau-micro text-ink-2 ml-auto tabular-nums">
        <b className="text-ink-1">{words.toLocaleString("zh-CN")}</b> 字
      </span>
    </div>
  );
}

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

/** 构成五分类（顺序即展示顺序）：卡片 → 文章 → 项目 → 知识库 → 日记 */
const COMP_ROWS = [
  {
    name: "卡片",
    barClass: "bg-accent",
    dotClass: "bg-accent",
    pick: (t: StatsTotals) => t.cardWords,
  },
  {
    name: "文章",
    barClass: "bg-tag-1",
    dotClass: "bg-tag-1",
    pick: (t: StatsTotals) => t.articleWords,
  },
  {
    name: "项目",
    barClass: "bg-tag-2",
    dotClass: "bg-tag-2",
    pick: (t: StatsTotals) => t.projectWords,
  },
  {
    name: "知识库",
    barClass: "bg-tag-3",
    dotClass: "bg-tag-3",
    pick: (t: StatsTotals) => t.documentWords,
  },
  {
    name: "日记",
    barClass: "bg-tag-4",
    dotClass: "bg-tag-4",
    pick: (t: StatsTotals) => t.diaryWords,
  },
] as const;

const RATING_ROWS = [
  { key: "normal", label: "记得", barClass: "bg-ok", dotClass: "bg-ok" },
  { key: "easy", label: "轻松", barClass: "bg-tag-2", dotClass: "bg-tag-2" },
  { key: "struggle", label: "模糊", barClass: "bg-tag-4", dotClass: "bg-tag-4" },
  { key: "hard", label: "忘记", barClass: "bg-danger", dotClass: "bg-danger" },
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

function formatHours(min: number): string {
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function fmtWan(n: number): string {
  return n >= 10_000 ? `${(n / 10_000).toFixed(1)} 万` : n.toLocaleString("zh-CN");
}
