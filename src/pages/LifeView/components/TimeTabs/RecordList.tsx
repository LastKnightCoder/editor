import { memo, useState } from "react";
import { Button } from "antd";
import { useLifeViewStore } from "@/stores/useLifeViewStore";
import TimeRecord from "@/pages/TimeRecordView/TimeRecordList";
import EditRecordModal from "@/components/EditRecordModal";
import { useMemoizedFn } from "ahooks";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import { useShallow } from "zustand/react/shallow";

const RecordList = memo(() => {
  const { periodType, anchorDate } = useLifeViewStore();
  const [open, setOpen] = useState(false);
  const [editAction, setEditAction] = useState<"create" | null>(null);
  const [defaultDate, setDefaultDate] = useState<string>(
    anchorDate.format("YYYY-MM-DD"),
  );

  const { createTimeRecord, updateTimeRecord } = useTimeRecordStore(
    useShallow((s) => ({
      createTimeRecord: s.createTimeRecord,
      updateTimeRecord: s.updateTimeRecord,
    })),
  );

  const onCreate = useMemoizedFn(() => {
    setDefaultDate(anchorDate.format("YYYY-MM-DD"));
    setEditAction("create");
    setOpen(true);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <TimeRecord />
      </div>
      {periodType === "day" && (
        <div
          style={{
            padding: "0.75em",
            borderTop: "1px solid var(--line-color)",
          }}
        >
          <Button type="primary" onClick={onCreate}>
            新建时间记录
          </Button>
        </div>
      )}
      <EditRecordModal
        key={open ? defaultDate : ""}
        title={"编辑记录"}
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditAction(null);
        }}
        timeRecord={{
          id: -1,
          content: [
            {
              type: "paragraph",
              children: [{ text: "", type: "formatted" }],
            },
          ],
          cost: 0,
          date: defaultDate,
          eventType: "",
          timeType: "",
        }}
        onOk={async (record) => {
          if (editAction === "create") {
            await createTimeRecord(record);
          } else {
            await updateTimeRecord(record);
          }
          setOpen(false);
          setEditAction(null);
        }}
      />
    </div>
  );
});

export default RecordList;
