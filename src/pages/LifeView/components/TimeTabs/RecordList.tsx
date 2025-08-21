import { memo, useState } from "react";
import TimeRecord from "@/pages/TimeRecordView/TimeRecordList";
import EditRecordModal from "@/components/EditRecordModal";
import useTimeRecordStore from "@/stores/useTimeRecordStore";
import { useShallow } from "zustand/react/shallow";

const RecordList = memo(() => {
  const [open, setOpen] = useState(false);
  const [editAction, setEditAction] = useState<"create" | null>(null);
  const [defaultDate] = useState<string>("2024-01-01");

  const { createTimeRecord, updateTimeRecord } = useTimeRecordStore(
    useShallow((s) => ({
      createTimeRecord: s.createTimeRecord,
      updateTimeRecord: s.updateTimeRecord,
    })),
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto min-h-0">
        <TimeRecord className="h-full" hideSelectTime />
      </div>

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
