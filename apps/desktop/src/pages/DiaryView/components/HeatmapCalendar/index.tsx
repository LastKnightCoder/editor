import { memo, useMemo, useEffect } from "react";
import dayjs, { Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import classnames from "classnames";
import {
  LeftOutlined,
  RightOutlined,
  BookOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import useDiaryStore from "@/stores/useDiaryStore";
import MonthPicker from "../MonthPicker";

dayjs.extend(isoWeek);

interface HeatmapCalendarProps {
  onDateSelect?: (date: string) => void;
  onViewModeChange?: (
    mode: "daily" | "weekly" | "monthly" | "timeline",
  ) => void;
}

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

const HeatmapCalendar = memo(
  ({ onDateSelect, onViewModeChange }: HeatmapCalendarProps) => {
    const currentDate = useDiaryStore((state) => state.currentDate);
    const setCurrentDate = useDiaryStore((state) => state.setCurrentDate);
    const heatmapDataCache = useDiaryStore((state) => state.heatmapDataCache);
    const loadHeatmapData = useDiaryStore((state) => state.loadHeatmapData);

    // Only subscribe to diary entries for checking existence (optimized selector)
    const diaryDatesSet = useDiaryStore(
      (state) => {
        const dates = new Set<string>();
        const weeks = new Set<string>();
        const months = new Set<string>();

        state.diaryEntries.forEach((entry) => {
          if (entry.type === "daily") {
            dates.add(entry.date);
          } else if (entry.type === "weekly") {
            weeks.add(entry.date);
          } else if (entry.type === "monthly") {
            months.add(entry.date);
          }
        });

        return { dates, weeks, months };
      },
      (prev, next) =>
        prev.dates.size === next.dates.size &&
        prev.weeks.size === next.weeks.size &&
        prev.months.size === next.months.size &&
        Array.from(prev.dates).every((d) => next.dates.has(d)) &&
        Array.from(prev.weeks).every((w) => next.weeks.has(w)) &&
        Array.from(prev.months).every((m) => next.months.has(m)),
    );

    const currentDateObj = dayjs(currentDate);
    const year = currentDateObj.year();
    const month = currentDateObj.month() + 1; // 1-12
    const monthKey = useMemo(
      () => `${year}-${String(month).padStart(2, "0")}`,
      [year, month],
    );

    const heatmapData = heatmapDataCache.get(monthKey);

    // Load heatmap data for current month or refetch when cache invalidates
    useEffect(() => {
      if (heatmapData === undefined) {
        loadHeatmapData(year, month);
      }
    }, [heatmapData, loadHeatmapData, month, year]);

    // Generate calendar grid (42 cells = 6 weeks × 7 days)
    const calendarDays = useMemo(() => {
      const firstDayOfMonth = dayjs(
        `${year}-${String(month).padStart(2, "0")}-01`,
      );
      const startOfCalendar = firstDayOfMonth.startOf("week");

      const days: Dayjs[] = [];
      for (let i = 0; i < 42; i++) {
        days.push(startOfCalendar.add(i, "day"));
      }

      return days;
    }, [year, month]);

    // Group days into weeks
    const weeks = useMemo(() => {
      const result: Dayjs[][] = [];
      for (let i = 0; i < 6; i++) {
        result.push(calendarDays.slice(i * 7, (i + 1) * 7));
      }
      return result;
    }, [calendarDays]);

    // Get word count for a specific date
    const getWordCount = (date: string): number => {
      if (!heatmapData) return 0;
      const data = heatmapData.find((item) => item.date === date);
      return data?.wordCount || 0;
    };

    // Get heatmap color level (0-4)
    const getHeatLevel = (wordCount: number): number => {
      if (wordCount === 0) return 0;
      if (wordCount < 100) return 1;
      if (wordCount < 300) return 2;
      if (wordCount < 600) return 3;
      return 4;
    };

    // Check if date has diary entry (using cached set)
    const hasDiary = (date: string): boolean => {
      return diaryDatesSet.dates.has(date);
    };

    // Check if week has weekly entry (using cached set)
    const hasWeeklyEntry = (weekDays: Dayjs[]): boolean => {
      const firstDay = weekDays[0];
      const weekString = `${firstDay.isoWeekYear()}-W${String(firstDay.isoWeek()).padStart(2, "0")}`;
      return diaryDatesSet.weeks.has(weekString);
    };

    // Check if month has monthly entry (using cached set)
    const hasMonthlyEntry = (): boolean => {
      const monthString = `${year}-${String(month).padStart(2, "0")}`;
      return diaryDatesSet.months.has(monthString);
    };

    const handlePrevMonth = () => {
      const prevMonth = currentDateObj.subtract(1, "month");
      setCurrentDate(prevMonth.format("YYYY-MM-DD"));
    };

    const handleNextMonth = () => {
      const nextMonth = currentDateObj.add(1, "month");
      setCurrentDate(nextMonth.format("YYYY-MM-DD"));
    };

    const handleMonthChange = (date: dayjs.Dayjs) => {
      setCurrentDate(date.format("YYYY-MM-DD"));
    };

    const handleDateClick = (day: Dayjs) => {
      const dateString = day.format("YYYY-MM-DD");
      setCurrentDate(dateString);
      onDateSelect?.(dateString);
    };

    const isToday = (day: Dayjs) => {
      return day.isSame(dayjs(), "day");
    };

    const isSelected = (day: Dayjs) => {
      return day.isSame(currentDateObj, "day");
    };

    const isCurrentMonth = (day: Dayjs) => {
      return day.month() + 1 === month;
    };

    const handleWeekClick = (weekDays: Dayjs[]) => {
      const firstDay = weekDays[0];
      setCurrentDate(firstDay.format("YYYY-MM-DD"));
      onViewModeChange?.("weekly");
    };

    const handleMonthClick = () => {
      onViewModeChange?.("monthly");
    };

    return (
      <div className="w-full py-5 px-[18px] bg-transparent rounded-none overflow-visible">
        {/* Header */}
        <div className="relative flex items-center justify-between mb-5 gap-2 z-10">
          <button
            className="w-8 h-8 shrink-0 flex items-center justify-center border-none bg-transparent rounded-md cursor-pointer text-gray-500 transition-all hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200"
            onClick={handlePrevMonth}
            aria-label="上个月"
          >
            <LeftOutlined />
          </button>
          <MonthPicker value={currentDateObj} onChange={handleMonthChange} />
          {hasMonthlyEntry() && (
            <FileTextOutlined
              className="text-indigo-500 dark:text-indigo-300 text-base shrink-0 cursor-pointer p-1 rounded transition-all hover:bg-indigo-500/10 dark:hover:bg-indigo-300/10"
              onClick={handleMonthClick}
              title="查看月总结"
            />
          )}
          <button
            className="w-8 h-8 shrink-0 flex items-center justify-center border-none bg-transparent rounded-md cursor-pointer text-gray-500 transition-all hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200"
            onClick={handleNextMonth}
            aria-label="下个月"
          >
            <RightOutlined />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1.5 mb-3 pr-7">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-center text-[10px] text-gray-400 py-1 font-semibold uppercase tracking-wider"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="flex flex-col gap-1.5">
          {weeks.map((weekDays, weekIndex) => (
            <div
              key={weekIndex}
              className="grid grid-cols-[repeat(7,minmax(0,1fr))_24px] gap-1.5 items-stretch"
            >
              {weekDays.map((day) => {
                const dateString = day.format("YYYY-MM-DD");
                const inCurrentMonth = isCurrentMonth(day);
                const wordCount = inCurrentMonth ? getWordCount(dateString) : 0;
                const heatLevel = getHeatLevel(wordCount);
                const hasDiaryEntry = hasDiary(dateString);
                const today = isToday(day);
                const selected = isSelected(day);
                const otherMonth = !inCurrentMonth;

                return (
                  <div
                    key={dateString}
                    className={classnames(
                      "relative w-full aspect-square flex items-center justify-center rounded-lg cursor-pointer transition-all border border-transparent overflow-visible",
                      {
                        // Heat levels
                        "bg-transparent": heatLevel === 0,
                        "bg-indigo-500/10": heatLevel === 1,
                        "bg-indigo-500/25": heatLevel === 2,
                        "bg-indigo-500/60": heatLevel === 3,
                        "bg-indigo-500": heatLevel === 4,
                        "bg-indigo-500! rounded-full! dark:shadow-[0_0_0_2px_rgba(23,125,220,0.3)]":
                          selected,
                        "border-2! border-indigo-500! shadow-[0_0_0_1px_rgba(99,102,241,0.1)]":
                          today && !selected,
                        "hover:bg-indigo-500/8 hover:border-indigo-500/20":
                          !selected,
                      },
                    )}
                    onClick={() => handleDateClick(day)}
                    title={`${dateString}${wordCount > 0 ? ` - ${wordCount}字` : ""}`}
                  >
                    <span
                      className={classnames("text-xs font-medium z-10", {
                        "text-white":
                          selected || heatLevel === 3 || heatLevel === 4,
                        "text-gray-800 dark:text-gray-100":
                          !selected && heatLevel < 3 && !otherMonth,
                        "text-gray-300 dark:text-gray-600!": otherMonth,
                        "font-semibold": selected,
                      })}
                    >
                      {day.date()}
                    </span>
                    {hasDiaryEntry && !selected && (
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-500 dark:bg-[#177ddc] z-20" />
                    )}
                  </div>
                );
              })}
              {/* Weekly indicator */}
              <div
                className="w-6 flex items-center justify-center self-stretch cursor-pointer rounded transition-all hover:bg-emerald-500/10"
                onClick={() =>
                  hasWeeklyEntry(weekDays) && handleWeekClick(weekDays)
                }
                title={hasWeeklyEntry(weekDays) ? "查看周总结" : ""}
              >
                {hasWeeklyEntry(weekDays) && (
                  <BookOutlined className="text-emerald-500 text-sm" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
);

export default HeatmapCalendar;
