import { useRef, useState } from 'react';
import classnames from "classnames";
import { Tag } from "antd";

import Editor from "@/components/Editor";
import { MdOutlinePlayCircle, MdOutlinePauseCircle  } from "react-icons/md";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { ITimeRecord } from "@/types";

import styles from "./index.module.less";

interface TimeRecordItemProps {
  timeRecord: ITimeRecord;
  showLine: boolean;
  color: string;
  nextColor: string;
  onClickEdit?: (timeRecord: ITimeRecord) => void;
  onClickDelete?: (id: number) => void;
  onRecordTimeFinish?: (time: number) => Promise<void>;
}

const TimeRecordItem = (props: TimeRecordItemProps) => {
  const {
    showLine,
    color,
    timeRecord,
    nextColor,
    onClickDelete,
    onClickEdit,
    onRecordTimeFinish,
  } = props;

  const recordTime = useRef(0);
  const [isRecording, setIsRecording] = useState(false);
  const timerRef = useRef<any>();

  const onClickRecord = () => {
    if (isRecording) {
      clearInterval(timerRef.current);
      setIsRecording(false);
      onRecordTimeFinish?.(recordTime.current);
      recordTime.current = 0;
    } else {
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        recordTime.current += 1;
      }, 1000);
    }
  }

  return (
    <div
      className={classnames(styles.item, { [styles.line]: showLine })}
    >
      <div>
        <Tag
          color={color}
          bordered={false}
        >
          {timeRecord.cost} min
        </Tag>
        {
          timeRecord.timeType && (
            <Tag
              color={nextColor}
              bordered={false}
            >
              {timeRecord.timeType}
            </Tag>
          )
        }
        {
          timeRecord.eventType && (
            <Tag
              color={nextColor}
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
        <div
          className={styles.icon}
          onClick={onClickRecord}
        >
          { isRecording ? <MdOutlinePauseCircle/> : <MdOutlinePlayCircle/> }
        </div>
        <div className={styles.icon} onClick={() => {
          onClickEdit?.(timeRecord);
        }}>
          <EditOutlined/>
        </div>
        <div className={styles.icon} onClick={() => {
          onClickDelete?.(timeRecord.id);
        }}>
          <DeleteOutlined/>
        </div>
      </div>
    </div>
  )
}

export default TimeRecordItem;
