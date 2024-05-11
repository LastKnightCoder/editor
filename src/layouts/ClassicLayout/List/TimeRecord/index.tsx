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
import { ITimeRecord, TimeRecordGroup } from "@/types";

import styles from './index.module.less';

interface ITimeRecordProps {
  timeRecords: TimeRecordGroup;
  filterType: EFilterType;
  filterValue: string | string[];
  onSelectFilterTypeChange: (type: EFilterType) => void;
  onFilterValueChange: (value: string | string[]) => void;
  updateTimeRecord?: (timeRecord: ITimeRecord) => Promise<ITimeRecord>;
  deleteTimeRecord?: (id: number) => void;
  onClickEdit?: (timeRecord: ITimeRecord) => void;
}

const TimeRecord = memo((props: ITimeRecordProps) => {
  const {
    timeRecords,
    filterType,
    filterValue,
    onSelectFilterTypeChange,
    onFilterValueChange,
    onClickEdit,
    deleteTimeRecord,
    updateTimeRecord,
  } = props;

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

  const slicedTimeRecords = filteredTimeRecords.slice(0, timeRecordsCount);

  const onLoadMoreTimeRecords = useMemoizedFn(async () => {
    setTimeRecordsCount(Math.min(timeRecordsCount + 10, filteredTimeRecords.length));
  });

  return (
    <div className={styles.timeRecordContainer}>
      <SelectTime
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
