import React, {
  memo,
  useState,
  useEffect,
  useRef,
  lazy,
  Suspense,
} from "react";
import { Spin, Alert, Tooltip, App } from "antd";
import { Globe, RotateCw, Copy, Code, Eye, Maximize2 } from "lucide-react";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import FullscreenPortal from "@/components/FullscreenPortal";
import styles from "./index.module.less";

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
    const [isFullscreen, setIsFullscreen] = useState(false);
    const webviewRef = useRef<HTMLElement | null>(null);

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
        // 对于 iframe，强制重新加载
        const iframe = document.querySelector(
          `.${styles.webviewContainer} iframe`,
        ) as HTMLIFrameElement;
        if (iframe) {
          const currentSrc = iframe.src;
          iframe.src = "about:blank";
          setTimeout(() => {
            iframe.src = currentSrc;
          }, 0);
        }
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

    if (isLoading) {
      return (
        <div className={styles.loadingContainer}>
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
        return (
          <div className={styles.webviewContainer}>
            {isElectron ? (
              <webview
                ref={webviewRef as React.RefObject<HTMLElement>}
                src={htmlUrl}
                partition="persist:html-preview"
                webpreferences="sandbox=true,contextIsolation=true,nodeIntegration=false"
                allowpopups={false}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
              />
            ) : (
              <iframe
                src={htmlUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                }}
                sandbox="allow-scripts allow-same-origin allow-forms"
                title="HTML Preview"
              />
            )}
          </div>
        );
      } else {
        return (
          <div className={styles.sourceContainer}>
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
        <div className={styles.htmlPreviewContainer}>
          {/* 顶部工具栏 */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <span className={styles.toolbarTitle}>HTML Preview</span>
            </div>

            <div className={styles.toolbarRight}>
              <Tooltip
                title={viewMode === "preview" ? "View Source" : "View Preview"}
              >
                <button
                  className={styles.toolbarBtn}
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
                <Tooltip title="Refresh">
                  <button className={styles.toolbarBtn} onClick={handleRefresh}>
                    <RotateCw size={16} />
                  </button>
                </Tooltip>
              )}
              {viewMode === "source" && (
                <Tooltip title="Copy Source">
                  <button
                    className={styles.toolbarBtn}
                    onClick={handleCopySource}
                  >
                    <Copy size={16} />
                  </button>
                </Tooltip>
              )}
              <Tooltip title="Fullscreen">
                <button
                  className={styles.toolbarBtn}
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
