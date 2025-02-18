import { useMemo, useState, memo } from "react";
import { useMemoizedFn } from "ahooks";

import SelectTime from "@/components/SelectTime";
import LoadMoreComponent from "@/components/LoadMoreComponent";
import For from "@/components/For";
import TimeRecordsList from './TimeRecordsList';

import {
  filterTimeRecordsByYear,
  filterTimeRecordsByQuarter,
  filterTimeRecordsByMonth,
  filterTimeRecordsByWeek,
  filterTimeRecordsByDate,
  filterTimeRecordsByDateRange,
} from '@/utils/time_record';

import { EFilterType } from "@/types/time";
import { ITimeRecord } from "@/types";

import styles from './index.module.less';
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import dayjs from "dayjs";
import classnames from "classnames";

interface ITimeRecordProps {
  onClickEdit?: (timeRecord: ITimeRecord) => void;
  className?: string;
}

const TimeRecord = memo((props: ITimeRecordProps) => {
  const {
    onClickEdit,
    className
  } = props;

  const {
    timeRecords,
    filterType,
    filterValue,
    deleteTimeRecord,
    updateTimeRecord,
  } = useTimeRecordStore((state) => ({
    timeRecords: state.timeRecords,
    filterType: state.filterType,
    filterValue: state.filterValue,
    createTimeRecord: state.createTimeRecord,
    deleteTimeRecord: state.deleteTimeRecord,
    updateTimeRecord: state.updateTimeRecord,
  }));

  const onSelectFilterTypeChange = useMemoizedFn((type: EFilterType) => {
    let filterValue = '';
    if (type === EFilterType.YEAR) {
      filterValue = new Date().getFullYear().toString();
    } else if (type === EFilterType.QUARTER) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const quarter = Math.floor(month / 3) + 1;
      filterValue = `${year}-Q${quarter}`;
    } else if (type === EFilterType.MONTH) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      filterValue = `${year}-${month}`;
    } else if (type === EFilterType.WEEK) {
      const now = new Date();
      const year = now.getFullYear();
      const week = Math.floor((now.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
      filterValue = `${year}-${week}周`;
    } else if (type === EFilterType.DATE) {
      filterValue = dayjs().format('YYYY-MM-DD');
    }
    useTimeRecordStore.setState({
      filterType: type,
      filterValue,
    });
  })

  const [timeRecordsCount, setTimeRecordsCount] = useState<number>(10);

  timeRecords.sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

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

  const onFilterValueChange = useMemoizedFn((value: string | string[]) => {
    useTimeRecordStore.setState({
      filterValue: value,
    })
  });

  const slicedTimeRecords = filteredTimeRecords.slice(0, timeRecordsCount);

  const onLoadMoreTimeRecords = useMemoizedFn(async () => {
    setTimeRecordsCount(Math.min(timeRecordsCount + 10, filteredTimeRecords.length));
  });

  return (
    <div className={classnames(styles.timeRecordContainer, className)}>
      <SelectTime
        className={styles.selectTime}
        filterType={filterType}
        onSelectFilterTypeChange={onSelectFilterTypeChange}
        onFilterValueChange={onFilterValueChange}
      />
      <div className={styles.list}>
        <LoadMoreComponent
          onLoadMore={onLoadMoreTimeRecords}
          showLoader={timeRecordsCount < filteredTimeRecords.length}
        >
          <For
            data={slicedTimeRecords}
            renderItem={timeRecordItems => (
              <TimeRecordsList
                key={timeRecordItems.date}
                timeRecordGroup={timeRecordItems}
                onClickEdit={onClickEdit}
                onClickDelete={deleteTimeRecord}
                updateTimeRecord={updateTimeRecord}
              />
            )}
          />
        </LoadMoreComponent>
      </div>
    </div>
  )
});

export default TimeRecord;
