/**
 * 网页地址弹窗（插入 / 编辑共用）：远程网址直接使用，本地 HTML 选文件上传后取资源地址。
 * 版式对齐桌面端「添加网页」弹窗（@tau/ui Dialog + Segmented 切换来源）。
 */

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { useMemoizedFn } from "ahooks";
import { Editor } from "slate";
import { Check, FileCode, Globe, Upload } from "lucide-react";
import { Button, Dialog, DialogBody, Input, Segmented, Spinner, cn } from "@tau/ui";
import { IFileService, IResourceService } from "@tau/editor";
import { WebLinkSourceType } from "../types";

interface InputUrlModalProps {
  editor: Editor;
  open: boolean;
  onOk: (payload: { url: string; sourceType: WebLinkSourceType }) => void;
  onCancel: () => void;
  onAfterClose?: () => void;
  defaultValue?: string;
  defaultSourceType?: WebLinkSourceType;
  title?: string;
  subtitle?: string;
  okText?: string;
}

type SourceTab = "remote" | "local";

/** 无协议补 https://，本地路径原样保留 */
const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z]+:\/\//.test(trimmed)) return trimmed;
  if (trimmed.startsWith("~") || trimmed.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2">
        <span className="text-ink-2 text-[12px]">{label}</span>
        {hint && <span className="text-ink-3 text-[11.5px]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const InputUrlModal = ({
  editor,
  open,
  onOk,
  onCancel,
  onAfterClose,
  defaultValue = "",
  defaultSourceType = WebLinkSourceType.REMOTE,
  title = "添加网页",
  subtitle = "添加远程网址，或上传本地 HTML 文件",
  okText = "确认添加",
}: InputUrlModalProps) => {
  const isDefaultLocal = defaultSourceType === WebLinkSourceType.LOCAL;
  const [activeTab, setActiveTab] = useState<SourceTab>(isDefaultLocal ? "local" : "remote");
  const [remoteUrl, setRemoteUrl] = useState(isDefaultLocal ? "" : defaultValue);
  const [localUrl, setLocalUrl] = useState(isDefaultLocal ? defaultValue : "");
  const [localFileName, setLocalFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 编辑态每次打开回填当前块的地址
  useEffect(() => {
    if (!open) return;
    setActiveTab(isDefaultLocal ? "local" : "remote");
    setRemoteUrl(isDefaultLocal ? "" : defaultValue);
    setLocalUrl(isDefaultLocal ? defaultValue : "");
    setLocalFileName("");
    setUploading(false);
    setError(null);
  }, [open, defaultValue, isDefaultLocal]);

  const handleSelectLocalHtml = useMemoizedFn(async () => {
    const fileService = editor.getService(IFileService);
    const resourceService = editor.getService(IResourceService);
    const filePaths = await fileService.select({
      properties: ["openFile"],
      filters: [{ name: "HTML", extensions: ["html", "htm"] }],
    });
    if (!filePaths || filePaths.length === 0) return;

    const filePath = filePaths[0];
    setUploading(true);
    setError(null);
    try {
      const fileName = (await fileService.getBaseName(filePath)) || "";
      const content = await fileService.readText(filePath);
      const uploadedUrl = await resourceService.upload(
        new File([content], fileName, { type: "text/html" })
      );
      if (!uploadedUrl) {
        setError("上传 HTML 文件失败");
        return;
      }
      setLocalUrl(uploadedUrl);
      setLocalFileName(fileName);
    } catch (err) {
      console.error("选择 HTML 文件失败:", err);
      setError("选择本地 HTML 文件失败");
    } finally {
      setUploading(false);
    }
  });

  const handleOk = useMemoizedFn(() => {
    if (uploading) return;
    if (activeTab === "remote") {
      const url = normalizeUrl(remoteUrl);
      if (!url) {
        setError("请输入网页地址");
        return;
      }
      onOk({ url, sourceType: WebLinkSourceType.REMOTE });
    } else {
      if (!localUrl) {
        setError("请先选择本地 HTML 文件");
        return;
      }
      onOk({ url: localUrl, sourceType: WebLinkSourceType.LOCAL });
    }
  });

  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleOk();
    }
  };

  const confirmDisabled = uploading || (activeTab === "remote" ? !remoteUrl.trim() : !localUrl);

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      onAfterClose={onAfterClose}
      title={title}
      subtitle={subtitle}
      icon={<Globe className="size-4" strokeWidth={1.75} />}
      locked={uploading}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={uploading} onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" size="sm" disabled={confirmDisabled} onClick={handleOk}>
            {okText}
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
            onValueChange={(v: SourceTab) => {
              setActiveTab(v);
              setError(null);
            }}
            disabled={uploading}
          >
            <Segmented.Item value="remote" icon={Globe} label="远程网址" />
            <Segmented.Item value="local" icon={FileCode} label="本地 HTML" />
          </Segmented>

          {activeTab === "remote" ? (
            <Field label="网址">
              <Input
                data-autofocus
                type="url"
                value={remoteUrl}
                onChange={e => {
                  setRemoteUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://www.example.com"
                onKeyDown={submitOnEnter}
                wrapperClassName="h-10 pl-3.5"
                className="text-tau-body-lg"
              />
            </Field>
          ) : (
            <button
              type="button"
              className={cn(
                "border-line-1 rounded-tau-md hover:border-accent hover:bg-accent-soft/40 flex cursor-pointer flex-col items-center gap-2 border border-dashed px-6 py-7 text-center transition-colors",
                uploading && "pointer-events-none"
              )}
              onClick={() => void handleSelectLocalHtml()}
              disabled={uploading}
            >
              {uploading ? (
                <Spinner className="size-5" />
              ) : localUrl ? (
                <Check className="text-ok size-5" strokeWidth={2} />
              ) : (
                <Upload className="text-ink-2 size-5" strokeWidth={1.75} />
              )}
              <span className="text-tau-body text-ink-1 max-w-full truncate font-medium">
                {uploading
                  ? "上传中…"
                  : localFileName || (localUrl ? "已选择本地 HTML" : "选择本地 HTML 文件")}
              </span>
              <span className="text-tau-sm text-ink-3">
                {localUrl ? "点击重新选择" : "支持 .html / .htm"}
              </span>
            </button>
          )}

          {error && (
            <p
              role="alert"
              className="bg-danger-soft text-danger text-tau-meta rounded-tau-sm px-3.5 py-2.5"
            >
              {error}
            </p>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
};

export default InputUrlModal;
