/** 重命名 PDF：只改显示用的文件名（.pdf 后缀自动补），不动磁盘文件 */

import { pdfText, usePdfI18n } from "../i18n";
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
  usePdfI18n();

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
      .catch(() => toast.error(pdfText("feedback.renameFailed")))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={next => !next && onClose()}
      title={pdfText("action.rename")}
      size="sm"
      locked={saving}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            {pdfText("action.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!title.trim()}
            onClick={submit}
          >
            {pdfText("action.save")}
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
          placeholder={pdfText("field.fileName")}
        />
      </DialogBody>
    </Dialog>
  );
}
