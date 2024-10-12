import TitlebarIcon from "@/components/TitlebarIcon";
import { PlusOutlined, EditOutlined, ReadOutlined } from "@ant-design/icons";
import { MdDeleteOutline } from "react-icons/md";
import { Popover, Calendar, Button, App } from "antd";
import FocusMode from "../../../../components/FocusMode";

import styles from './index.module.less';
import dayjs, { Dayjs } from "dayjs";
import { useState } from "react";
import { MdExitToApp } from "react-icons/md";
import { useMemoizedFn } from "ahooks";
import useDailyNoteStore from "@/stores/useDailyNoteStore";

const DailyNote = () => {
  const { modal } = App.useApp();

  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [createPopoverOpen, setCreatePopoverOpen] = useState<boolean>(false);

  const {
    activeDailyId,
    createDailyNote,
    deleteDailyNote,
    readonly,
  } = useDailyNoteStore(state => ({
    activeDailyId: state.activeDailyId,
    createDailyNote: state.onCreateDailyNote,
    deleteDailyNote: state.deleteDailyNote,
    readonly: state.readonly,
  }));

  const createNewDailyNote = useMemoizedFn(async (date: string) => {
    const createdDailyNote = await createDailyNote(date);
    useDailyNoteStore.setState({
      activeDailyId: createdDailyNote.id,
    });
  });

  const quitEdit = useMemoizedFn(async () => {
    if (!activeDailyId) return;
    useDailyNoteStore.setState({
      activeDailyId: undefined,
    });
  });

  const handleDeleteDailyNote = useMemoizedFn(async () => {
    if (!activeDailyId) return;
    modal.confirm({
      title: '删除日记',
      content: '确定要删除这篇日记吗？',
      onOk: async () => {
        await deleteDailyNote(activeDailyId);
        useDailyNoteStore.setState({
          activeDailyId: undefined,
        });
      },
      okText: '确定',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
      }
    })
  });

  const toggleReadOnly = useMemoizedFn(() => {
    useDailyNoteStore.setState({
      readonly: !readonly,
    });
  })

  const onSelectedDate = (date: Dayjs, info: { source: string }) => {
    if (info.source === 'date') {
      setSelectedDate(date);
    }
  }

  const onSubmit = () => {
    createNewDailyNote(selectedDate.format('YYYY-MM-DD'));
    setCreatePopoverOpen(false);
  }

  return (
    <div className={styles.iconList}>
      <Popover
        open={createPopoverOpen}
        onOpenChange={setCreatePopoverOpen}
        trigger={'click'}
        placement={'bottomLeft'}
        content={(
          <div style={{ width: 320 }}>
            <Calendar
              defaultValue={dayjs()}
              fullscreen={false}
              onSelect={onSelectedDate}
            />
            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <Button type="primary" onClick={onSubmit}>创建</Button>
            </div>
          </div>
        )}
      >
        <TitlebarIcon>
          <PlusOutlined />
        </TitlebarIcon>
      </Popover>
      <FocusMode />
      <TitlebarIcon onClick={toggleReadOnly}>
        { readonly ? <EditOutlined /> : <ReadOutlined /> }
      </TitlebarIcon>
      <TitlebarIcon onClick={quitEdit}>
        <MdExitToApp />
      </TitlebarIcon>
      <TitlebarIcon onClick={handleDeleteDailyNote}>
        <MdDeleteOutline />
      </TitlebarIcon>
    </div>
  )
}

export default DailyNote;