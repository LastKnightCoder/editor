import React, { useState, useEffect, type KeyboardEvent } from "react";
import { useMemoizedFn } from "ahooks";
import { Check, FileCode, Globe, Upload } from "lucide-react";
import { Button, Dialog, DialogBody, Segmented, Spinner, cn } from "@tau/ui";
import { normalizeWebviewUrl, getWebviewTitleFromUrl } from "@/utils";
import {
  ResourceSelectError,
  ResourceSelectField,
  ResourceSelectInput,
} from "@/components/ResourceSelectDialog";

export type WebViewSourceType = "remote" | "local";

export interface WebViewSelectResult {
  url: string;
  title: string;
  sourceType: WebViewSourceType;
}

interface WebViewSelectModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (result: WebViewSelectResult) => void;
  onSelectFile?: () => Promise<{
    url: string;
    fileName: string;
    title: string;
  } | null>;
}

const WebViewSelectModal: React.FC<WebViewSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  onSelectFile,
}) => {
  const [activeTab, setActiveTab] = useState<"url" | "local">("url");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteTitle, setRemoteTitle] = useState("");
  const [localUrl, setLocalUrl] = useState("");
  const [localFileName, setLocalFileName] = useState("");
  const [localTitle, setLocalTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveTab("url");
      setRemoteUrl("");
      setRemoteTitle("");
      setLocalUrl("");
      setLocalFileName("");
      setLocalTitle("");
      setError(null);
      setIsUploading(false);
    }
  }, [open]);

  const handleSelectLocalFile = useMemoizedFn(async () => {
    if (!onSelectFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const result = await onSelectFile();
      if (result) {
        setLocalUrl(result.url);
        setLocalFileName(result.fileName);
        setLocalTitle(result.title || result.fileName);
        setActiveTab("local");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "选择文件失败");
    } finally {
      setIsUploading(false);
    }
  });

  const handleSubmit = useMemoizedFn(() => {
    if (activeTab === "url") {
      if (!remoteUrl.trim()) {
        setError("请输入网址");
        return;
      }

      const normalizedUrl = normalizeWebviewUrl(remoteUrl);
      if (!normalizedUrl) {
        setError("请输入有效的网址");
        return;
      }

      onConfirm({
        url: normalizedUrl,
        title: remoteTitle.trim() || getWebviewTitleFromUrl(normalizedUrl),
        sourceType: "remote",
      });
    } else {
      if (!localUrl) {
        setError("请先选择本地 HTML 文件");
        return;
      }

      onConfirm({
        url: localUrl,
        title: localTitle.trim() || localFileName || "本地网页",
        sourceType: "local",
      });
    }
  });

  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isUploading) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      title="添加网页"
      subtitle="添加远程网址，或上传本地 HTML 文件"
      icon={<Globe className="size-4" strokeWidth={1.75} />}
      locked={isUploading}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={isUploading} onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={
              isUploading ||
              (activeTab === "url" && !remoteUrl.trim()) ||
              (activeTab === "local" && !localUrl)
            }
            onClick={handleSubmit}
          >
            确认添加
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-4">
          <Segmented
            label="网页来源"
            size="md"
            value={activeTab}
            onValueChange={v => {
              setActiveTab(v as "url" | "local");
              setError(null);
            }}
            disabled={isUploading}
            className="w-full"
          >
            <Segmented.Item value="url" icon={Globe} label="远程网址" />
            <Segmented.Item value="local" icon={FileCode} label="本地 HTML" />
          </Segmented>

          {activeTab === "url" ? (
            <div className="flex flex-col gap-3.5">
              <ResourceSelectField label="网址">
                <ResourceSelectInput
                  data-autofocus
                  type="url"
                  value={remoteUrl}
                  onChange={e => {
                    setRemoteUrl(e.target.value);
                    setError(null);
                  }}
                  placeholder="https://www.example.com"
                  onKeyDown={submitOnEnter}
                />
              </ResourceSelectField>
              <ResourceSelectField label="标题" hint="可选，留空从网址推断">
                <ResourceSelectInput
                  value={remoteTitle}
                  onChange={e => setRemoteTitle(e.target.value)}
                  placeholder="网页标题"
                  onKeyDown={submitOnEnter}
                />
              </ResourceSelectField>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <button
                type="button"
                className={cn(
                  "border-line-1 rounded-tau-md hover:border-accent hover:bg-accent-soft/40 flex cursor-pointer flex-col items-center gap-2 border border-dashed px-6 py-7 text-center transition-colors",
                  isUploading && "pointer-events-none"
                )}
                onClick={handleSelectLocalFile}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Spinner className="size-5" />
                ) : localFileName ? (
                  <Check className="text-ok size-5" strokeWidth={2} />
                ) : (
                  <Upload className="text-ink-2 size-5" strokeWidth={1.75} />
                )}
                <span className="text-tau-body text-ink-1 max-w-full truncate font-medium">
                  {isUploading ? "上传中…" : localFileName || "选择本地 HTML 文件"}
                </span>
                <span className="text-tau-sm text-ink-3">
                  {localFileName ? "点击重新选择" : "支持 .html / .htm"}
                </span>
              </button>
              <ResourceSelectField label="标题" hint="可选，留空使用文件名">
                <ResourceSelectInput
                  value={localTitle}
                  onChange={e => setLocalTitle(e.target.value)}
                  placeholder="网页标题"
                  onKeyDown={submitOnEnter}
                />
              </ResourceSelectField>
            </div>
          )}

          {error && <ResourceSelectError text={error} />}
        </div>
      </DialogBody>
    </Dialog>
  );
};

export default WebViewSelectModal;
