/**
 * 全年活动热力图（圆点）—— 今日页回顾段的自绘图表
 * （圆点、色阶随 scale 递增、周列贴底对齐、hover 呼吸、全宽自适应；
 * 图例含连续活跃天数角标）。
 * 零业务依赖：输入为 {date, count}[] 纯数据；色板为暖纸主题陶土橙阶
 * （accent 的 alpha 派生，随主题换肤时需同步调整）。
 */

import clsx from "clsx";
import { useMemo, type ReactNode } from "react";
function dateStr(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 日期部件步进（跨 DST 切换日不会像 +86400000ms 那样重复/跳过一天） */
function nextDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
function prevDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
}

/** 热力点色阶：0 → 淡底，s1-s4 → 陶土橙 alpha 递增 + 尺寸递增（模板 1:1） */
const DOT_LEVELS = [
  "bg-accent/10 scale-[0.72]",
  "bg-accent/30 scale-[0.78]",
  "bg-accent/50 scale-[0.85]",
  "bg-accent/75 scale-[0.92]",
  "bg-accent scale-100",
] as const;

function levelIndex(count: number): number {
  if (count === 0) return 0;
  if (count < 5) return 1;
  if (count < 10) return 2;
  if (count < 20) return 3;
  return 4;
}

/** 图例/热力格共用的点样式（legend 传 size="sm" 10px，格内 full） */
function dotClass(level: number, size: "full" | "sm" = "full"): string {
  return clsx("rounded-full", size === "full" ? "size-full" : "size-2.5", DOT_LEVELS[level]);
}

export interface YearHeatmapDay {
  date: string; // YYYY-MM-DD
  count: number;
}

export function YearHeatmap({ days, caption }: { days: YearHeatmapDay[]; caption?: ReactNode }) {
  const { weeks, monthSpans, countByDate } = useMemo(() => {
    const countByDate = new Map(days.map(i => [i.date, i.count]));
    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const weeks: string[][] = [];
    let week: string[] = [];
    for (let d = new Date(start); d <= end; d = nextDay(d)) {
      week.push(dateStr(d.getTime()));
      if (d.getDay() === 0) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) weeks.push(week);

    // 月份标签：连续同月的周数合并（flex-grow 与格子列同步伸缩）
    const monthSpans: { label: string; weeks: number }[] = [];
    let curM = -1;
    for (const w of weeks) {
      const m = Number(w[0].slice(5, 7));
      if (m !== curM) {
        monthSpans.push({ label: `${m}月`, weeks: 0 });
        curM = m;
      }
      monthSpans[monthSpans.length - 1].weeks += 1;
    }
    return { weeks, monthSpans, countByDate };
  }, [days]);

  const today = dateStr(Date.now());

  // 连续活跃天数：从今天（或昨天）往前数 count > 0 的连续天数
  const streak = useMemo(() => {
    let n = 0;
    let d = new Date();
    d.setHours(12, 0, 0, 0);
    // 今天没数据则从昨天起算
    if ((countByDate.get(dateStr(d.getTime())) ?? 0) === 0) d = prevDay(d);
    for (;;) {
      if ((countByDate.get(dateStr(d.getTime())) ?? 0) > 0) {
        n += 1;
        d = prevDay(d);
      } else break;
    }
    return n;
  }, [countByDate]);

  return (
    <div>
      <div className="text-ink-3 mb-[5px] flex text-[10.5px]">
        {monthSpans.map(span => (
          <span key={span.label} className="truncate" style={{ flex: `${span.weeks} 1 0` }}>
            {span.label}
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        {weeks.map((w, wi) => (
          <div
            key={wi}
            className={clsx(
              "flex min-w-0 flex-1 flex-col items-center gap-1",
              wi === weeks.length - 1 ? "justify-start" : "justify-end"
            )}
          >
            {w.map(day => {
              const future = day > today;
              const count = future ? 0 : (countByDate.get(day) ?? 0);
              return (
                <div
                  key={day}
                  className="hover:animate-hm-pulse aspect-square w-full shrink-0"
                  title={future ? day : `${day} · ${count} 次操作`}
                >
                  <div className={dotClass(future ? 0 : levelIndex(count))} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="text-ink-3 mt-2 flex items-center justify-end gap-1 text-[10.5px]">
        少
        <span className={dotClass(0, "sm")} />
        <span className={dotClass(1, "sm")} />
        <span className={dotClass(2, "sm")} />
        <span className={dotClass(3, "sm")} />
        <span className={dotClass(4, "sm")} />多
        <span className="ml-2.5">{caption ?? `连续活跃 ${streak} 天`}</span>
      </div>
    </div>
  );
}
