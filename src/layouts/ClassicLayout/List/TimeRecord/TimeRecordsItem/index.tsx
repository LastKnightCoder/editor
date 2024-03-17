import { memo } from 'react';
import { ITimeRecord, TimeRecordGroup } from "@/types";
import classnames from "classnames";
import { Tag } from "antd";
import Editor from "@/components/Editor";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";

import styles from './index.module.less';

type PickArrayEleType<T> = T extends Array<infer U> ? U : never;

interface ITimeRecordsItemProps {
  timeRecordGroup: PickArrayEleType<TimeRecordGroup>;
  onClickEdit?: (timeRecord: ITimeRecord) => void;
  onClickDelete?: (id: number) => void;
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

const TimeRecordsItem = memo((props: ITimeRecordsItemProps) => {
  const { timeRecordGroup, onClickEdit, onClickDelete } = props;

  const { date, timeRecords } = timeRecordGroup;

  return (
    <div className={styles.listContainer}>
      <div className={styles.date}>
        {date}
      </div>
      <div className={styles.recordsList}>
        {timeRecords.map((timeRecord, index) => {
          return (
            <div
              key={timeRecord.id}
              className={classnames(styles.item, { [styles.line]: index !== timeRecords.length - 1 })}
            >
              <div>
                <Tag
                  color={tagColors[index % tagColors.length]}
                  bordered={false}
                >
                  {timeRecord.cost} min
                </Tag>
                {
                  timeRecord.eventType && (
                    <Tag
                      color={tagColors[(index + 1) % tagColors.length]}
                      bordered={false}
                    >
                      {timeRecord.eventType}
                    </Tag>
                  )
                }
              </div>
              <Editor
                key={JSON.stringify(timeRecord.content) + timeRecord.id}
                className={styles.content}
                initValue={timeRecord.content}
                readonly
              />
              <div className={styles.actions}>
                <div className={styles.icon} onClick={() => {
                  onClickEdit?.(timeRecord);
                }}>
                  <EditOutlined />
                </div>
                <div className={styles.icon} onClick={() => {
                  onClickDelete?.(timeRecord.id);
                }}>
                  <DeleteOutlined />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
});

export default TimeRecordsItem;
