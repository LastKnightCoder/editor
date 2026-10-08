/**
 * 添加网页：远程网址直接添加，或选择本地 HTML 上传后插入（D-049）。
 *
 * 外壳不再套 @tau/shared 的 WebviewUrlInputForm（它自带标题行、关闭钮和整宽主按钮，
 * 放进 Dialog 会出现两层头部）；选择 / 读取 / 上传本地 HTML 的流程与其保持一致。
 */

import { useEffect, useState } from "react";
import { FileCode, Globe } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";
import { Button, Dialog, DialogBody, Input, toast } from "@tau/ui";

import { Board as Board } from "@tau/whiteboard";
import useUploadResource from "@/hooks/useUploadResource";
import { selectFile, readTextFile, getFileBaseName } from "@/commands";

interface WebviewSelectorModalProps {
  open: boolean;
  onClose: () => void;
  board: Board;
}

type WebviewSourceType = "remote" | "local";

const DEFAULT_URL = "https://www.google.com";

/** 与 WebviewUrlInputForm 的默认归一化一致：无协议补 https://，本地路径原样保留 */
const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z]+:\/\//.test(trimmed)) return trimmed;
  if (trimmed.startsWith("~") || trimmed.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const WebviewSelectorModal = ({ open, onClose, board }: WebviewSelectorModalProps) => {
  const uploadResource = useUploadResource();
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setUploading(false);
  }, [open]);

  const insertWebview = useMemoizedFn((targetUrl: string, sourceType: WebviewSourceType) => {
    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    const webviewWidth = 600;
    const webviewHeight = 400;

    board.apply({
      type: "insert_node",
      path: [board.children.length],
      node: {
        id: getUuid(),
        type: "webview",
        url: targetUrl || DEFAULT_URL,
        sourceType,
        x: center.x - webviewWidth / 2,
        y: center.y - webviewHeight / 2,
        width: webviewWidth,
        height: webviewHeight,
      },
    });

    onClose();
  });

  const handleSubmit = useMemoizedFn(() => {
    // 本地文件上传中不允许经 Enter 旁路插入远程网页，避免并发插入两个元素
    if (uploading) return;
    const normalized = normalizeUrl(url);
    if (!normalized) {
      toast.error("请输入网页地址");
      return;
    }
    insertWebview(normalized, "remote");
  });

  // 选择本地 HTML → 读取 → 上传为资源 → 以 local 来源插入
  const handleSelectLocalHtml = useMemoizedFn(async () => {
    const canSubmit = board.captureSubmission();
    if (!canSubmit()) return;
    const filePaths = await selectFile({
      properties: ["openFile"],
      filters: [{ name: "HTML", extensions: ["html", "htm"] }],
    });
    if (!filePaths || filePaths.length === 0) return;

    const filePath = filePaths[0];
    try {
      setUploading(true);
      const fileName = (await getFileBaseName(filePath)) || "";
      const fileContent = await readTextFile(filePath);
      const htmlFile = new File([fileContent], fileName, { type: "text/html" });
      const uploadedUrl = await uploadResource(htmlFile);
      if (!uploadedUrl) {
        toast.error("上传 HTML 文件失败");
        return;
      }
      if (canSubmit()) insertWebview(uploadedUrl, "local");
    } catch (error) {
      console.error("选择 HTML 文件失败:", error);
      toast.error("选择本地 HTML 文件失败");
    } finally {
      setUploading(false);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title="添加网页"
      width={460}
      locked={uploading}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={uploading} onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!url.trim() || uploading}
            onClick={handleSubmit}
          >
            添加
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">网页地址</span>
            <Input
              data-autofocus
              lead={Globe}
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="在此粘贴网址，例如：https://www.example.com"
            />
          </label>
          <span className="text-ink-3 text-[12px]">或者</span>
          <Button
            variant="secondary"
            size="sm"
            icon={FileCode}
            loading={uploading}
            loadingText="正在上传…"
            onClick={handleSelectLocalHtml}
            className="self-start"
          >
            选择本地 HTML 文件…
          </Button>
        </div>
      </DialogBody>
    </Dialog>
  );
};

export default WebviewSelectorModal;
