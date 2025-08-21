import { memo, useEffect, useState } from "react";
import { Button, Segmented, Space } from "antd";
import DayGrid from "./DayGrid";
import WeekGrid from "./WeekGrid";
import MonthGrid from "./MonthGrid";
import YearGrid from "./YearGrid";
import { useLifeViewStore } from "@/stores/useLifeViewStore";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import { useShallow } from "zustand/react/shallow";
import { getLogsByRange, LogEntry } from "@/commands/log";

const CalendarPanel = memo(() => {
  const { periodType, anchorDate, setPeriodType, setAnchorDate } =
    useLifeViewStore();
  const { timeRecords } = useTimeRecordStore(
    useShallow((s) => ({ timeRecords: s.timeRecords })),
  );

  // 缓存当前月份的日志数据
  const [monthLogs, setMonthLogs] = useState<LogEntry[]>([]);

  // 当日历切换到日视图或日期变化时，重新加载日志数据
  const currentMonth = anchorDate.format("YYYY-MM");
  useEffect(() => {
    if (periodType === "day") {
      const monthStart = anchorDate.startOf("month");
      const monthEnd = anchorDate.endOf("month");
      getLogsByRange({
        startDate: monthStart.valueOf(),
        endDate: monthEnd.valueOf(),
        periodTypes: ["day"], // 只查询日记
      })
        .then(setMonthLogs)
        .catch(() => setMonthLogs([]));
    }
  }, [periodType, currentMonth, anchorDate]);

  // 当在日视图且日志模式下，如果当前日期只有一篇日记，自动打开它
  const { activeTab, setActiveLogId } = useLifeViewStore();
  useEffect(() => {
    if (periodType === "day" && activeTab === "logs" && monthLogs.length > 0) {
      const dayStart = anchorDate.startOf("day").valueOf();
      const dayEnd = anchorDate.endOf("day").valueOf();
      const todayLogs = monthLogs.filter(
        (log) => log.start_date >= dayStart && log.end_date <= dayEnd,
      );

      // 如果当天只有一篇日记，自动打开它
      if (todayLogs.length === 1) {
        setActiveLogId(todayLogs[0].id);
      }
    }
  }, [periodType, activeTab, anchorDate, monthLogs, setActiveLogId]);

  const goPrev = () => {
    if (periodType === "day") setAnchorDate(anchorDate.add(-1, "month"));
    else if (periodType === "week") setAnchorDate(anchorDate.add(-1, "year"));
    else if (periodType === "month") setAnchorDate(anchorDate.add(-1, "year"));
  };

  const goNext = () => {
    if (periodType === "day") setAnchorDate(anchorDate.add(1, "month"));
    else if (periodType === "week") setAnchorDate(anchorDate.add(1, "year"));
    else if (periodType === "month") setAnchorDate(anchorDate.add(1, "year"));
  };

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Space
        align="center"
        style={{ width: "100%", justifyContent: "space-between" }}
      >
        <Segmented
          value={periodType}
          onChange={(v) =>
            setPeriodType(v as "day" | "week" | "month" | "year")
          }
          options={[
            { label: "日", value: "day" },
            { label: "周", value: "week" },
            { label: "月", value: "month" },
            { label: "年", value: "year" },
          ]}
        />
        {periodType !== "year" && (
          <Space>
            <Button size="small" onClick={goPrev}>
              上一
              {periodType === "day"
                ? "月"
                : periodType === "week"
                  ? "年"
                  : "年"}
            </Button>
            <Button size="small" onClick={goNext}>
              下一
              {periodType === "day"
                ? "月"
                : periodType === "week"
                  ? "年"
                  : "年"}
            </Button>
          </Space>
        )}
      </Space>

      {periodType === "day" && (
        <DayGrid
          monthAnchor={anchorDate}
          selectedDate={anchorDate}
          onSelect={(d) => setAnchorDate(d)}
          // 徽标计数
          getCounts={(d) => {
            // 查询该日期的时间记录数
            const dayStr = d.format("YYYY-MM-DD");
            const recordGroup = timeRecords.find((g) => g.date === dayStr);
            const records = recordGroup ? recordGroup.timeRecords.length : 0;

            // 查询该日期的日志数量
            const dayStart = d.startOf("day").valueOf();
            const dayEnd = d.endOf("day").valueOf();
            const logs = monthLogs.filter(
              (log) => log.start_date >= dayStart && log.end_date <= dayEnd,
            ).length;

            return { records, logs };
          }}
        />
      )}
      {periodType === "week" && (
        <WeekGrid
          yearAnchor={anchorDate}
          selectedWeekStart={anchorDate.startOf("week")}
          onSelect={(w) => setAnchorDate(w)}
        />
      )}
      {periodType === "month" && (
        <MonthGrid
          yearAnchor={anchorDate}
          selectedMonthAnchor={anchorDate}
          onSelect={(d) => setAnchorDate(d)}
        />
      )}
      {periodType === "year" && (
        <YearGrid
          centuryStart={2000}
          selectedYear={anchorDate.year()}
          onSelect={(y) => setAnchorDate(anchorDate.year(y))}
        />
      )}
    </Space>
  );
});

export default CalendarPanel;
