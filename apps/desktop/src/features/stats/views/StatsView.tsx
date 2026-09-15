/**
 * 统计（数据回顾）页 —— 总览卡 / 全年活动热力图 / 近 30 天产出趋势 / 闪卡牌组概览。
 * 图表全手写 CSS（零 antd/echarts 依赖），配色走 --tau-* 主题 token。
 */

import { useStatsSnapshot } from "../queries";
import type { TrendDay } from "../types";
import "../stats.css";

export function StatsView() {
  const { data, loading } = useStatsSnapshot();

  if (loading) {
    return (
      <div className="wide">
        <p className="hero-date">加载中…</p>
      </div>
    );
  }
  if (!data) return null;
  const { totals, heatmap, trend, decks } = data;

  return (
    <div className="wide">
      {/* ── 总览卡 ── */}
      <div className="st-totals">
        <Total label="累计卡片" value={totals.cards} accent />
        <Total label="累计文章" value={totals.articles} accent />
        <Total label="日记" value={totals.diaries} />
        <Total label="待办未完成" value={totals.todoPending} />
        <Total label="累计专注" value={formatHours(totals.focusMinutesTotal)} />
        <Total label="累计写下" value={`${totals.wordsTotal} 字`} />
      </div>

      {/* ── 全年活动热力图 ── */}
      <section className="board">
        <h2 className="board-title">
          活动<small>{new Date().getFullYear()} 年 · 每日操作</small>
        </h2>
        <YearHeatmap days={heatmap} />
      </section>

      {/* ── 近 30 天产出趋势 ── */}
      <div className="home-grid" style={{ marginTop: 14 }}>
        <section className="board">
          <h2 className="board-title">
            近 30 天字数<small>共 {trend.reduce((s, d) => s + d.words, 0)} 字</small>
          </h2>
          <BarTrend trend={trend} pick={d => d.words} />
        </section>
        <section className="board">
          <h2 className="board-title">
            近 30 天新建
            <small>
              卡片 {trend.reduce((s, d) => s + d.cardsCreated, 0)} · 文章{" "}
              {trend.reduce((s, d) => s + d.articlesCreated, 0)}
            </small>
          </h2>
          <BarTrend trend={trend} pick={d => d.cardsCreated} secondPick={d => d.articlesCreated} />
        </section>
      </div>

      {/* ── 闪卡牌组概览 ── */}
      <section className="board" style={{ marginTop: 14 }}>
        <h2 className="board-title">
          闪卡牌组<small>复习进度与到期分布</small>
        </h2>
        {decks.length > 0 ? (
          decks.map(deck => {
            const done = Math.max(
              0,
              deck.totalCards - deck.dueCount - deck.learningCount - deck.newCount
            );
            return (
              <div key={deck.id} className="st-deck">
                <span className="name" title={deck.name}>
                  {deck.name}
                </span>
                <span className="track">
                  <i className="due" style={{ width: pct(deck.dueCount, deck.totalCards) }} />
                  <i
                    className="learning"
                    style={{ width: pct(deck.learningCount, deck.totalCards) }}
                  />
                  <i className="done" style={{ width: pct(done, deck.totalCards) }} />
                </span>
                <span className="nums">
                  <b>{deck.dueCount}</b> 到期 · {deck.learningCount} 学习中 · 共 {deck.totalCards}
                </span>
              </div>
            );
          })
        ) : (
          <Empty text="还没有闪卡牌组" />
        )}
      </section>
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
    <div className={`st-total${accent ? "accent" : ""}`}>
      <b>{typeof value === "number" ? value.toLocaleString("zh-CN") : value}</b>
      <span>{label}</span>
    </div>
  );
}

function pct(part: number, total: number): string {
  return total <= 0 ? "0%" : `${(part / total) * 100}%`;
}

function formatHours(min: number): string {
  if (min < 60) return `${min} 分钟`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

/** 全年热力图：按周分列（周一开头），月份标签按各月占据的周数分布。 */
function YearHeatmap({ days }: { days: { date: string; count: number }[] }) {
  if (days.length === 0) return <Empty text="暂无活动数据" />;
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
    <div className="st-heat-wrap">
      <div className="st-heat-months">
        {monthMarks.map(mark => (
          <span
            key={mark.label}
            className="st-heat-month"
            style={{ marginLeft: `${mark.col * 17}px`, width: `${17 * 4}px`, flex: "none" }}
          >
            {mark.label}
          </span>
        ))}
      </div>
      <div className="st-heat" role="img" aria-label="全年活动热力图">
        {cells.map((cell, i) =>
          cell.date ? (
            <span
              key={cell.date}
              className="st-heat-cell"
              data-level={cell.count === 0 ? 0 : Math.min(4, Math.ceil((cell.count / max) * 4))}
              data-future={cell.date > todayStr || undefined}
              title={`${cell.date} · ${cell.count} 次活动`}
            />
          ) : (
            <span key={`pad-${i}`} style={{ opacity: 0 }} />
          )
        )}
      </div>
      <div className="st-heat-legend">
        少
        <span className="st-heat-cell" />
        <span className="st-heat-cell" data-level="1" />
        <span className="st-heat-cell" data-level="2" />
        <span className="st-heat-cell" data-level="3" />
        <span className="st-heat-cell" data-level="4" />多
        <span style={{ marginLeft: 8, color: "var(--tau-ink-3)" }}>{totalCols} 周</span>
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
  if (trend.length === 0) return <Empty text="暂无数据" />;
  const max = Math.max(...trend.map(d => pick(d) + (secondPick?.(d) ?? 0)), 1);
  return (
    <>
      <div className="st-bars">
        {trend.map(day => {
          const primary = pick(day);
          const second = secondPick?.(day) ?? 0;
          return (
            <div
              key={day.date}
              className="st-bar"
              title={`${day.date}：${primary}${secondPick ? ` + ${second}` : ""}`}
            >
              {secondPick && (
                <i style={{ height: `${(second / max) * 100}%` }} className="articles" />
              )}
              <i style={{ height: `${(primary / max) * 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="st-axis">
        {trend.map((day, i) => (
          <span key={day.date}>{i % 5 === 0 ? day.date.slice(5) : ""}</span>
        ))}
      </div>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p
      className="board-note"
      style={{ background: "var(--tau-bg-group)", color: "var(--tau-ink-3)" }}
    >
      {text}
    </p>
  );
}
