import DateViewChart from "./DateViewChart";
import PieStatistic from "./PieStatistic";

import styles from './index.module.less';
import { EFilterType } from "@/types/time";
import If from "@/components/If";
import { useMemo } from "react";
import {
  filterTimeRecordsByDate, filterTimeRecordsByDateRange,
  filterTimeRecordsByMonth,
  filterTimeRecordsByQuarter,
  filterTimeRecordsByWeek,
  filterTimeRecordsByYear
} from "@/utils/time_record";
import { TimeRecordGroup } from "@/types";

interface ITimeRecordStatisticProps {
  timeRecords: TimeRecordGroup;
  filterType: EFilterType;
  filterValue: string | string[];
}

const TimeRecordStatistic = (props: ITimeRecordStatisticProps) => {
  const { filterType, filterValue, timeRecords } = props;

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

  return (
    <div className={styles.charts}>
      <If condition={filterType === EFilterType.DATE}>
        <DateViewChart timeRecords={filteredTimeRecords} date={filterValue as string} Chart={PieStatistic} />
      </If>
    </div>
  )
}

export default TimeRecordStatistic;