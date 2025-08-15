import { memo } from "react";
import { Button, Segmented, Space } from "antd";
import dayjs from "dayjs";
import DayGrid from "./DayGrid";
import WeekGrid from "./WeekGrid";
import MonthGrid from "./MonthGrid";
import YearGrid from "./YearGrid";
import { useLifeViewStore } from "@/stores/useLifeViewStore";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import { useShallow } from "zustand/react/shallow";
import { getLogsByRange } from "@/commands/log";

const CalendarPanel = memo(() => {
  const {
    periodType,
    anchorDate,
    setPeriodType,
    setAnchorDate,
    centuryStartYear,
    setCenturyStartYear,
  } = useLifeViewStore();
  const { timeRecords } = useTimeRecordStore(
    useShallow((s) => ({ timeRecords: s.timeRecords })),
  );

  const goPrev = () => {
    if (periodType === "day") setAnchorDate(anchorDate.add(-1, "month"));
    else if (periodType === "week") setAnchorDate(anchorDate.add(-1, "year"));
    else if (periodType === "month") setAnchorDate(anchorDate.add(-1, "year"));
    else if (periodType === "year") setCenturyStartYear(centuryStartYear - 100);
  };

  const goNext = () => {
    if (periodType === "day") setAnchorDate(anchorDate.add(1, "month"));
    else if (periodType === "week") setAnchorDate(anchorDate.add(1, "year"));
    else if (periodType === "month") setAnchorDate(anchorDate.add(1, "year"));
    else if (periodType === "year") setCenturyStartYear(centuryStartYear + 100);
  };

  const getCounts = async (d: dayjs.Dayjs) => {
    // 记录数：当天的 timeRecords 数
    const dayStr = d.format("YYYY-MM-DD");
    const recordGroup = timeRecords.find((g) => g.date === dayStr);
    const records = recordGroup ? recordGroup.timeRecords.length : 0;
    // 日志数：查询当日范围
    const start = d.startOf("day").valueOf();
    const end = d.endOf("day").valueOf();
    const logs = (
      await getLogsByRange({
        startDate: start,
        endDate: end,
        periodTypes: ["day"],
      })
    ).length;
    return { records, logs };
  };

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Space
        align="center"
        style={{ width: "100%", justifyContent: "space-between" }}
      >
        <Segmented
          value={periodType}
          onChange={(v) => setPeriodType(v as any)}
          options={[
            { label: "日", value: "day" },
            { label: "周", value: "week" },
            { label: "月", value: "month" },
            { label: "年", value: "year" },
          ]}
        />
        <Space>
          <Button size="small" onClick={goPrev}>
            上一
            {periodType === "day"
              ? "月"
              : periodType === "week"
                ? "年"
                : periodType === "month"
                  ? "年"
                  : "世纪"}
          </Button>
          <Button size="small" onClick={goNext}>
            下一
            {periodType === "day"
              ? "月"
              : periodType === "week"
                ? "年"
                : periodType === "month"
                  ? "年"
                  : "世纪"}
          </Button>
        </Space>
      </Space>

      {periodType === "day" && (
        <DayGrid
          monthAnchor={anchorDate}
          selectedDate={anchorDate}
          onSelect={(d) => setAnchorDate(d)}
          // 徽标计数
          getCounts={(d) => {
            // 同步接口是异步；这里返回 undefined 则不渲染，列表可在下次 render 补齐
            // 简易实现：同步读取 timeRecords，日志数采用 0；如需精确可将结果缓存
            const dayStr = d.format("YYYY-MM-DD");
            const recordGroup = timeRecords.find((g) => g.date === dayStr);
            const records = recordGroup ? recordGroup.timeRecords.length : 0;
            return { records, logs: 0 };
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
          centuryStart={centuryStartYear}
          selectedYear={anchorDate.year()}
          onSelect={(y) => setAnchorDate(anchorDate.year(y))}
        />
      )}
    </Space>
  );
});

export default CalendarPanel;
