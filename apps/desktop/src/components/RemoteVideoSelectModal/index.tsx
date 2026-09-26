import React, { useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { Link2 } from "lucide-react";
import { Button, Dialog, DialogBody } from "@tau/ui";
import {
  ResourceSelectError,
  ResourceSelectField,
  ResourceSelectInput,
} from "@/components/ResourceSelectDialog";

export interface RemoteVideoSelectResult {
  url: string;
}

interface RemoteVideoSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: RemoteVideoSelectResult) => void;
  initialUrl?: string;
}

const RemoteVideoSelectModal: React.FC<RemoteVideoSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  initialUrl = "",
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl);
      setError(null);
    }
  }, [open, initialUrl]);

  const handleSubmit = useMemoizedFn(() => {
    if (!url.trim()) {
      setError("请输入视频链接");
      return;
    }

    try {
      new URL(url);
    } catch {
      setError("请输入有效的视频链接");
      return;
    }

    onConfirm({ url: url.trim() });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title="添加在线视频"
      subtitle="输入可直接访问的视频地址"
      icon={<Link2 className="size-4" strokeWidth={1.75} />}
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
          <ResourceSelectField label="视频地址" hint="MP4 / WebM / OGG 等浏览器支持的格式">
            <ResourceSelectInput
              data-autofocus
              type="url"
              value={url}
              onChange={e => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://example.com/video.mp4"
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </ResourceSelectField>
          {error ? (
            <ResourceSelectError text={error} />
          ) : (
            <p className="text-tau-sm text-ink-3">需要无需登录即可直接访问的链接。</p>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
};

export default RemoteVideoSelectModal;
