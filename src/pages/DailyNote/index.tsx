import {Button, Calendar, Skeleton, Drawer } from 'antd';
import useDailyNoteStore from "@/hooks/useDailyNoteStore.ts";
import {SelectInfo} from "antd/es/calendar/generateCalendar";
import type { Dayjs } from "dayjs";
import styles from './index.module.less';
import {useEffect} from "react";
import Editor from "@/components/Editor";

const DailyNote = () => {
  const {
    initLoading,
    init,
    dailyNotes,
    onCreateDailyNote,
    onUpdateDailyNote,
    onDailyContentChange,
    onSaveDailyNote,
    onCancelDailyNote,
    open,
    editingDailyNote,
  } = useDailyNoteStore(state => ({
    initLoading: state.initLoading,
    init: state.init,
    dailyNotes: state.dailyNotes,
    onCreateDailyNote: state.onCreateDailyNote,
    onUpdateDailyNote: state.onUpdateDailyNote,
    onSaveDailyNote: state.onSaveDailyNote,
    onCancelDailyNote: state.onCancelDailyNote,
    onDailyContentChange: state.onDailyContentChange,
    open: state.editingDailyNoteOpen,
    editingDailyNote: state.editingDailyNote,
  }));

  useEffect(() => {
    init();
  }, [init])

  const onSelect = (value: Dayjs, { source }: SelectInfo) => {
    if (source === 'date') {
      const date = value.format('YYYY-MM-DD');
      const dailyNote = dailyNotes.find(item => item.date === date);
      if (!dailyNote) {
        onCreateDailyNote(date);
      }
    }
  }

  const cellRender = (value: Dayjs) => {
    const dailyNote = dailyNotes.find(item => item.date === value.format('YYYY-MM-DD'));
    if (dailyNote) {
      return (
        <div className={styles.dailyNoteItem} onClick={() => {
          onUpdateDailyNote(dailyNote);
        }}>
          <Editor initValue={dailyNote.content.slice(1)} readonly />
        </div>
      )
    }
  }

  return (
    <div className={styles.dailyNote}>
      {
        initLoading
          ? <Skeleton active />
          : (
            <Calendar
              onSelect={onSelect}
              cellRender={cellRender}
            />
          )
      }
      <Drawer
        title="日记"
        placement="right"
        closable
        onClose={onCancelDailyNote}
        footer={(
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10}}>
            <Button onClick={onCancelDailyNote}>取消</Button>
            <Button type="primary" onClick={onSaveDailyNote}>保存</Button>
          </div>
        )}
        width={600}
        open={open}
      >
        {
          open &&
          <Editor
            onChange={onDailyContentChange}
            initValue={editingDailyNote ? editingDailyNote.content : undefined}
            readonly={false}
          />
        }
      </Drawer>
    </div>
  )
}

export default DailyNote;