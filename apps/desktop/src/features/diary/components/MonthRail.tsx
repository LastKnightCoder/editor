/**
 * 时间刻度（D-044）：贴在纸的右缘，列出流中出现的月份（跨年插年份），滚动时高亮当前月，
 * 点击跳过去。平时淡、悬停纸面时显形——不和正文抢注意力。
 * 纵贯整张纸：层级高于底部输入条层（那层是整宽透明容器，输入框只居中占一段，
 * 右缘视觉上是空的，刻度压在其上才点得到）。月份多于一屏时刻度自身可滚（隐藏滚动条、边缘渐隐），当前月始终滚进可见区。
 */

import { useEffect, useState } from "react";
import { cn, useEdgeFade } from "@tau/ui";

export function MonthRail({
  months,
  current,
  thisYear,
  onJump,
}: {
  /** YYYY-MM，与流同序（新在前） */
  months: string[];
  current: string | null;
  thisYear: string;
  onJump: (month: string) => void;
}) {
  const [railEl, setRailEl] = useState<HTMLElement | null>(null);
  useEdgeFade(railEl);

  // 当前月跟随流滚动变化：只滚刻度自身（scrollIntoView 会连带滚动流）
  useEffect(() => {
    const el = railEl?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!railEl || !el) return;
    const pad = 28;
    if (el.offsetTop - pad < railEl.scrollTop) railEl.scrollTo({ top: el.offsetTop - pad });
    else if (el.offsetTop + el.offsetHeight + pad > railEl.scrollTop + railEl.clientHeight)
      railEl.scrollTo({ top: el.offsetTop + el.offsetHeight + pad - railEl.clientHeight });
  }, [railEl, current]);

  if (months.length < 2) return null;
  let lastYear = thisYear;
  return (
    <nav
      ref={setRailEl}
      aria-label="按月跳转"
      className="edge-fade-scroll scrollbar-hide absolute bottom-3.5 right-2.5 top-3.5 z-[5] flex w-14 flex-col items-end gap-0.5 overflow-y-auto overscroll-contain pb-2"
    >
      {months.map(month => {
        const year = month.slice(0, 4);
        const showYear = year !== lastYear;
        lastYear = year;
        const on = month === current;
        return (
          <div key={month} className="contents">
            {showYear && (
              <span className="text-tau-tiny text-ink-3 font-tau-mono px-2 pb-0.5 pt-2 opacity-70">
                {year}
              </span>
            )}
            <button
              type="button"
              onClick={() => onJump(month)}
              aria-current={on ? "true" : undefined}
              className={cn(
                "text-tau-sm h-[22px] shrink-0 rounded-[7px] px-2 tabular-nums transition-[opacity,color,background] duration-[160ms]",
                "hover:bg-hover hover:text-ink-1 group-hover/sheet:opacity-100",
                on ? "text-accent-text font-semibold opacity-100" : "text-ink-3 opacity-55"
              )}
            >
              {Number(month.slice(5))}月
            </button>
          </div>
        );
      })}
    </nav>
  );
}
