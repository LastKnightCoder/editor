import TitlebarIcon from "@/components/TitlebarIcon";
import { PlusOutlined, EditOutlined, ReadOutlined } from "@ant-design/icons";
import { MdDeleteOutline } from "react-icons/md";
import { Popover, Calendar, Button } from "antd";

import styles from './index.module.less';
import dayjs, { Dayjs } from "dayjs";
import { useState } from "react";
import { MdExitToApp } from "react-icons/md";

interface IDailyNoteProps {
  createDailyNote?: (date: string) => void;
  readonly?: boolean;
  toggleReadOnly?: () => void;
  quitEdit?: () => Promise<void>;
  deleteDailyNote?: () => void;
}

const DailyNote = (props: IDailyNoteProps) => {
  const { createDailyNote, readonly, toggleReadOnly, quitEdit, deleteDailyNote } = props;

  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [createPopoverOpen, setCreatePopoverOpen] = useState<boolean>(false);

  const onSelectedDate = (date: Dayjs, info: { source: string }) => {
    if (info.source === 'date') {
      setSelectedDate(date);
    }
  }

  const onSubmit = () => {
    createDailyNote?.(selectedDate.format('YYYY-MM-DD'));
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
      <TitlebarIcon onClick={toggleReadOnly}>
        { readonly ? <EditOutlined /> : <ReadOutlined /> }
      </TitlebarIcon>
      <TitlebarIcon onClick={quitEdit}>
        <MdExitToApp />
      </TitlebarIcon>
      <TitlebarIcon onClick={deleteDailyNote}>
        <MdDeleteOutline />
      </TitlebarIcon>
    </div>
  )
}

export default DailyNote;