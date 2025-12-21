import React, { useMemo, useState, useRef, useEffect } from "react";
import { message } from "antd";
import { useMemoizedFn } from "ahooks";
import { WebLinkSourceType } from "../../../types";
import { normalizeWebviewUrl } from "../utils/url";
import { Editor } from "slate";
import "./index.css";

interface InputUrlModalProps {
  editor: Editor;
  onOk: (payload: { url: string; sourceType: WebLinkSourceType }) => void;
  onCancel: () => void;
  defaultValue?: string;
  defaultSourceType?: WebLinkSourceType;
}

const InputUrlModal: React.FC<InputUrlModalProps> = ({
  editor,
  onOk,
  onCancel,
  defaultValue = "",
  defaultSourceType = WebLinkSourceType.REMOTE,
}) => {
  const uploadResource = editor.services?.resource.upload;
  const initialTab = useMemo(
    () => (defaultSourceType === WebLinkSourceType.LOCAL ? "local" : "url"),
    [defaultSourceType],
  );
  const selectFile = editor.services?.file.select;
  const getFileBaseName = editor.services?.file.getBaseName;
  const readTextFile = editor.services?.file.readText;
  const [activeTab, setActiveTab] = useState<"url" | "local">(initialTab);
  const [remoteUrl, setRemoteUrl] = useState(
    defaultSourceType === WebLinkSourceType.REMOTE ? defaultValue : "",
  );
  const [localUrl, setLocalUrl] = useState(
    defaultSourceType === WebLinkSourceType.LOCAL ? defaultValue : "",
  );
  const [localFileName, setLocalFileName] = useState("");
  const [localUploading, setLocalUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleRemoteChange = useMemoizedFn(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRemoteUrl(e.target.value);
    },
  );

  const handleSelectLocalHtml = useMemoizedFn(async () => {
    if (!uploadResource) {
      message.error("当前编辑器未配置上传能力");
      return;
    }
    const filePaths = await selectFile?.({
      properties: ["openFile"],
      filters: [
        {
          name: "HTML",
          extensions: ["html", "htm"],
        },
      ],
    });
    if (!filePaths || filePaths.length === 0) return;

    const filePath = filePaths[0];
    try {
      setLocalUploading(true);
      const fileName = getFileBaseName?.(filePath) || "";
      const fileContent = await readTextFile?.(filePath);
      const htmlFile = new File([fileContent as any], fileName, {
        type: "text/html",
      });
      const result = await uploadResource(htmlFile);
      const uploadedUrl = typeof result === "string" ? result : result?.url;
      if (!uploadedUrl) {
        message.error("上传 HTML 文件失败");
        return;
      }
      setLocalUrl(uploadedUrl);
      setLocalFileName(fileName || "");
      setActiveTab("local");
    } catch (error) {
      console.error("选择 HTML 文件失败:", error);
      message.error("选择 HTML 文件失败");
    } finally {
      setLocalUploading(false);
    }
  });

  const handleOk = useMemoizedFn(() => {
    if (activeTab === "url") {
      if (!remoteUrl.trim()) {
        message.error("请输入网页地址");
        return;
      }
      const normalized = normalizeWebviewUrl(remoteUrl);
      if (!normalized) {
        message.error("请输入网页地址");
        return;
      }
      onOk({ url: normalized, sourceType: WebLinkSourceType.REMOTE });
    } else {
      if (!localUrl) {
        message.error("请先选择本地 HTML 文件");
        return;
      }
      onOk({ url: localUrl, sourceType: WebLinkSourceType.LOCAL });
    }
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && activeTab === "url") {
      handleOk();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  });

  return (
    <div className="webview-input-modal" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="webview-header">
        <div className="webview-icon">
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
        <div className="webview-header-text">
          <h2>添加网页</h2>
          <p>选择远程网址或本地 HTML</p>
        </div>
        <button className="webview-close" onClick={onCancel}>
          <svg
            className="w-[18px] h-[18px]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="webview-tabs">
        <button
          className={`webview-tab ${activeTab === "url" ? "active" : ""}`}
          onClick={() => setActiveTab("url")}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          远程网址
        </button>
        <button
          className={`webview-tab ${activeTab === "local" ? "active" : ""}`}
          onClick={() => setActiveTab("local")}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          本地 HTML
        </button>
      </div>

      {/* Content */}
      <div className="webview-content">
        {activeTab === "url" ? (
          <div className="webview-url-input">
            <svg
              className="webview-input-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder="在此粘贴网址，例如：https://www.example.com"
              value={remoteUrl}
              onChange={handleRemoteChange}
            />
          </div>
        ) : (
          <div className="webview-local-content">
            <button
              className="webview-select-file"
              onClick={handleSelectLocalHtml}
              disabled={localUploading}
            >
              {localUploading ? (
                <>
                  <svg
                    className="webview-spin w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  正在上传...
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  选择本地 HTML 文件
                </>
              )}
            </button>
            {localFileName && (
              <div className="webview-file-selected">
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>已选择：{localFileName}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        className="webview-btn-confirm"
        onClick={handleOk}
        disabled={
          (activeTab === "url" && !remoteUrl.trim()) ||
          (activeTab === "local" && !localUrl)
        }
      >
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
        确认添加
      </button>
    </div>
  );
};

export default InputUrlModal;
