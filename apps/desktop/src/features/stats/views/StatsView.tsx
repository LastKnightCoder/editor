/**
 * 统计（数据回顾）页 —— 总览卡 / 全年活动热力图 / 近 30 天产出趋势 / 闪卡牌组概览。
 * 图表全手写 CSS（零 antd/echarts 依赖），样式 Tailwind 优先（D-013），
 * 配色走 --tau-* 语义类（热力色阶为 accent 定稿值的 alpha 派生）。
 */

import clsx from "clsx";
import { EmptyNote, Panel, PanelNote, PanelTitle } from "@/ui/primitives/Panel";
import { useStatsSnapshot } from "../queries";
import type { TrendDay } from "../types";

export function StatsView() {
  const { data, loading } = useStatsSnapshot();

  if (loading) {
    return (
      <div className="pt-6.5 mx-auto max-w-[1680px] px-[34px]">
        <p className="text-tau-meta text-ink-2">加载中…</p>
      </div>
    );
  }
  if (!data) return null;
  const { totals, heatmap, trend, decks } = data;

  return (
    <div className="pt-6.5 mx-auto max-w-[1680px] px-[34px] pb-14">
      {/* ── 总览卡 ── */}
      <div className="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5">
        <Total label="累计卡片" value={totals.cards} accent />
        <Total label="累计文章" value={totals.articles} accent />
        <Total label="日记" value={totals.diaries} />
        <Total label="待办未完成" value={totals.todoPending} />
        <Total label="累计专注" value={formatHours(totals.focusMinutesTotal)} />
        <Total label="累计写下" value={`${totals.wordsTotal} 字`} />
      </div>

      {/* ── 全年活动热力图 ── */}
      <Panel>
        <PanelTitle className="mb-1.5">
          活动<PanelNote>{new Date().getFullYear()} 年 · 每日操作</PanelNote>
        </PanelTitle>
        <YearHeatmap days={heatmap} />
      </Panel>

      {/* ── 近 30 天产出趋势 ── */}
      <div className="mt-3.5 grid grid-cols-[minmax(0,1.75fr)_minmax(280px,1fr)] gap-3.5">
        <Panel>
          <PanelTitle className="mb-1.5">
            近 30 天字数<PanelNote>共 {trend.reduce((s, d) => s + d.words, 0)} 字</PanelNote>
          </PanelTitle>
          <BarTrend trend={trend} pick={d => d.words} />
        </Panel>
        <Panel>
          <PanelTitle className="mb-1.5">
            近 30 天新建
            <PanelNote>
              卡片 {trend.reduce((s, d) => s + d.cardsCreated, 0)} · 文章{" "}
              {trend.reduce((s, d) => s + d.articlesCreated, 0)}
            </PanelNote>
          </PanelTitle>
          <BarTrend trend={trend} pick={d => d.cardsCreated} secondPick={d => d.articlesCreated} />
        </Panel>
      </div>

      {/* ── 闪卡牌组概览 ── */}
      <Panel className="mt-3.5">
        <PanelTitle className="mb-1.5">
          闪卡牌组<PanelNote>复习进度与到期分布</PanelNote>
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
                className="rounded-tau-sm ease-tau-out hover:bg-hover flex items-center gap-3.5 px-2 py-2.5 transition-[background] duration-[160ms]"
              >
                <span className="text-tau-body w-[140px] truncate font-medium" title={deck.name}>
                  {deck.name}
                </span>
                <span className="bg-sunken flex h-2 flex-1 overflow-hidden rounded">
                  <i
                    className="bg-warn h-full"
                    style={{ width: pct(deck.dueCount, deck.totalCards) }}
                  />
                  <i
                    className="bg-accent h-full opacity-80"
                    style={{ width: pct(deck.learningCount, deck.totalCards) }}
                  />
                  <i
                    className="bg-ok h-full opacity-55"
                    style={{ width: pct(done, deck.totalCards) }}
                  />
                </span>
                <span className="text-tau-micro text-ink-2 truncate whitespace-nowrap tabular-nums">
                  <b className="text-ink-1">{deck.dueCount}</b> 到期 · {deck.learningCount} 学习中 ·
                  共 {deck.totalCards}
                </span>
              </div>
            );
          })
        ) : (
          <EmptyNote>还没有闪卡牌组</EmptyNote>
        )}
      </Panel>
    </div>
  );
}

/* ---------- 域内组件 ---------- */

function Total({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <Panel pad="none" className="px-[18px] pb-[13px] pt-4">
      <b
        className={clsx(
          "block text-[24px] font-semibold tabular-nums leading-[1.25] tracking-[-0.01em]",
          accent && "text-accent-text"
        )}
      >
        {typeof value === "number" ? value.toLocaleString("zh-CN") : value}
      </b>
      <span className="text-tau-micro text-ink-3">{label}</span>
    </Panel>
  );
}

function pct(part: number, total: number): string {
  return total <= 0 ? "0%" : `${(part / total) * 100}%`;
}

function formatHours(min: number): string {
  if (min < 60) return `${min} 分钟`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

/** 热力格色阶：0 → sunken 底，1-4 → 陶土橙 alpha 递增（accent 定稿值派生） */
const HEAT_LEVELS = [
  "bg-sunken",
  "bg-[rgba(217,119,87,0.28)]",
  "bg-[rgba(217,119,87,0.48)]",
  "bg-[rgba(217,119,87,0.7)]",
  "bg-[rgba(217,119,87,0.95)]",
] as const;

function heatCellClass(level: number, size = "size-3.5 rounded-[4px]"): string {
  return clsx(size, HEAT_LEVELS[level]);
}

/** 全年热力图：按周分列（周一开头），月份标签按各月占据的周数分布。 */
function YearHeatmap({ days }: { days: { date: string; count: number }[] }) {
  if (days.length === 0) return <EmptyNote>暂无活动数据</EmptyNote>;
  const countByDate = new Map(days.map(d => [d.date, d.count]));
  const max = Math.max(...days.map(d => d.count), 1);
  const year = new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const todayStr = `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

  // 首列对齐周一
  const offset = (start.getDay() + 6) % 7;
  const cells: { date?: string; count: number }[] = [];
  for (let i = 0; i < offset; i++) cells.push({ count: -1 });
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    cells.push({ date: key, count: countByDate.get(key) ?? 0 });
  }

  // 月份标签：每月第一格所在列位置
  const monthMarks: { col: number; label: string }[] = [];
  let lastMonth = -1;
  cells.forEach((cell, i) => {
    if (!cell.date) return;
    const m = Number(cell.date.slice(5, 7)) - 1;
    if (m !== lastMonth) {
      monthMarks.push({ col: Math.floor(i / 7), label: `${m + 1}月` });
      lastMonth = m;
    }
  });
  const totalCols = Math.ceil(cells.length / 7);

  return (
    <div className="overflow-x-auto pb-1.5">
      <div className="mb-1 flex gap-[3px]">
        {monthMarks.map(mark => (
          <span
            key={mark.label}
            className="text-ink-3 truncate text-[10.5px] tabular-nums"
            style={{ marginLeft: `${mark.col * 17}px`, width: `${17 * 4}px`, flex: "none" }}
          >
            {mark.label}
          </span>
        ))}
      </div>
      <div
        className="grid-auto-cols-[14px] grid grid-flow-col grid-rows-[repeat(7,14px)] gap-[3px]"
        role="img"
        aria-label="全年活动热力图"
      >
        {cells.map((cell, i) =>
          cell.date ? (
            <span
              key={cell.date}
              className={clsx(
                heatCellClass(
                  cell.count === 0 ? 0 : Math.min(4, Math.ceil((cell.count / max) * 4))
                ),
                "data-[future]:pointer-events-none data-[future]:opacity-0"
              )}
              data-future={cell.date > todayStr || undefined}
              title={`${cell.date} · ${cell.count} 次活动`}
            />
          ) : (
            <span key={`pad-${i}`} style={{ opacity: 0 }} />
          )
        )}
      </div>
      <div className="text-ink-3 mt-1.5 flex items-center justify-end gap-1 text-[10.5px]">
        少
        <span className={heatCellClass(0, "size-[11px] rounded-[3px]")} />
        <span className={heatCellClass(1, "size-[11px] rounded-[3px]")} />
        <span className={heatCellClass(2, "size-[11px] rounded-[3px]")} />
        <span className={heatCellClass(3, "size-[11px] rounded-[3px]")} />
        <span className={heatCellClass(4, "size-[11px] rounded-[3px]")} />多
        <span className="text-ink-3 ml-2">{totalCols} 周</span>
      </div>
    </div>
  );
}

/** 柱状趋势：pick 为主系列；secondPick 存在时画双段（卡片+文章）。 */
function BarTrend({
  trend,
  pick,
  secondPick,
}: {
  trend: TrendDay[];
  pick: (d: TrendDay) => number;
  secondPick?: (d: TrendDay) => number;
}) {
  if (trend.length === 0) return <EmptyNote>暂无数据</EmptyNote>;
  const max = Math.max(...trend.map(d => pick(d) + (secondPick?.(d) ?? 0)), 1);
  return (
    <>
      <div className="flex h-[120px] items-end gap-[3px] pt-1">
        {trend.map(day => {
          const primary = pick(day);
          const second = secondPick?.(day) ?? 0;
          return (
            <div
              key={day.date}
              className="flex h-full min-w-1.5 flex-1 flex-col justify-end gap-px"
              title={`${day.date}：${primary}${secondPick ? ` + ${second}` : ""}`}
            >
              {secondPick && (
                <i
                  className="bg-tag-2 block min-h-0 rounded-t-[3px] opacity-75"
                  style={{ height: `${(second / max) * 100}%` }}
                />
              )}
              <i
                className="bg-accent block min-h-0 rounded-t-[3px]"
                style={{ height: `${(primary / max) * 100}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[3px]">
        {trend.map((day, i) => (
          <span
            key={day.date}
            className="text-ink-3 min-w-1.5 flex-1 truncate text-center text-[9.5px] tabular-nums"
          >
            {i % 5 === 0 ? day.date.slice(5) : ""}
          </span>
        ))}
      </div>
    </>
  );
}
