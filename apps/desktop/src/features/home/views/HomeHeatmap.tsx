/**
 * 活动热力图 —— 与 mockups/home-final.html 定稿 1:1 的自绘实现
 * （旧 CalendarHeatmap 的视觉复刻：圆点、色阶随 scale 递增、周列贴底对齐、
 * hover 呼吸、全宽自适应；色板为暖纸主题陶土橙阶；无图例/连续天数角标）。
 */

import { useMemo } from "react";
import { dateStr } from "@/utils/statistic";
import type { HeatmapItem } from "../types";

/** 日期部件步进（跨 DST 切换日不会像 +86400000ms 那样重复/跳过一天） */
function nextDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
function prevDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
}

function levelClass(count: number): string {
  if (count === 0) return "";
  if (count < 5) return "s1";
  if (count < 10) return "s2";
  if (count < 20) return "s3";
  return "s4";
}

export function HomeHeatmap({ items }: { items: HeatmapItem[] }) {
  const { weeks, monthSpans, countByDate } = useMemo(() => {
    const countByDate = new Map(items.map(i => [i.date, i.count]));
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
  }, [items]);

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
      <div className="hm-months">
        {monthSpans.map(span => (
          <span key={span.label} style={{ flex: `${span.weeks} 1 0` }}>
            {span.label}
          </span>
        ))}
      </div>
      <div className="hm-heat">
        {weeks.map((w, wi) => (
          <div key={wi} className={`hm-week${wi === weeks.length - 1 ? "last" : ""}`}>
            {w.map(day => {
              const future = day > today;
              const count = future ? 0 : (countByDate.get(day) ?? 0);
              return (
                <div key={day} className="hm-day" title={future ? day : `${day} · ${count} 次操作`}>
                  <div className={`hm-dot ${future ? "" : levelClass(count)}`} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="hm-meta">
        少
        <span className="hm-dot" style={{ width: 10, height: 10, transform: "scale(0.72)" }} />
        <span className="hm-dot s1" style={{ width: 10, height: 10 }} />
        <span className="hm-dot s2" style={{ width: 10, height: 10 }} />
        <span className="hm-dot s3" style={{ width: 10, height: 10 }} />
        <span className="hm-dot s4" style={{ width: 10, height: 10 }} />多
        <span style={{ marginLeft: 10 }}>连续活跃 {streak} 天</span>
      </div>
    </div>
  );
}
