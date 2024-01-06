import { useMemo, useState, useEffect } from 'react';
import { Button, Calendar, Tag } from 'antd';
import { EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import dayjs, { Dayjs } from 'dayjs';
import classnames from "classnames";

import useTimeRecordStore from "@/stores/useTimeRecordStore";
import useGlobalStateStore from "@/stores/useGlobalStateStore";

import Editor from "@/components/Editor";
import If from "@/components/If";
import EditRecordModal from "../EditRecordModal";

import { ITimeRecord } from "@/types";

import styles from './index.module.less';
import { SelectInfo } from "antd/es/calendar/generateCalendar";

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

const Sidebar = () => {
  const [activeDate, setActiveDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [editAction, setEditAction] = useState<'create' | 'edit' | null>(null);
  const [editRecordModalOpen, setEditRecordModalOpen] = useState<boolean>(false);
  const [editingTimeRecord, setEditingTimeRecord] = useState<ITimeRecord | null>(null);

  const {
    sidebarWidth,
  } = useGlobalStateStore(state => ({
    sidebarWidth: state.sidebarWidth,
  }));

  const {
    createTimeRecord,
    updateTimeRecord,
    deleteTimeRecord,
    timeRecords,
    init
  } = useTimeRecordStore(state => ({
    createTimeRecord: state.createTimeRecord,
    updateTimeRecord: state.updateTimeRecord,
    deleteTimeRecord: state.deleteTimeRecord,
    timeRecords: state.timeRecords,
    init: state.init,
  }));

  useEffect(() => {
    init();
  }, [init])

  const selectedTimeRecords = useMemo(() => {
    const selectedTimeRecords = timeRecords.filter(timeRecord => timeRecord.date === activeDate);
    if (selectedTimeRecords.length > 0) {
      return selectedTimeRecords[0].timeRecords;
    }
    return [];
  }, [activeDate, timeRecords]);

  const onSelect = (value: Dayjs, { source }: SelectInfo) => {
    if (source === 'date') {
      const date = value.format('YYYY-MM-DD');
      setActiveDate(date);
    }
  }

  const onEditFinish = useMemoizedFn(async (timeRecord: any) => {
    if (!editAction) return;
    if (editAction === 'create') {
      await createTimeRecord(timeRecord);
    } else {
      await updateTimeRecord(timeRecord);
    }
    setEditRecordModalOpen(false);
    setEditAction(null);
    setEditingTimeRecord(null);
  });

  const onEditCancel = useMemoizedFn(() => {
    setEditRecordModalOpen(false);
    setEditAction(null);
    setEditingTimeRecord(null);
  });

  return (
    <div style={{ width: sidebarWidth }} className={styles.sidebar}>
      <Calendar
        fullscreen={false}
        onSelect={onSelect}
      />
      {
        selectedTimeRecords.length > 0 && (
          <div className={styles.recordsList}>
            {selectedTimeRecords.map((timeRecord, index) => {
              return (
                <div
                  key={timeRecord.id}
                  className={classnames(styles.item, { [styles.line]: index !== selectedTimeRecords.length - 1 })}
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
                      setEditingTimeRecord(timeRecord);
                      setEditAction('edit');
                      setEditRecordModalOpen(true);
                    }}>
                      <EditOutlined />
                    </div>
                    <div className={styles.icon} onClick={() => {
                      deleteTimeRecord(timeRecord.id);
                    }}>
                      <DeleteOutlined />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      }
      <div style={{ marginTop: 20 }}>
        <Button onClick={() => {
          setEditingTimeRecord({
            id: -1,
            content: [{
              type: 'paragraph',
              children: [{ text: '', type: 'formatted' }],
            }],
            cost: 0,
            date: activeDate,
            eventType: '',
            timeType: ''
          });
          setEditAction('create');
          setEditRecordModalOpen(true);
        }}>添加记录</Button>
      </div>
      <If condition={editRecordModalOpen}>
        <EditRecordModal
          title={'编辑记录'}
          open={editRecordModalOpen}
          timeRecord={editingTimeRecord}
          onOk={onEditFinish}
          onCancel={onEditCancel}
        />
      </If>
    </div>
  )
}

export default Sidebar;