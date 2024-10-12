import { memo } from 'react';
import { useState } from "react";
import dayjs, { Dayjs } from "dayjs";
import { Popover, Calendar, Button } from "antd";

import TitlebarIcon from "@/components/TitlebarIcon";
import { PlusOutlined } from "@ant-design/icons";

import styles from './index.module.less';

interface ITimeRecordProps {
  onCreateNewTimeRecord?: (date: string) => void;
}

const TimeRecord = memo((props: ITimeRecordProps) => {
  const { onCreateNewTimeRecord } = props;

  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [createPopoverOpen, setCreatePopoverOpen] = useState<boolean>(false);

  const onSelectedDate = (date: Dayjs, info: { source: string }) => {
    if (info.source === 'date') {
      setSelectedDate(date);
    }
  }

  const onSubmit = () => {
    onCreateNewTimeRecord?.(selectedDate.format('YYYY-MM-DD'));
    setCreatePopoverOpen(false);
  }

  return (
    <div className={styles.iconList}>
      <TitlebarIcon>
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
          <PlusOutlined />
        </Popover>
      </TitlebarIcon>
    </div>
  )
});

export default TimeRecord;