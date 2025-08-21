import { memo, useEffect } from "react";
import TimeRecordStatistic from "@/pages/TimeRecordView/TimeRecord";
import { useLifeViewStore } from "@/stores/useLifeViewStore";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import { useShallow } from "zustand/react/shallow";
import { EFilterType } from "@/types/time";

const RecordCharts = memo(() => {
  // 直接复用 TimeRecordStatistic，它内部根据 store 的 filterType/Value 渲染
  // 这里同步设置筛选，使图表匹配左侧所选周期
  const { periodType, anchorDate } = useLifeViewStore();
  const { filterType, filterValue } = useTimeRecordStore(
    useShallow((s) => ({
      filterType: s.filterType,
      filterValue: s.filterValue,
    })),
  );

  // 使用 useEffect 来同步筛选，避免在渲染过程中修改状态
  useEffect(() => {
    if (periodType === "day") {
      const value = anchorDate.format("YYYY-MM-DD");
      if (filterType !== EFilterType.DATE || filterValue !== value) {
        useTimeRecordStore.setState({
          filterType: EFilterType.DATE,
          filterValue: value,
        });
      }
    } else if (periodType === "week") {
      const year = anchorDate.year();
      // dayjs week 取值，基于 isoWeek 插件时可直接使用；这里按现有实现沿用
      const week = anchorDate.week();
      const value = `${year}-${week}周`;
      if (filterType !== EFilterType.WEEK || filterValue !== value) {
        useTimeRecordStore.setState({
          filterType: EFilterType.WEEK,
          filterValue: value,
        });
      }
    } else if (periodType === "month") {
      const value = `${anchorDate.year()}-${anchorDate.month() + 1}`;
      if (filterType !== EFilterType.MONTH || filterValue !== value) {
        useTimeRecordStore.setState({
          filterType: EFilterType.MONTH,
          filterValue: value,
        });
      }
    } else if (periodType === "year") {
      const value = String(anchorDate.year());
      if (filterType !== EFilterType.YEAR || filterValue !== value) {
        useTimeRecordStore.setState({
          filterType: EFilterType.YEAR,
          filterValue: value,
        });
      }
    }
  }, [periodType, anchorDate, filterType, filterValue]);

  return <TimeRecordStatistic style={{ height: "100%" }} />;
});

export default RecordCharts;
