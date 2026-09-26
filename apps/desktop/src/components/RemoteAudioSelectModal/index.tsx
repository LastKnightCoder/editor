import React, { useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { Music } from "lucide-react";
import { Button, Dialog, DialogBody } from "@tau/ui";
import {
  ResourceSelectError,
  ResourceSelectField,
  ResourceSelectInput,
} from "@/components/ResourceSelectDialog";

interface RemoteAudioSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (url: string) => void;
  initialUrl?: string;
}

const RemoteAudioSelectModal: React.FC<RemoteAudioSelectModalProps> = ({
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
      setError("请输入音频链接");
      return;
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError("仅支持 http/https 协议的音频链接");
        return;
      }
    } catch {
      setError("请输入有效的音频链接");
      return;
    }

    onConfirm(url.trim());
  });

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title="添加在线音频"
      subtitle="输入可直接访问的音频地址"
      icon={<Music className="size-4" strokeWidth={1.75} />}
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
          <ResourceSelectField label="音频地址" hint="MP3 / WAV / OGG / AAC 等浏览器支持的格式">
            <ResourceSelectInput
              data-autofocus
              type="url"
              value={url}
              onChange={e => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://example.com/audio.mp3"
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

export default RemoteAudioSelectModal;
