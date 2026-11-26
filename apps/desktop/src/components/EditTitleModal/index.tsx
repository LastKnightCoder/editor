/**
 * 改标题 / 重命名的通用小弹窗（tau Dialog 皮）：多行输入（长标题可换行），
 * ⌘/Ctrl + Enter 确认；空标题禁用确认。API 与旧版一致，调用方无需改动。
 */

import { useTitleEditorI18n } from "./i18n";
import React, { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { PenLine } from "lucide-react";
import { Button, Dialog, DialogBody, Textarea } from "@tau/ui";

export interface EditTitleResult {
  title: string;
}

interface EditTitleModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: EditTitleResult) => void;
  initialTitle?: string;
  modalTitle?: string;
  modalDescription?: string;
  placeholder?: string;
}

const EditTitleModal: React.FC<EditTitleModalProps> = ({
  open,
  onCancel,
  onConfirm,
  initialTitle = "",
  modalTitle,
  modalDescription,
  placeholder,
}) => {
  const { t } = useTitleEditorI18n();
  const [title, setTitle] = useState(initialTitle);

  useEffect(() => {
    if (open) setTitle(initialTitle);
  }, [open, initialTitle]);

  const handleSubmit = useMemoizedFn(() => {
    const next = title.trim();
    if (next) onConfirm({ title: next });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title={modalTitle ?? t("title")}
      icon={<PenLine className="size-4" strokeWidth={1.75} />}
      subtitle={modalDescription ?? t("description")}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" disabled={!title.trim()} onClick={handleSubmit}>
            {t("confirm")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <Textarea
          data-autofocus
          value={title}
          rows={3}
          placeholder={placeholder ?? t("placeholder")}
          onChange={e => setTitle(e.target.value)}
          onFocus={e => e.currentTarget.select()}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
      </DialogBody>
    </Dialog>
  );
};

export default EditTitleModal;
