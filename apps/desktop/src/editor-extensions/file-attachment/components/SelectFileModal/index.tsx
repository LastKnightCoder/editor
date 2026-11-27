import { useState } from "react";
import { useLocalStorageState } from "ahooks";
import { Check, Paperclip, Upload } from "lucide-react";
import { Button, Dialog, DialogBody, Spinner, Switch, cn, toast } from "@tau/ui";
import { selectFile, readBinaryFile, getFileBaseName } from "@/commands";
import useUploadResource from "@/hooks/useUploadResource.ts";

import { fileAttachmentTranslator, useFileAttachmentI18n } from "../../i18n";

interface SelectFileModalProps {
  open: boolean;
  onOk: (filePath: string, isLocal: boolean, fileName?: string) => void;
  onCancel: () => void;
}

/** 文件附件：选本地文件，可选上传到图床后以远程地址插入 */
const SelectFileModal = ({ open, onOk, onCancel }: SelectFileModalProps) => {
  const { t } = useFileAttachmentI18n();
  const uploadFile = useUploadResource();
  const [filePath, setFilePath] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const [file, setFile] = useState<File>();
  const [submitting, setSubmitting] = useState(false);
  const [isUpload, setIsUpload] = useLocalStorageState("file-attachment-upload", {
    defaultValue: false,
  });

  const handleSelect = async () => {
    const selected = await selectFile();
    if (!selected) return;
    if (Array.isArray(selected) && selected.length > 1) return;
    const fileData = (await readBinaryFile(selected[0])) as Uint8Array<ArrayBuffer>;
    const baseName = await getFileBaseName(selected[0]);
    setFilePath(selected[0]);
    setFileName(baseName);
    setFile(new File([fileData], baseName));
  };

  const handleOk = async () => {
    if (!file || !filePath || !fileName) {
      toast.warning(fileAttachmentTranslator.t("select.required"));
      return;
    }
    setSubmitting(true);
    try {
      const realFilePath = isUpload ? await uploadFile(file) : filePath;
      if (realFilePath) onOk(realFilePath, !isUpload, fileName);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title={t("insert.title")}
      icon={<Paperclip className="size-4" strokeWidth={1.75} />}
      locked={submitting}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={submitting} onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!file}
            loading={submitting}
            loadingText={isUpload ? t("upload.pending") : t("insert.pending")}
            onClick={() => void handleOk()}
          >
            {t("insert")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3.5">
          <button
            type="button"
            data-autofocus
            className={cn(
              "border-line-1 rounded-tau-md hover:border-accent hover:bg-accent-soft/40 flex cursor-pointer flex-col items-center gap-2 border border-dashed px-6 py-7 text-center transition-colors",
              submitting && "pointer-events-none"
            )}
            onClick={() => void handleSelect()}
          >
            {submitting ? (
              <Spinner className="size-5" />
            ) : file ? (
              <Check className="text-ok size-5" strokeWidth={2} />
            ) : (
              <Upload className="text-ink-2 size-5" strokeWidth={1.75} />
            )}
            <span className="text-tau-body text-ink-1 max-w-full truncate font-medium">
              {fileName || t("select.local")}
            </span>
            <span className="text-tau-sm text-ink-3 max-w-full truncate" title={filePath}>
              {filePath || t("select.anyType")}
            </span>
          </button>
          <Switch
            size="sm"
            checked={isUpload}
            onCheckedChange={setIsUpload}
            label={t("upload.label")}
          />
        </div>
      </DialogBody>
    </Dialog>
  );
};

export default SelectFileModal;
