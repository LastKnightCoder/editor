import React from "react";
import { Calendar, Modal } from 'antd';
import classnames from "classnames";

import { Dayjs } from "dayjs";
import Editor from "@editor/index.tsx";
import DailyNote from '@/layouts/ThreeColumnLayout/Content/DailyNote';
import useDailyNoteStore from "@/stores/useDailyNoteStore.ts";
import { DeleteOutlined } from "@ant-design/icons";
import { SelectInfo } from "antd/es/calendar/generateCalendar";

import styles from './index.module.less';
import For from "@/components/For";

const DailyNoteView = () => {
  const {
    dailyNotes,
    deleteDailyNote,
    onCreateDailyNote,
    activeDailyId
  } = useDailyNoteStore(state => ({
    dailyNotes: state.dailyNotes,
    deleteDailyNote: state.deleteDailyNote,
    onCreateDailyNote: state.onCreateDailyNote,
    activeDailyId: state.activeDailyId
  }));

  const isShowEdit = !!activeDailyId;

  const handleDeleteDailyNote = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    Modal.confirm({
      title: '是否要删除此篇日记',
      onOk: async () => {
        await deleteDailyNote(id);
      },
      okText: '删除',
      cancelText: '取消',
      okButtonProps: {
        danger: true
      }
    })
  }

  const onSelect = async (value: Dayjs, { source }: SelectInfo) => {
    if (source === 'date') {
      const date = value.format('YYYY-MM-DD');
      const dailyNote = dailyNotes.find(item => item.date === date);
      if (!dailyNote) {
        Modal.confirm({
          title: '是否创建日记',
          onOk: async () => {
            const createdDailyNote = await onCreateDailyNote(date);
            useDailyNoteStore.setState({
              activeDailyId: createdDailyNote.id,
              readonly: false
            })
          }
        })
      }
    }
  }

  const cellRender = (value: Dayjs) => {
    const notes = dailyNotes.filter(item => item.date === value.format('YYYY-MM-DD'));
    if (notes.length > 0) {
      return (
        <For
          data={notes}
          renderItem={dailyNote => (
            <div className={styles.cellDailyNote} onClick={() => {
              useDailyNoteStore.setState({
                activeDailyId:  dailyNote.id === activeDailyId ? undefined : dailyNote.id,
                readonly: false
              })
            }}>
              <Editor initValue={dailyNote.content.slice(0, 1)} readonly/>
              <div className={styles.delete} onClick={(e) => {
                handleDeleteDailyNote(e, dailyNote.id)
              }}>
                <DeleteOutlined/>
              </div>
            </div>
          )}
        />
      )
    }
  }

  return (
    <div className={classnames(styles.viewContainer, { [styles.showEdit]: isShowEdit })}>
      <div className={styles.calendarContainer}>
        <Calendar cellRender={cellRender} onSelect={onSelect}/>
      </div>
      <div className={styles.edit}>
        <DailyNote />
      </div>
    </div>
  )
}

export default DailyNoteView;