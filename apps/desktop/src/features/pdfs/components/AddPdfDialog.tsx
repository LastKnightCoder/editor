/**
 * 添加 PDF：本地文件（拖入或选择，可多选；可同时上传到云端）/ 链接（名称从链接推断，可改）。
 * 本地文件交给调用方导入（导入进度在 toast 里），选完即关。
 */

import { useEffect, useState } from "react";
import { FileUp } from "lucide-react";
import { Button, Checkbox, Dialog, DialogBody, FileDropZone, Input, Tabs, toast } from "@tau/ui";
import { fileNameFromUrl } from "../model";

type AddTab = "local" | "remote";

export function AddPdfDialog({
  open,
  initialTab = "local",
  uploadOnImport,
  onUploadOnImportChange,
  onClose,
  onFiles,
  onAddRemote,
}: {
  open: boolean;
  initialTab?: AddTab;
  uploadOnImport: boolean;
  onUploadOnImportChange(upload: boolean): void;
  onClose(): void;
  onFiles(files: File[]): void;
  onAddRemote(url: string, fileName: string): Promise<void>;
}) {
  const [tab, setTab] = useState<AddTab>(initialTab);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  // 每次打开按入口定页签（空态「添加链接」直接落在链接页）
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const reset = () => {
    setUrl("");
    setName("");
    setNameEdited(false);
  };

  const validUrl = /^https?:\/\/\S+$/i.test(url.trim());
  const fileName = nameEdited ? name.trim() : fileNameFromUrl(url);

  const submitRemote = () => {
    if (!validUrl || !fileName || saving) return;
    setSaving(true);
    onAddRemote(url.trim(), /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`)
      .then(onClose)
      .catch(() => toast.error("添加失败"))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      onAfterClose={reset}
      title="添加 PDF"
      locked={saving}
      footer={
        tab === "remote" ? (
          <>
            <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              disabled={!validUrl || !fileName}
              onClick={submitRemote}
            >
              添加
            </Button>
          </>
        ) : undefined
      }
    >
      <DialogBody>
        <Tabs<AddTab>
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: "local",
              label: "本地文件",
              children: (
                <div className="flex flex-col gap-3 pt-3">
                  <FileDropZone
                    accept="application/pdf,.pdf"
                    onFiles={files => {
                      onFiles(files);
                      onClose();
                    }}
                    className="h-[150px]"
                  >
                    <FileUp className="text-ink-3 size-6" strokeWidth={1.5} />
                    <span className="text-tau-meta text-ink-2">
                      拖入 PDF，或 <span className="text-accent-text">选择文件</span>
                    </span>
                    <span className="text-tau-sm text-ink-3">可一次选多个</span>
                  </FileDropZone>
                  <Checkbox
                    checked={uploadOnImport}
                    onChange={e => onUploadOnImportChange(e.target.checked)}
                    label="同时上传到云端（按设置里的上传目标）"
                  />
                </div>
              ),
            },
            {
              key: "remote",
              label: "链接",
              children: (
                <div className="flex flex-col gap-3.5 pt-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-ink-2 text-[12px]">链接</span>
                    <Input
                      data-autofocus
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) submitRemote();
                      }}
                      placeholder="https://example.com/paper.pdf"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-ink-2 text-[12px]">
                      名称 <span className="text-ink-3">· 默认取链接里的文件名</span>
                    </span>
                    <Input
                      value={fileName}
                      onChange={e => {
                        setNameEdited(true);
                        setName(e.target.value);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) submitRemote();
                      }}
                      placeholder="文件名.pdf"
                    />
                  </label>
                </div>
              ),
            },
          ]}
        />
      </DialogBody>
    </Dialog>
  );
}
