import { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Modal, InputNumber, AutoComplete } from 'antd';
import { produce } from 'immer';
import { Descendant } from "slate";
import Editor from '@/components/Editor';

import { getAllEventTypes } from '@/commands';
import { ITimeRecord } from "@/types";

import styles from './index.module.less';

interface EditRecordModalProps {
  title: string;
  open: boolean;
  timeRecord: ITimeRecord | null;
  onOk: (timeRecord: ITimeRecord) => Promise<void>;
  onCancel: () => void;
}

const EditRecordModal = (props: EditRecordModalProps) => {
  const {
    title,
    open,
    onOk,
    onCancel,
    timeRecord,
  } = props;

  const [editingTimeRecord, setEditingTimeRecord] = useState<ITimeRecord | null>(timeRecord);
  const [allEventTypes, setAllEventTypes] = useState<string[]>([]);

  useEffect(() => {
    getAllEventTypes().then((res) => {
      setAllEventTypes(res);
    })
  }, []);

  const eventTypeOptions = allEventTypes.map((eventType) => ({
    value: eventType,
  }));

  const onContentChange = useMemoizedFn((value: Descendant[]) => {
    if (!editingTimeRecord) return;
    setEditingTimeRecord(produce(editingTimeRecord, (draft) => {
      draft.content = value;
    }));
  });

  const onCostChange = useMemoizedFn((cost: number | null) => {
    if (!editingTimeRecord || !cost) return;
    setEditingTimeRecord(produce(editingTimeRecord, (draft) => {
      draft.cost = cost;
    }));
  });

  const onEventTypeChange = useMemoizedFn((eventType: string) => {
    if (!editingTimeRecord) return;
    setEditingTimeRecord(produce(editingTimeRecord, (draft) => {
      draft.eventType = eventType;
    }));
  });

  if (!editingTimeRecord) return null;

  return (
    <Modal
      title={title}
      open={open}
      onOk={async () => {
        if (!editingTimeRecord) return;
        await onOk(editingTimeRecord);
      }}
      onCancel={onCancel}
    >
      <div className={styles.modal}>
        <div className={styles.content}>
          <div>事件：</div>
          <Editor
            style={{ flex: 'auto' }}
            initValue={editingTimeRecord.content}
            onChange={onContentChange}
            readonly={false}
          />
        </div>
        <div className={styles.eventType}>
          <div>事件类型：</div>
          <AutoComplete
            value={editingTimeRecord.eventType}
            style={{ width: 200 }}
            options={eventTypeOptions}
            filterOption={(inputValue, option) => {
              return !!option?.value.includes(inputValue);
            }}
            onChange={onEventTypeChange}
          />
        </div>
        <div className={styles.cost}>
          <div>花费时间：</div>
          <InputNumber
            value={editingTimeRecord.cost}
            onChange={onCostChange}
          />
          <div>分钟</div>
        </div>
      </div>
    </Modal>
  )
}

export default EditRecordModal;