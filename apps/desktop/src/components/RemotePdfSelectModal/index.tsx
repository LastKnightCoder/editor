import { useEffect, useState, type KeyboardEvent } from "react";
import { useMemoizedFn } from "ahooks";
import { FileText } from "lucide-react";
import { Button, Dialog, DialogBody } from "@tau/ui";
import {
  ResourceSelectError,
  ResourceSelectField,
  ResourceSelectInput,
} from "@/components/ResourceSelectDialog";

export interface RemotePdfSelectResult {
  url: string;
  fileName: string;
}

interface RemotePdfSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: RemotePdfSelectResult) => void;
  initialUrl?: string;
  initialFileName?: string;
}

const deriveFileNameFromUrl = (url: string, fallbackExt: string) => {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      if (last.includes(".")) {
        return last;
      }
      return `${last}.${fallbackExt}`;
    }
  } catch (e) {
    // ignore parse error
  }
  return `document.${fallbackExt}`;
};

const RemotePdfSelectModal = ({
  open,
  onCancel,
  onConfirm,
  initialUrl = "",
  initialFileName = "",
}: RemotePdfSelectModalProps) => {
  const [url, setUrl] = useState(initialUrl);
  const [fileName, setFileName] = useState(initialFileName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setFileName(initialFileName);
      setError(null);
    }
  }, [open, initialUrl, initialFileName]);

  const handleSubmit = useMemoizedFn(() => {
    if (!url.trim()) {
      setError("请输入 PDF 链接");
      return;
    }

    try {
      new URL(url);
    } catch {
      setError("请输入有效的 PDF 链接");
      return;
    }

    const resolvedName = fileName.trim() || deriveFileNameFromUrl(url, "pdf");
    if (!resolvedName) {
      setError("请填写文件名");
      return;
    }

    onConfirm({ url: url.trim(), fileName: resolvedName });
  });

  const handleUrlBlur = () => {
    if (!fileName.trim() && url.trim()) {
      setFileName(deriveFileNameFromUrl(url, "pdf"));
    }
  };

  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title="添加远程 PDF"
      subtitle="输入可直接访问的 PDF 文件地址"
      icon={<FileText className="size-4" strokeWidth={1.75} />}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" size="sm" disabled={!url.trim()} onClick={handleSubmit}>
            确认添加
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3.5">
          <ResourceSelectField label="PDF 链接" hint="需无需登录即可下载">
            <ResourceSelectInput
              data-autofocus
              type="url"
              value={url}
              onChange={e => {
                setUrl(e.target.value);
                setError(null);
              }}
              onBlur={handleUrlBlur}
              placeholder="https://example.com/book.pdf"
              onKeyDown={submitOnEnter}
            />
          </ResourceSelectField>
          <ResourceSelectField label="文件名称" hint="留空从链接推断">
            <ResourceSelectInput
              value={fileName}
              onChange={e => {
                setFileName(e.target.value);
                setError(null);
              }}
              placeholder="高效学习.pdf"
              onKeyDown={submitOnEnter}
            />
          </ResourceSelectField>
          {error && <ResourceSelectError text={error} />}
        </div>
      </DialogBody>
    </Dialog>
  );
};

export default RemotePdfSelectModal;
