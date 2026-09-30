/**
 * 新建日程弹窗（tau Dialog）：表单见 useEventForm。已有日程的查看 / 编辑走右侧 EventDrawer。
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Dialog, DialogBody } from "@tau/ui";
import { useScheduleStore } from "../../uiStore";
import { useEventForm } from "./useEventForm";

const EventDialog = () => {
  const editingEvent = useScheduleStore(s => s.editingEvent);
  const close = () => useScheduleStore.getState().setEditingEvent(null);
  const form = useEventForm(editingEvent, close, { autoFocusTitle: true });
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <Dialog
        open={editingEvent !== null}
        onOpenChange={next => {
          if (!next) close();
        }}
        title={form.isNew ? "新建日程" : "编辑日程"}
        context={form.calendarTitle}
        locked={form.saving}
        width={600}
        footer={
          <>
            {!form.isNew && !form.isSystemCalendarEvent && (
              <Button
                variant="danger-soft"
                size="sm"
                icon={Trash2}
                className="mr-auto"
                disabled={form.saving}
                onClick={() => setConfirmDelete(true)}
              >
                删除
              </Button>
            )}
            <Button variant="secondary" size="sm" disabled={form.saving} onClick={close}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={form.saving}
              disabled={!form.canSave}
              onClick={form.save}
            >
              保存
            </Button>
          </>
        }
      >
        <DialogBody>{form.fields}</DialogBody>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        danger
        title="删除日程"
        context={editingEvent?.title}
        description="删除后不可恢复。"
        confirmText="删除"
        onConfirm={async () => {
          await form.remove();
          setConfirmDelete(false);
        }}
      />
    </>
  );
};

export default EventDialog;
