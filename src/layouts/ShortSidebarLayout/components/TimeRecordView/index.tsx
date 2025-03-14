import TimeRecordList from "./TimeRecordList";
import TimeRecordChart from "./TimeRecord";
import styles from "./index.module.less";
import EditRecordModal from "@/components/EditRecordModal";
import { useState } from "react";
import useTimeRecordStore from "@/stores/useTimeRecordStore.ts";
import { ITimeRecord } from "@/types";
import { useMemoizedFn } from "ahooks";
import { Button, Calendar, FloatButton, Popover } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { PlusOutlined } from "@ant-design/icons";

const TimeRecordView = () => {
  const [editAction, setEditAction] = useState<"create" | "edit" | null>(null);
  const [editRecordModalOpen, setEditRecordModalOpen] = useState(false);
  const [editingTimeRecord, setEditingTimeRecord] =
    useState<ITimeRecord | null>(null);
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [createPopoverOpen, setCreatePopoverOpen] = useState<boolean>(false);

  const { createTimeRecord, updateTimeRecord } = useTimeRecordStore(
    (state) => ({
      createTimeRecord: state.createTimeRecord,
      updateTimeRecord: state.updateTimeRecord,
    }),
  );

  const onEditTimeRecord = useMemoizedFn((timeRecord: ITimeRecord) => {
    setEditingTimeRecord(timeRecord);
    setEditAction("edit");
    setEditRecordModalOpen(true);
  });

  const onEditTimeRecordFinish = useMemoizedFn(
    async (timeRecord: ITimeRecord) => {
      if (!editAction) return;
      if (editAction === "create") {
        await createTimeRecord(timeRecord);
      } else {
        await updateTimeRecord(timeRecord);
      }
      setEditRecordModalOpen(false);
      setEditAction(null);
      setEditingTimeRecord(null);
    },
  );

  const onEditTimeRecordCancel = useMemoizedFn(() => {
    setEditRecordModalOpen(false);
    setEditAction(null);
    setEditingTimeRecord(null);
  });

  const onCreateNewTimeRecord = useMemoizedFn((date) => {
    setEditingTimeRecord({
      id: -1,
      content: [
        {
          type: "paragraph",
          children: [{ text: "", type: "formatted" }],
        },
      ],
      cost: 0,
      date,
      eventType: "",
      timeType: "",
    });
    setEditAction("create");
    setEditRecordModalOpen(true);
  });

  const onSelectedDate = (date: Dayjs, info: { source: string }) => {
    if (info.source === "date") {
      setSelectedDate(date);
    }
  };

  const onSubmit = () => {
    onCreateNewTimeRecord(selectedDate.format("YYYY-MM-DD"));
    setCreatePopoverOpen(false);
  };

  return (
    <div className={styles.viewContainer}>
      <TimeRecordList
        className={styles.sidebar}
        onClickEdit={onEditTimeRecord}
      />
      <TimeRecordChart className={styles.chart} />
      <EditRecordModal
        key={editingTimeRecord?.id}
        title={"编辑记录"}
        open={editRecordModalOpen}
        timeRecord={editingTimeRecord}
        onOk={onEditTimeRecordFinish}
        onCancel={onEditTimeRecordCancel}
      />
      <FloatButton
        icon={
          <Popover
            open={createPopoverOpen}
            onOpenChange={setCreatePopoverOpen}
            trigger={"click"}
            placement={"left"}
            content={
              <div style={{ width: 320 }}>
                <Calendar
                  defaultValue={dayjs()}
                  fullscreen={false}
                  onSelect={onSelectedDate}
                />
                <div style={{ marginTop: 10, textAlign: "right" }}>
                  <Button type="primary" onClick={onSubmit}>
                    创建
                  </Button>
                </div>
              </div>
            }
          >
            <PlusOutlined />
          </Popover>
        }
        tooltip={"新建记录"}
      />
    </div>
  );
};

export default TimeRecordView;
