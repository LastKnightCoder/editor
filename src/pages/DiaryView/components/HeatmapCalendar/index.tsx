import { memo, useMemo } from "react";
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
import useTheme from "@/hooks/useTheme";
import MonthPicker from "../MonthPicker";
import styles from "./index.module.less";

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
    const { isDark } = useTheme();
    const {
      currentDate,
      diaryEntries,
      setCurrentDate,
      heatmapDataCache,
      loadHeatmapData,
    } = useDiaryStore();

    const currentDateObj = dayjs(currentDate);
    const year = currentDateObj.year();
    const month = currentDateObj.month() + 1; // 1-12

    // Load heatmap data for current month
    useMemo(() => {
      loadHeatmapData(year, month);
    }, [year, month, loadHeatmapData]);

    const heatmapData = heatmapDataCache.get(
      `${year}-${String(month).padStart(2, "0")}`,
    );

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

    // Check if date has diary entry
    const hasDiary = (date: string): boolean => {
      return diaryEntries.some(
        (entry) => entry.type === "daily" && entry.date === date,
      );
    };

    // Check if week has weekly entry
    const hasWeeklyEntry = (weekDays: Dayjs[]): boolean => {
      const firstDay = weekDays[0];
      const weekString = `${firstDay.year()}-W${String(firstDay.isoWeek()).padStart(2, "0")}`;
      return diaryEntries.some(
        (entry) => entry.type === "weekly" && entry.date === weekString,
      );
    };

    // Check if month has monthly entry
    const hasMonthlyEntry = (): boolean => {
      const monthString = `${year}-${String(month).padStart(2, "0")}`;
      return diaryEntries.some(
        (entry) => entry.type === "monthly" && entry.date === monthString,
      );
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

    const calendarClass = classnames(styles.heatmapCalendar, {
      [styles.dark]: isDark,
    });

    return (
      <div className={calendarClass}>
        {/* Header */}
        <div className={styles.header}>
          <button
            className={styles.navButton}
            onClick={handlePrevMonth}
            aria-label="上个月"
          >
            <LeftOutlined />
          </button>
          <MonthPicker value={currentDateObj} onChange={handleMonthChange} />
          {hasMonthlyEntry() && (
            <FileTextOutlined
              className={styles.monthlyIndicator}
              onClick={handleMonthClick}
              title="查看月总结"
            />
          )}
          <button
            className={styles.navButton}
            onClick={handleNextMonth}
            aria-label="下个月"
          >
            <RightOutlined />
          </button>
        </div>

        {/* Weekday headers */}
        <div className={styles.weekdayHeader}>
          {WEEKDAYS.map((day) => (
            <div key={day} className={styles.weekday}>
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className={styles.calendarGrid}>
          {weeks.map((weekDays, weekIndex) => (
            <div key={weekIndex} className={styles.weekRow}>
              {weekDays.map((day) => {
                const dateString = day.format("YYYY-MM-DD");
                const wordCount = getWordCount(dateString);
                const heatLevel = getHeatLevel(wordCount);
                const hasDiaryEntry = hasDiary(dateString);

                return (
                  <div
                    key={dateString}
                    className={classnames(styles.dayCell, {
                      [styles.today]: isToday(day),
                      [styles.selected]: isSelected(day),
                      [styles.otherMonth]: !isCurrentMonth(day),
                      [styles.heatLevel0]: heatLevel === 0,
                      [styles.heatLevel1]: heatLevel === 1,
                      [styles.heatLevel2]: heatLevel === 2,
                      [styles.heatLevel3]: heatLevel === 3,
                      [styles.heatLevel4]: heatLevel === 4,
                    })}
                    onClick={() => handleDateClick(day)}
                    title={`${dateString}${wordCount > 0 ? ` - ${wordCount}字` : ""}`}
                  >
                    <span className={styles.dayNumber}>{day.date()}</span>
                    {hasDiaryEntry && <div className={styles.diaryDot} />}
                  </div>
                );
              })}
              {/* Weekly indicator */}
              <div
                className={styles.weekIndicator}
                onClick={() =>
                  hasWeeklyEntry(weekDays) && handleWeekClick(weekDays)
                }
                title={hasWeeklyEntry(weekDays) ? "查看周总结" : ""}
              >
                {hasWeeklyEntry(weekDays) && (
                  <BookOutlined className={styles.weeklyIcon} />
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
