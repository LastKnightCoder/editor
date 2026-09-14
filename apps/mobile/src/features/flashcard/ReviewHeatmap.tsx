// 复习热力图（GitHub 贡献图式）：每格一天，五档品牌色色阶（styles.css --heat-0..4）。
// 数据复用 flashcard_review_stats（按本地时区 dayStarts 聚合）；连续天数由前端推导。
// 点格在区块内展开当日详情（设计稿 docs/flashcard-mobile-ui-demos/flashcard-heatmap-design.html 画框⑥四种形态）。

import { useMemo, useState } from "react";
import { REVIEW_RATINGS } from "./constants";
import type { FlashcardReviewDayStats } from "./types";

const RANGES = [
  { key: "quarter", label: "3 个月", days: 13 * 7, cell: 17 },
  { key: "half", label: "半年", days: 26 * 7, cell: 13 },
  { key: "year", label: "1 年", days: 52 * 7, cell: 9 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const GAP = 3;
const WEEK_LABELS = ["一", "", "三", "", "五", "", "日"];
const WEEKDAY_CN = ["日", "一", "二", "三", "四", "五", "六"];

/** 阈值与设计稿一致：0 / 1-4 / 5-14 / 15-29 / 30+ */
function heatClass(count: number): string {
  if (count <= 0) return "var(--heat-0)";
  if (count < 5) return "var(--heat-1)";
  if (count < 15) return "var(--heat-2)";
  if (count < 30) return "var(--heat-3)";
  return "var(--heat-4)";
}

/** 当前连续天数：今天有记录从今天起算，否则从昨天；最长连续遍历全量 */
function streaksOf(stats: FlashcardReviewDayStats[]): { current: number; best: number } {
  const active = stats.map(day => day.count > 0);
  let best = 0;
  let run = 0;
  for (const isActive of active) {
    run = isActive ? run + 1 : 0;
    best = Math.max(best, run);
  }
  // 今天还没复习不打断当前连续（昨天及以前连续即算保持中）
  const todayActive = active.length > 0 && active[active.length - 1];
  const cursor = todayActive ? active.length - 1 : active.length - 2;
  let current = 0;
  for (let i = cursor; i >= 0 && active[i]; i--) current += 1;
  return { current, best };
}

type ReviewHeatmapProps = {
  /** 升序的按天统计（统计页以 365 天单查询供趋势/分布/热力图共用） */
  stats: FlashcardReviewDayStats[];
  /** 今天剩余到期数（>0 时今天详情显示「继续复习」） */
  dueToday: number;
  onOpenReview?: () => void;
};

export function ReviewHeatmap({ stats, dueToday, onOpenReview }: ReviewHeatmapProps) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("half");
  const [selectedStart, setSelectedStart] = useState<number | null>(null);
  const range = RANGES.find(item => item.key === rangeKey) ?? RANGES[1];

  const hasAnyRecord = stats.some(day => day.count > 0);
  const streaks = useMemo(() => streaksOf(stats), [stats]);
  const maxCount = useMemo(() => Math.max(0, ...stats.map(day => day.count)), [stats]);

  // 网格：按周一列对齐（首行周一），月初列挂月份标签
  const grid = useMemo(() => {
    const days = stats.slice(-range.days);
    const firstDow = days.length > 0 ? (new Date(days[0].dayStart).getDay() + 6) % 7 : 0;
    const columns: Array<Array<FlashcardReviewDayStats | null>> = [];
    let currentColumn: Array<FlashcardReviewDayStats | null> = Array.from(
      { length: firstDow },
      () => null
    );
    for (const day of days) {
      const dow = (new Date(day.dayStart).getDay() + 6) % 7;
      if (dow === 0 && currentColumn.length > 0) {
        columns.push(currentColumn);
        currentColumn = [];
      }
      currentColumn[dow] = day;
    }
    if (currentColumn.length > 0) columns.push(currentColumn);
    return columns;
  }, [stats, range.days]);

  const todayStart = stats.length > 0 ? stats[stats.length - 1].dayStart : 0;
  const selected = stats.find(day => day.dayStart === selectedStart) ?? null;

  if (!hasAnyRecord) {
    return (
      <div className="bg-surface shadow-card rounded-[20px] p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-meta-ink text-[12.5px] font-extrabold">复习热力图</span>
          <span className="text-meta-ink text-[11.5px] font-bold">连续 0 天</span>
        </div>
        <div className="py-7 text-center">
          <div className="text-[34px]">🌱</div>
          <div className="text-ink-2 mt-2.5 text-[13.5px] font-extrabold">格子还是空的</div>
          <div className="text-ink-3 mt-1.5 text-[12px] font-semibold">
            每天复习几张，看着颜色一点点变深
          </div>
          {onOpenReview ? (
            <button
              type="button"
              onClick={onOpenReview}
              className="shadow-accent mt-4 rounded-[14px] px-[22px] py-2.5 text-[13.5px] font-extrabold text-white"
              style={{ background: "var(--brand-grad)" }}
            >
              开始第一轮复习
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface shadow-card rounded-[20px] p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-meta-ink text-[12.5px] font-extrabold">复习热力图</span>
        <span className="text-meta-ink text-[11.5px] font-bold">
          连续 <b className="text-accent">{streaks.current}</b> 天 · 最长{" "}
          <b className="text-accent">{streaks.best}</b> 天
        </span>
      </div>

      {/* 范围切换 */}
      <div className="mb-3 mt-2.5 flex gap-1.5">
        {RANGES.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setRangeKey(item.key)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-extrabold ${
              item.key === rangeKey ? "bg-ink text-[var(--toast-fg)]" : "bg-input text-ink-2"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 网格（1 年横向滚动；月份标签与列槽对齐） */}
      <div className="overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <div style={{ minWidth: "max-content" }}>
          <div className="ml-[23px] flex" style={{ gap: GAP }}>
            {grid.map((column, index) => {
              const first = column.find(day => day !== null);
              const prev = index > 0 ? grid[index - 1]?.find(day => day !== null) : undefined;
              const showMonth =
                first !== undefined &&
                (index === 0 ||
                  prev === undefined ||
                  new Date(prev.dayStart).getMonth() !== new Date(first.dayStart).getMonth());
              return (
                <div key={index} style={{ width: range.cell, flex: "none" }}>
                  {showMonth && first ? (
                    <span className="text-ink-3 whitespace-nowrap text-[10px] font-extrabold">
                      {new Date(first.dayStart).getMonth() + 1}月
                    </span>
                  ) : (
                    <span className="block h-[14px]" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex" style={{ gap: GAP }}>
            <div className="flex w-[20px] flex-none flex-col" style={{ gap: GAP }}>
              {WEEK_LABELS.map((label, index) => (
                <span
                  key={index}
                  className="text-ink-3 text-[9px] font-bold leading-none"
                  style={{ height: range.cell, lineHeight: `${range.cell}px` }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="flex" style={{ gap: GAP }}>
              {grid.map((column, colIndex) => (
                <div key={colIndex} className="flex flex-col" style={{ gap: GAP }}>
                  {Array.from({ length: 7 }, (_, row) => {
                    const day = column[row] ?? null;
                    if (!day) {
                      return <span key={row} style={{ width: range.cell, height: range.cell }} />;
                    }
                    const isToday = day.dayStart === todayStart;
                    const isSelected = day.dayStart === selectedStart;
                    return (
                      <button
                        key={row}
                        type="button"
                        aria-label={`${new Date(day.dayStart).getMonth() + 1}月${new Date(day.dayStart).getDate()}日 复习 ${day.count} 张`}
                        onClick={() => setSelectedStart(isSelected ? null : day.dayStart)}
                        className={`flex-none rounded-[3.5px] transition-transform active:scale-[0.82] ${
                          isToday
                            ? "outline-1.5 outline outline-offset-1 outline-[var(--brand-strong)]"
                            : ""
                        } ${isSelected ? "outline-offset-1.5 outline-2 outline-[var(--brand)]" : ""}`}
                        style={{
                          width: range.cell,
                          height: range.cell,
                          background: heatClass(day.count),
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 图例 */}
      <div className="mt-3 flex items-center justify-end gap-1">
        <span className="text-ink-3 mx-1 text-[10.5px] font-bold">少</span>
        {["var(--heat-0)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"].map(
          color => (
            <i
              key={color}
              className="block h-[11px] w-[11px] rounded-[3px]"
              style={{ background: color }}
            />
          )
        )}
        <span className="text-ink-3 mx-1 text-[10.5px] font-bold">多</span>
      </div>

      {/* 当日详情（设计稿画框⑥：峰值/普通/今天进行中/无记录 四形态） */}
      {selected ? (
        <DayDetail
          day={selected}
          isPeak={selected.count === maxCount && maxCount > 0}
          dueToday={dueToday}
          isToday={selected.dayStart === todayStart}
          onOpenReview={onOpenReview}
        />
      ) : null}
    </div>
  );
}

function DayDetail({
  day,
  isPeak,
  isToday,
  dueToday,
  onOpenReview,
}: {
  day: FlashcardReviewDayStats;
  isPeak: boolean;
  isToday: boolean;
  dueToday: number;
  onOpenReview?: () => void;
}) {
  const date = new Date(day.dayStart);
  const dateLabel = isToday
    ? `今天 · ${date.getMonth() + 1} 月 ${date.getDate()} 日`
    : `${date.getMonth() + 1} 月 ${date.getDate()} 日 · 周${WEEKDAY_CN[date.getDay()]}`;

  return (
    <div className="border-line mt-3 border-t-[1.5px] border-dashed pt-3">
      <div className="text-meta-ink flex items-center justify-between text-[12px] font-extrabold">
        <span>{dateLabel}</span>
        {isPeak ? <span className="text-accent">单日最高 🔥</span> : null}
        {isToday && day.count > 0 ? <span className="text-accent">进行中</span> : null}
      </div>
      {day.count === 0 ? (
        <div className="text-ink-3 mt-2 text-[12.5px] font-semibold">当天没有复习记录</div>
      ) : (
        <>
          <div className="mt-1.5 flex items-baseline gap-2">
            <b className="text-ink text-[26px] font-extrabold leading-none">{day.count}</b>
            <span className="text-ink-2 text-[12px] font-bold">
              张{isToday && dueToday > 0 ? ` · 还剩 ${dueToday} 张到期` : ""}
            </span>
          </div>
          <div className="mt-2.5 flex flex-col gap-[5px]">
            {REVIEW_RATINGS.map(item => {
              const value = day[item.value];
              const percent = day.count > 0 ? Math.round((value / day.count) * 100) : 0;
              return (
                <div key={item.value} className="flex items-center gap-2">
                  <span
                    className="w-[34px] flex-none text-[11px] font-extrabold"
                    style={{ color: item.color }}
                  >
                    {item.label}
                  </span>
                  <div className="bg-input h-2 flex-1 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${percent}%`, background: item.color }}
                    />
                  </div>
                  <span className="text-ink-2 w-5 flex-none text-right text-[11px] font-extrabold">
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
          {isToday && dueToday > 0 && onOpenReview ? (
            <button
              type="button"
              onClick={onOpenReview}
              className="shadow-accent mt-3 w-full rounded-[14px] py-2.5 text-[13.5px] font-extrabold text-white"
              style={{ background: "var(--brand-grad)" }}
            >
              继续复习
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
