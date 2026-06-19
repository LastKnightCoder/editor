import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import classNames from "classnames";
import {
  Globe,
  Link2,
  FileCode,
  Upload,
  Check,
  X,
  Loader2,
} from "lucide-react";

export type WebviewUrlSourceType = "remote" | "local";

export interface WebviewUrlInputFormServices {
  selectFile?: (options?: {
    properties?: string[];
    filters?: Array<{ name: string; extensions: string[] }>;
    multiple?: boolean;
  }) => Promise<string[] | null | undefined>;
  readTextFile?: (filePath: string) => Promise<string>;
  getFileBaseName?: (filePath: string) => string | Promise<string>;
  uploadResource?: (
    file: File,
  ) => Promise<string | { url?: string } | null | undefined>;
}

export interface WebviewUrlInputFormNotify {
  error?: (msg: string) => void;
  success?: (msg: string) => void;
}

export interface WebviewUrlInputFormProps {
  services: WebviewUrlInputFormServices;
  onOk: (payload: { url: string; sourceType: WebviewUrlSourceType }) => void;
  onCancel: () => void;
  defaultValue?: string;
  defaultSourceType?: WebviewUrlSourceType;
  normalizeUrl?: (value: string) => string;
  notify?: WebviewUrlInputFormNotify;
  title?: string;
  subtitle?: string;
  okText?: string;
}

const defaultNormalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z]+:\/\//.test(trimmed)) return trimmed;
  if (
    trimmed.startsWith("~") ||
    trimmed.startsWith("/") ||
    /^[a-zA-Z]:[\\\/]/.test(trimmed)
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const WebviewUrlInputForm: React.FC<WebviewUrlInputFormProps> = ({
  services,
  onOk,
  onCancel,
  defaultValue = "",
  defaultSourceType = "remote",
  normalizeUrl = defaultNormalizeUrl,
  notify,
  title = "添加网页",
  subtitle = "选择远程网址或本地 HTML",
  okText = "确认添加",
}) => {
  const { selectFile, readTextFile, getFileBaseName, uploadResource } =
    services;
  const initialTab = useMemo(
    () => (defaultSourceType === "local" ? "local" : "url"),
    [defaultSourceType],
  );
  const [activeTab, setActiveTab] = useState<"url" | "local">(initialTab);
  const [remoteUrl, setRemoteUrl] = useState(
    defaultSourceType === "remote" ? defaultValue : "",
  );
  const [localUrl, setLocalUrl] = useState(
    defaultSourceType === "local" ? defaultValue : "",
  );
  const [localFileName, setLocalFileName] = useState("");
  const [localUploading, setLocalUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => window.clearTimeout(timer);
  }, []);

  const handleError = useMemoizedFn((msg: string) => {
    notify?.error?.(msg);
  });
  const handleSuccess = useMemoizedFn((msg: string) => {
    notify?.success?.(msg);
  });

  const handleRemoteChange = useMemoizedFn(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRemoteUrl(e.target.value);
    },
  );

  const handleSelectLocalHtml = useMemoizedFn(async () => {
    if (!uploadResource) {
      handleError("当前环境未配置上传能力");
      return;
    }
    if (!selectFile || !readTextFile) {
      handleError("当前环境未配置文件读取能力");
      return;
    }
    const filePaths = await selectFile({
      properties: ["openFile"],
      filters: [{ name: "HTML", extensions: ["html", "htm"] }],
    });
    if (!filePaths || filePaths.length === 0) return;

    const filePath = filePaths[0];
    try {
      setLocalUploading(true);
      const fileName = (await getFileBaseName?.(filePath)) || "";
      const fileContent = await readTextFile(filePath);
      const htmlFile = new File([fileContent as any], fileName, {
        type: "text/html",
      });
      const result = await uploadResource(htmlFile);
      const uploadedUrl = typeof result === "string" ? result : result?.url;
      if (!uploadedUrl) {
        handleError("上传 HTML 文件失败");
        return;
      }
      setLocalUrl(uploadedUrl);
      setLocalFileName(fileName || "");
      setActiveTab("local");
      handleSuccess("HTML 文件已添加");
    } catch (error) {
      console.error("选择 HTML 文件失败:", error);
      handleError("选择本地 HTML 文件失败");
    } finally {
      setLocalUploading(false);
    }
  });

  const handleOk = useMemoizedFn(() => {
    if (activeTab === "url") {
      if (!remoteUrl.trim()) {
        handleError("请输入网页地址");
        return;
      }
      const normalized = normalizeUrl(remoteUrl);
      if (!normalized) {
        handleError("请输入网页地址");
        return;
      }
      onOk({ url: normalized, sourceType: "remote" });
    } else {
      if (!localUrl) {
        handleError("请先选择本地 HTML 文件");
        return;
      }
      onOk({ url: localUrl, sourceType: "local" });
    }
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && activeTab === "url") {
      e.preventDefault();
      handleOk();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  });

  const confirmDisabled =
    (activeTab === "url" && !remoteUrl.trim()) ||
    (activeTab === "local" && !localUrl);

  return (
    <div className="flex flex-col gap-4" onKeyDown={handleKeyDown}>
      <div className="flex items-center gap-3 mb-1">
        <div className="shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-500">
          <Globe className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold m-0 text-gray-800 dark:text-gray-100">
            {title}
          </h2>
          <p className="text-xs mt-0.5 text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 w-8 h-8 rounded-lg border-none cursor-pointer flex items-center justify-center transition-all bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-gray-200"
          onClick={onCancel}
          aria-label="关闭"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>

      <div className="flex gap-2 p-1 rounded-xl bg-gray-50 dark:bg-zinc-800/60">
        <button
          type="button"
          className={classNames(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-none rounded-lg text-sm font-medium cursor-pointer transition-all bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
            activeTab === "url" &&
              "bg-white dark:bg-zinc-700 text-emerald-500 shadow-sm",
          )}
          onClick={() => setActiveTab("url")}
        >
          <Link2 className="w-4 h-4" />
          远程网址
        </button>
        <button
          type="button"
          className={classNames(
            "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border-none rounded-lg text-sm font-medium cursor-pointer transition-all bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
            activeTab === "local" &&
              "bg-white dark:bg-zinc-700 text-emerald-500 shadow-sm",
          )}
          onClick={() => setActiveTab("local")}
        >
          <FileCode className="w-4 h-4" />
          本地 HTML
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {activeTab === "url" ? (
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              className="w-full py-3.5 pl-10 pr-4 border border-gray-200 dark:border-zinc-700 rounded-xl text-sm outline-none transition-all bg-gray-50 dark:bg-zinc-800/60 text-gray-800 dark:text-gray-100 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
              placeholder="在此粘贴网址，例如：https://www.example.com"
              value={remoteUrl}
              onChange={handleRemoteChange}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="w-full py-3 px-4 border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-xl text-sm font-medium cursor-pointer flex items-center justify-center gap-2 transition-all bg-transparent text-gray-500 dark:text-gray-400 hover:not-disabled:border-emerald-500 hover:not-disabled:text-emerald-500 hover:not-disabled:bg-emerald-50 dark:hover:not-disabled:bg-emerald-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={handleSelectLocalHtml}
              disabled={localUploading}
            >
              {localUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  正在上传...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  选择本地 HTML 文件
                </>
              )}
            </button>
            {localFileName && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-[13px] bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                <Check className="w-4 h-4 shrink-0" />
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                  已选择：{localFileName}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        className="w-full py-3.5 px-5 border-none rounded-xl text-sm font-semibold cursor-pointer transition-all flex items-center justify-center gap-2 bg-emerald-500 text-white shadow-[0_4px_14px_rgba(16,185,129,0.35),0_1px_2px_rgba(0,0,0,0.05)] hover:not-disabled:bg-emerald-600 hover:not-disabled:-translate-y-0.5 active:not-disabled:translate-y-0 disabled:bg-gray-200 dark:disabled:bg-zinc-700 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed disabled:shadow-none disabled:border disabled:border-gray-300 dark:disabled:border-zinc-600"
        onClick={handleOk}
        disabled={confirmDisabled}
      >
        <Check className="w-5 h-5" />
        {okText}
      </button>
    </div>
  );
};

export default WebviewUrlInputForm;
