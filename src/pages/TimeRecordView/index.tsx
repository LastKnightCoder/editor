import TimeRecordList from "./TimeRecordList";
import TimeRecordChart from "./TimeRecord";
import styles from "./index.module.less";
import EditRecordModal from "@/components/EditRecordModal";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import useTimeRecordStore from "@/stores/useTimeRecordStore.ts";
import { ITimeRecord } from "@/types";
import { useMemoizedFn } from "ahooks";
import { Breadcrumb, Button, Calendar, FloatButton, Popover } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { PlusOutlined } from "@ant-design/icons";
import Titlebar from "@/components/Titlebar";
import { useNavigate } from "react-router-dom";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
const TimeRecordView = () => {
  const [editAction, setEditAction] = useState<"create" | "edit" | null>(null);
  const [editRecordModalOpen, setEditRecordModalOpen] = useState(false);
  const [editingTimeRecord, setEditingTimeRecord] =
    useState<ITimeRecord | null>(null);
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [createPopoverOpen, setCreatePopoverOpen] = useState<boolean>(false);
  const navigate = useNavigate();
  const { createTimeRecord, updateTimeRecord, initData } = useTimeRecordStore(
    useShallow((state) => ({
      createTimeRecord: state.createTimeRecord,
      updateTimeRecord: state.updateTimeRecord,
      initData: state.init,
    })),
  );

  const isConnected = useDatabaseConnected();
  const active = useSettingStore((state) => state.setting.database.active);

  useEffect(() => {
    if (isConnected && active) {
      initData();
    }
  }, [isConnected, active, initData]);

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

  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "时间记录", path: "/time-records" },
  ];

  return (
    <div className={styles.viewContainer}>
      <TimeRecordList
        className={styles.sidebar}
        onClickEdit={onEditTimeRecord}
      />
      <div className={styles.chartContainer}>
        <Titlebar className={styles.titlebar}>
          <Breadcrumb
            className={styles.breadcrumb}
            items={breadcrumbItems.map((item) => ({
              title: (
                <span
                  className={styles.breadcrumbItem}
                  onClick={() => navigate(item.path)}
                >
                  {item.title}
                </span>
              ),
            }))}
          />
        </Titlebar>
        <TimeRecordChart className={styles.chart} />
      </div>
      <EditRecordModal
        key={editingTimeRecord?.id}
        title={"编辑记录"}
        open={editRecordModalOpen}
        timeRecord={editingTimeRecord}
        onOk={onEditTimeRecordFinish}
        onCancel={onEditTimeRecordCancel}
      />
      <FloatButton
        style={{
          position: "absolute",
          bottom: 20,
          right: 20,
        }}
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
