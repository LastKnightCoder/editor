import { scheduleText, useScheduleI18n } from "../../i18n";
import { useEffect, useState } from "react";
import { Button, Dialog, DialogBody, Input, toast } from "@tau/ui";
import { useScheduleMutations } from "../../queries";

interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
}

const CreateGroupDialog = ({ open, onClose }: CreateGroupDialogProps) => {
  useScheduleI18n();

  const { createCalendarGroup } = useScheduleMutations();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.warning(scheduleText("validation.groupName"));
      return;
    }
    setSaving(true);
    try {
      await createCalendarGroup({
        name: name.trim(),
        isSystem: false,
        parentGroupId: null,
        orderIndex: 0,
      });
      onClose();
    } catch (error) {
      console.error("Failed to create group:", error);
      toast.error(scheduleText("feedback.createGroupFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      title={scheduleText("group.create")}
      size="sm"
      locked={saving}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            {scheduleText("action.cancel")}
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSubmit}>
            {scheduleText("action.create")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <label className="flex flex-col gap-1.5">
          <span className="text-ink-2 text-[12px]">{scheduleText("group.name")}</span>
          <Input
            data-autofocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={scheduleText("group.namePlaceholder")}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleSubmit();
            }}
          />
        </label>
      </DialogBody>
    </Dialog>
  );
};

export default CreateGroupDialog;
