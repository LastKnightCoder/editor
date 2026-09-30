import { useEffect, useState } from "react";
import { Button, Dialog, DialogBody, Input, toast } from "@tau/ui";
import { useScheduleMutations } from "../../queries";

interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
}

const CreateGroupDialog = ({ open, onClose }: CreateGroupDialogProps) => {
  const { createCalendarGroup } = useScheduleMutations();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.warning("请输入分组名称");
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
      toast.error("创建分组失败");
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
      title="新建分组"
      size="sm"
      locked={saving}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSubmit}>
            创建
          </Button>
        </>
      }
    >
      <DialogBody>
        <label className="flex flex-col gap-1.5">
          <span className="text-ink-2 text-[12px]">分组名称</span>
          <Input
            data-autofocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="输入分组名称"
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
