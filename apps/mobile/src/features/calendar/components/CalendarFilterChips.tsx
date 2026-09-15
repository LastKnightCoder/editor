// 日历可见性快捷过滤 chips（横向滚动）：色点 + 名称，off 态半透明；
// 点击切换 visibleIds（localStorage 持久化由主页承载）。

import { memo, useRef } from "react";
import { useMobileTheme } from "../../../hooks/useMobileTheme";
import { useEdgeFadeX } from "../../../hooks/useScrollState";
import { calendarColorValue } from "../constants";
import type { Calendar } from "../types";

type CalendarFilterChipsProps = {
  calendars: Calendar[];
  visibleIds: number[];
  onToggle: (calendar: Calendar) => void;
};

function CalendarFilterChipsImpl({ calendars, visibleIds, onToggle }: CalendarFilterChipsProps) {
  const { isDark } = useMobileTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFadeX(scrollRef);
  if (calendars.length === 0) {
    return null;
  }
  return (
    // 左右间距挂外层包裹层：padding 若落在滚动容器上，chip 滚到中间会贴屏幕边缘
    <div className="flex-none px-[18px] pt-2.5">
      <div ref={scrollRef} className="edge-fade-x-scroll scrollbar-hide flex gap-2 overflow-x-auto">
        {calendars.map(calendar => {
          const on = visibleIds.includes(calendar.id);
          return (
            <button
              key={calendar.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(calendar)}
              className={`bg-surface shadow-card flex h-[30px] flex-none items-center gap-1.5 rounded-full px-3 text-[12px] font-bold transition ${
                on ? "text-ink-2" : "text-ink-2 opacity-40"
              }`}
            >
              <i
                className="h-2 w-2 rounded-full"
                style={{
                  background: on ? calendarColorValue(calendar.color, isDark) : "var(--ink-3)",
                }}
              />
              {calendar.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const CalendarFilterChips = memo(CalendarFilterChipsImpl);
