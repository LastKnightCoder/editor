import { memo } from 'react';
import { ITimeRecord, TimeRecordGroup } from "@/types";
import TimeRecordItem from "../TimeRecordItem";

import styles from './index.module.less';
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";

type PickArrayEleType<T> = T extends Array<infer U> ? U : never;

interface ITimeRecordsItemProps {
  timeRecordGroup: PickArrayEleType<TimeRecordGroup>;
  onClickEdit?: (timeRecord: ITimeRecord) => void;
  onClickDelete?: (id: number) => void;
  updateTimeRecord?: (timeRecord: ITimeRecord) => Promise<ITimeRecord>;
}

const tagColors = [
  'magenta',
  'red',
  'volcano',
  'orange',
  'gold',
  'lime',
  'green',
  'cyan',
  'blue',
  'geekblue',
  'purple',
]

const TimeRecordsList = memo((props: ITimeRecordsItemProps) => {
  const {
    timeRecordGroup,
    onClickEdit,
    onClickDelete,
    updateTimeRecord
  } = props;

  const { date, timeRecords } = timeRecordGroup;

  const onRecordTimeFinish = useMemoizedFn(async (id: number, time: number) => {
    const timeRecord = timeRecords.find(item => item.id === id);
    if (!timeRecord) return;
    const newTimeRecord = produce(timeRecord, draft => {
      draft.cost += Math.round((time / 60));
    });
    await updateTimeRecord?.(newTimeRecord);
  })

  return (
    <div className={styles.listContainer}>
      <div className={styles.date}>
        {date}
      </div>
      <div className={styles.recordsList}>
        {timeRecords.map((timeRecord, index) => {
          return (
            <TimeRecordItem
              key={timeRecord.id}
              showLine={index !== timeRecords.length - 1}
              timeRecord={timeRecord}
              color={tagColors[index % tagColors.length]}
              nextColor={tagColors[(index + 1) % tagColors.length]}
              onClickEdit={onClickEdit}
              onClickDelete={onClickDelete}
              onRecordTimeFinish={async (time) => {
                await onRecordTimeFinish(timeRecord.id, time);
              }}
            />
          )
        })}
      </div>
    </div>
  )
});

export default TimeRecordsList;
