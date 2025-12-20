import React, {
  memo,
  useState,
  useEffect,
  useRef,
  lazy,
  Suspense,
} from "react";
import { Spin, Alert, Tooltip, App } from "antd";
import {
  Globe,
  RotateCw,
  Copy,
  Code,
  Eye,
  Maximize2,
  Download,
  Smartphone,
  Monitor,
} from "lucide-react";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import FullscreenPortal from "@/components/FullscreenPortal";

// 定义 webview 元素的类型
interface WebviewElement extends HTMLElement {
  reload?: () => void;
}

const LazySyntaxHighlighter = lazy(
  () =>
    import("@/layouts/ContentLayout/components/ChatSidebar/LazySyntaxHighlighter"),
);

// 预览渲染
const HtmlBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
    const { message } = App.useApp();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [htmlUrl, setHtmlUrl] = useState<string>("");
    const [viewMode, setViewMode] = useState<"preview" | "source">("preview");
    const [deviceMode, setDeviceMode] = useState<"desktop" | "mobile">(
      "desktop",
    );
    const [isFullscreen, setIsFullscreen] = useState(false);
    const webviewRef = useRef<HTMLElement | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    // 检查是否是 Electron 环境
    const isElectron = typeof window !== "undefined" && !!window.electron;

    useEffect(() => {
      let currentUrl = "";

      // 将 HTML 内容转换为可用的 URL
      const prepareHtml = async () => {
        try {
          setIsLoading(true);
          setError(null);

          if (isElectron) {
            // Electron webview 支持 data URL
            const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(block.content)}`;
            currentUrl = dataUrl;
            setHtmlUrl(dataUrl);
          } else {
            // 浏览器使用 Blob URL
            const blob = new Blob([block.content], { type: "text/html" });
            const url = URL.createObjectURL(blob);
            currentUrl = url;
            setHtmlUrl(url);
          }

          setIsLoading(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load HTML");
          setIsLoading(false);
        }
      };

      prepareHtml();

      return () => {
        // 清理 Blob URL (data URL 不需要清理)
        if (!isElectron && currentUrl && currentUrl.startsWith("blob:")) {
          URL.revokeObjectURL(currentUrl);
        }
      };
    }, [block.content, isElectron]);

    const handleRefresh = () => {
      if (webviewRef.current && isElectron) {
        try {
          (webviewRef.current as WebviewElement).reload?.();
        } catch (err) {
          console.error("Failed to reload webview:", err);
        }
      } else {
        const iframe = iframeRef.current;
        if (!iframe) return;
        const currentSrc = iframe.src;
        iframe.src = "about:blank";
        setTimeout(() => {
          if (iframeRef.current) {
            iframeRef.current.src = currentSrc;
          }
        }, 0);
      }
    };

    const handleCopySource = () => {
      navigator.clipboard.writeText(block.content).then(
        () => {
          message.success("Source code copied to clipboard");
        },
        () => {
          message.error("Failed to copy source code");
        },
      );
    };

    const handleDownload = async () => {
      const safeTitle = block.metadata.title?.trim() || "html-preview";
      const fileName = safeTitle.endsWith(".html")
        ? safeTitle
        : `${safeTitle}.html`;

      // 直接使用本地下载（与所需风格一致），避免重复触发
      const blob = new Blob([block.content], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      message.success("HTML 已保存");
    };

    if (isLoading) {
      return (
        <div className="flex min-h-[320px] items-center justify-center">
          <Spin size="large" />
        </div>
      );
    }

    if (error) {
      return (
        <Alert
          type="error"
          message="Failed to load HTML"
          description={error}
          showIcon
        />
      );
    }

    const renderContent = () => {
      if (viewMode === "preview") {
        const isMobile = deviceMode === "mobile";
        const frameWidth = isMobile ? 430 : "100%";
        const frameHeight = isMobile ? 760 : "100%";

        return (
          <div className="flex flex-1 justify-center overflow-auto bg-white dark:bg-black">
            <div
              className={`overflow-hidden border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-black ${isMobile ? "my-3 w-[430px] max-w-full rounded-xl" : "w-full"}`}
              style={{ height: frameHeight }}
            >
              {isElectron ? (
                <webview
                  ref={webviewRef as React.RefObject<HTMLElement>}
                  src={htmlUrl}
                  partition="persist:html-preview"
                  webpreferences="sandbox=true,contextIsolation=true,nodeIntegration=false"
                  allowpopups={false}
                  style={{
                    width: frameWidth,
                    height: frameHeight,
                    border: "none",
                  }}
                />
              ) : (
                <iframe
                  ref={iframeRef}
                  src={htmlUrl}
                  className="border-0"
                  style={{
                    width: frameWidth,
                    height: frameHeight,
                  }}
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  title="HTML Preview"
                />
              )}
            </div>
          </div>
        );
      } else {
        return (
          <div className="flex-1 overflow-auto bg-gray-50 dark:bg-neutral-900 p-3">
            <Suspense fallback={<Spin />}>
              <LazySyntaxHighlighter language="html">
                {block.content}
              </LazySyntaxHighlighter>
            </Suspense>
          </div>
        );
      }
    };

    return (
      <>
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          {/* 顶部工具栏 */}
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                HTML Preview
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip
                title={viewMode === "preview" ? "View Source" : "View Preview"}
              >
                <button
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={() =>
                    setViewMode(viewMode === "preview" ? "source" : "preview")
                  }
                >
                  {viewMode === "preview" ? (
                    <Code size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </Tooltip>
              {viewMode === "preview" && (
                <Tooltip
                  title={
                    deviceMode === "mobile"
                      ? "切换到桌面预览"
                      : "切换到移动预览"
                  }
                >
                  <button
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                    onClick={() =>
                      setDeviceMode(
                        deviceMode === "mobile" ? "desktop" : "mobile",
                      )
                    }
                  >
                    {deviceMode === "mobile" ? (
                      <Monitor size={16} />
                    ) : (
                      <Smartphone size={16} />
                    )}
                  </button>
                </Tooltip>
              )}
              {viewMode === "preview" && (
                <Tooltip title="Refresh">
                  <button
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                    onClick={handleRefresh}
                  >
                    <RotateCw size={16} />
                  </button>
                </Tooltip>
              )}
              {viewMode === "source" && (
                <Tooltip title="Copy Source">
                  <button
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                    onClick={handleCopySource}
                  >
                    <Copy size={16} />
                  </button>
                </Tooltip>
              )}
              <Tooltip title="Download HTML">
                <button
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={handleDownload}
                >
                  <Download size={16} />
                </button>
              </Tooltip>
              <Tooltip title="Fullscreen">
                <button
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={() => setIsFullscreen(true)}
                >
                  <Maximize2 size={16} />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* 内容区 */}
          {renderContent()}
        </div>

        {/* 全屏模式 */}
        {isFullscreen && (
          <FullscreenPortal
            title={block.metadata.title || "HTML Preview"}
            onClose={() => setIsFullscreen(false)}
          >
            {renderContent()}
          </FullscreenPortal>
        )}
      </>
    );
  },
);

HtmlBlockPreview.displayName = "HtmlBlockPreview";

// 导出渲染器
export const htmlBlockRenderer: BlockRenderer = {
  type: "html",

  canRender: (block: BlockData) => {
    return (
      block.type.toLowerCase() === "html" ||
      !!(
        block.metadata.language &&
        block.metadata.language.toLowerCase() === "html"
      )
    );
  },

  renderPreview: (props: BlockPreviewRendererProps) => {
    return <HtmlBlockPreview {...props} />;
  },

  extractMetadata: (content: string) => {
    // 尝试从 HTML 中提取 title
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : undefined;

    // 计算大小，保留1位小数
    const sizeKB = (content.length / 1024).toFixed(1);
    const size =
      parseFloat(sizeKB) >= 0.1 ? `${sizeKB} KB` : `${content.length} bytes`;

    return {
      icon: <Globe size={20} />,
      title: title || "HTML Preview",
      size,
      description: "点击预览 HTML 内容",
    };
  },
};
