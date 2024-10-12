import { useMemo, useRef, useState, memo } from 'react';

import LoadMoreComponent from "@/components/LoadMoreComponent";
import For from "@/components/For";
import SelectTime from "@/components/SelectTime";
import DailyItem from './DailyItem';

import useDailyNoteStore from "@/stores/useDailyNoteStore";

import {
  filterDailyNoteByYear,
  filterDailyNoteByQuarter,
  filterDailyNoteByMonth,
  filterDailyNoteByWeek,
  filterDailyNoteByDate,
  filterDailyNoteByRange,
} from '@/utils/daily';

import { EFilterType } from '@/types/time';

import styles from './index.module.less';
import { useMemoizedFn } from "ahooks";

const DailyList = memo(() => {
  const {
    dailyNotes,
    activeDailyId,
  } = useDailyNoteStore(state => ({
    dailyNotes: state.dailyNotes,
    activeDailyId: state.activeDailyId,
  }));

  const [dailyNotesCount, setDailyNotesCount] = useState<number>(10);
  const [filterType, setFilterType] = useState<EFilterType>(EFilterType.ALL);
  const [filterValue, setFilterValue] = useState<string | string[]>('');

  const listRef = useRef<HTMLDivElement>(null);

  const filteredDailyNotes = useMemo(() => {
    if (filterType === EFilterType.ALL) return dailyNotes;
    if (!filterValue) return [];
    if (filterType === EFilterType.YEAR) {
      return filterDailyNoteByYear(dailyNotes, filterValue as string);
    } else if (filterType === EFilterType.QUARTER) {
      // filterValue 的值是 '2021-Q1' 这样的格式，把年个季度提取出来
      const [year, quarter] = (filterValue as string).split('-');
      return filterDailyNoteByQuarter(dailyNotes, year, quarter.slice(1));
    } else if (filterType === EFilterType.MONTH) {
      const [year, month] = (filterValue as string).split('-');
      return filterDailyNoteByMonth(dailyNotes, year, String(Number(month)));
    } else if (filterType === EFilterType.WEEK) {
      // 2021-18周，提取 2021, 18
      const [year, week] = (filterValue as string).split('-');
      return filterDailyNoteByWeek(dailyNotes, year, week.slice(0, -1));
    } else if (filterType === EFilterType.DATE) {
      return filterDailyNoteByDate(dailyNotes, filterValue as string);
    } else if (filterType === EFilterType.RANGE) {
      const [start, end] = filterValue as string[];
      return filterDailyNoteByRange(dailyNotes, start, end);
    } else {
      const _notExhaustive: never = filterType;
      console.error(_notExhaustive);
      return dailyNotes;
    }
  }, [dailyNotes, filterType, filterValue]);

  const slicedDailyNotes = filteredDailyNotes.slice(0, dailyNotesCount);

  const loadMore = async () => {
    setDailyNotesCount(Math.min(dailyNotesCount + 10, filteredDailyNotes.length));
  }

  const onSelectFilterTypeChange = useMemoizedFn((type: EFilterType) => {
    setFilterType(type);
    setFilterValue('');
    setDailyNotesCount(10);
  });

  const onFilterValueChange = useMemoizedFn((value: string | string[]) => {
    setFilterValue(value);
    if (listRef.current) {
      listRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  });

  return (
    <div className={styles.dailyList}>
      <SelectTime
        filterType={filterType}
        onSelectFilterTypeChange={onSelectFilterTypeChange}
        onFilterValueChange={onFilterValueChange}
      />
      <div ref={listRef} className={styles.list}>
        <LoadMoreComponent onLoadMore={loadMore} showLoader={dailyNotesCount < filteredDailyNotes.length}>
          <For
            data={slicedDailyNotes}
            renderItem={dailyNote => (
              <DailyItem
                dailyNote={dailyNote}
                key={dailyNote.id}
                active={activeDailyId === dailyNote.id}
                onClick={() => {
                  useDailyNoteStore.setState({
                    activeDailyId: dailyNote.id === activeDailyId ? undefined : dailyNote.id
                  });
                }}
              />
            )}
          />
        </LoadMoreComponent>
      </div>
    </div>
  )
});

export default DailyList;
