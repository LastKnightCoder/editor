import DateViewChart from "./DateViewChart";
import WeekViewChart from "./WeekViewChart";
import MonthViewChart from "./MonthViewChart";

import styles from './index.module.less';
import { EFilterType } from "@/types/time";
import If from "@/components/If";
import React, { useMemo } from "react";
import {
  filterTimeRecordsByDate, filterTimeRecordsByDateRange,
  filterTimeRecordsByMonth,
  filterTimeRecordsByQuarter,
  filterTimeRecordsByWeek,
  filterTimeRecordsByYear
} from "@/utils";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import classnames from "classnames";

interface TimeRecordStatisticProps {
  className?: string;
  style?: React.CSSProperties;
}

const TimeRecordStatistic = (props: TimeRecordStatisticProps) => {
  const {
    className,
    style,
  } = props;

  const {
    timeRecords,
    filterType,
    filterValue,
  } = useTimeRecordStore((state) => ({
    timeRecords: state.timeRecords,
    filterType: state.filterType,
    filterValue: state.filterValue,
  }));

  const filteredTimeRecords = useMemo(() => {
    if (filterType === EFilterType.ALL) return timeRecords;
    if (!filterValue) return [];
    if (filterType === EFilterType.YEAR) {
      return filterTimeRecordsByYear(timeRecords, filterValue as string);
    } else if (filterType === EFilterType.QUARTER) {
      // filterValue 的值是 '2021-Q1' 这样的格式，把年个季度提取出来
      const [year, quarter] = (filterValue as string).split('-');
      return filterTimeRecordsByQuarter(timeRecords, year, quarter.slice(1));
    } else if (filterType === EFilterType.MONTH) {
      const [year, month] = (filterValue as string).split('-');
      return filterTimeRecordsByMonth(timeRecords, year, String(Number(month)));
    } else if (filterType === EFilterType.WEEK) {
      // 2021-18周，提取 2021, 18
      const [year, week] = (filterValue as string).split('-');
      return filterTimeRecordsByWeek(timeRecords, year, week.slice(0, -1));
    } else if (filterType === EFilterType.DATE) {
      return filterTimeRecordsByDate(timeRecords, filterValue as string);
    } else if (filterType === EFilterType.RANGE) {
      const [start, end] = filterValue as string[];
      return filterTimeRecordsByDateRange(timeRecords, start, end);
    } else {
      return timeRecords;
    }
  }, [timeRecords, filterType, filterValue]);

  const flattedTimeRecords = useMemo(() => {
    return filteredTimeRecords.map((timeRecord) => timeRecord.timeRecords).flat();
  }, [filteredTimeRecords]);

  return (
    <div className={classnames(styles.charts, className)} style={style}>
      <If condition={filterType === EFilterType.DATE}>
        <DateViewChart timeRecords={flattedTimeRecords} />
      </If>
      <If condition={filterType === EFilterType.WEEK}>
        <WeekViewChart timeRecords={flattedTimeRecords} />
      </If>
      <If condition={filterType === EFilterType.MONTH || filterType === EFilterType.QUARTER || filterType === EFilterType.YEAR || filterType === EFilterType.ALL}>
        <MonthViewChart timeRecords={flattedTimeRecords} />
      </If>
    </div>
  )
}

export default TimeRecordStatistic;
