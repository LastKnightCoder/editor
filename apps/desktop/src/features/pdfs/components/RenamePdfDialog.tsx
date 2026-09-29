/** 重命名 PDF：只改显示用的文件名（.pdf 后缀自动补），不动磁盘文件 */

import { useEffect, useState } from "react";
import { Button, Dialog, DialogBody, Input, toast } from "@tau/ui";
import type { PdfEntry } from "../model";

export function RenamePdfDialog({
  entry,
  onClose,
  onSubmit,
}: {
  /** null = 关闭 */
  entry: PdfEntry | null;
  onClose(): void;
  onSubmit(entry: PdfEntry, title: string): Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (entry) setTitle(entry.title);
  }, [entry]);

  const submit = () => {
    if (!entry || !title.trim() || saving) return;
    setSaving(true);
    onSubmit(entry, title)
      .then(onClose)
      .catch(() => toast.error("重命名失败"))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={next => !next && onClose()}
      title="重命名"
      size="sm"
      locked={saving}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!title.trim()}
            onClick={submit}
          >
            保存
          </Button>
        </>
      }
    >
      <DialogBody>
        <Input
          data-autofocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          }}
          placeholder="文件名"
        />
      </DialogBody>
    </Dialog>
  );
}
