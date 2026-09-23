import React, { useEffect, useRef, useState } from "react";
import { Tooltip, Alert, Spin } from "antd";
import { Code, Eye, Copy, Download, Maximize2, RotateCw } from "lucide-react";
import { measurePerformance } from "../../utils/performance";
import styles from "./index.module.less";
import { useDebounce, useCreation } from "ahooks";
import LazySyntaxHighlighter from "../LazySyntaxHighlighter";
import FullscreenPortal from "../FullscreenPortal";
import { renderMermaidSvg } from "../../utils/mermaid-render-core";

export interface MermaidRendererProps {
  code: string;
  /** 是否为暗色主题 */
  isDark?: boolean;
  /** antd message 实例，由消费端通过 App.useApp() 获取后传入 */
  /** 结构兼容 antd message 与 @tau/ui toast（success/error 单参调用同构） */
  messageApi?: { success(msg: string): unknown; error(msg: string): unknown };
  /** 可选的 key 用于刷新 */
  refreshKey?: number;
}

const MermaidRenderer: React.FC<MermaidRendererProps> = ({
  code,
  isDark = false,
  messageApi,
  refreshKey,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [internalRefreshKey, setInternalRefreshKey] = useState(0);
  const debouncedCode = useDebounce(code, {
    wait: 500,
  });

  // 生成唯一的 mermaid ID
  const mermaidId = useCreation(() => {
    return `mermaid-${Math.random().toString(36).substring(2, 11)}`;
  }, []);

  useEffect(() => {
    const perf = measurePerformance("mermaid-render");
    let isMounted = true;

    const renderMermaid = async () => {
      try {
        if (!isMounted) return;
        setIsLoading(true);
        setError("");

        const svg = await renderMermaidSvg({
          code: debouncedCode,
          mermaidId,
          isDark,
        });

        if (isMounted) {
          setError("");
          setSvgContent(svg);
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to render diagram");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          perf.end();
        }
      }
    };

    if (debouncedCode) {
      renderMermaid();
    }

    return () => {
      isMounted = false;
    };
  }, [debouncedCode, isDark, mermaidId, refreshKey, internalRefreshKey]);

  const handleRefresh = () => {
    setInternalRefreshKey(prev => prev + 1);
  };

  const handleCopySource = () => {
    navigator.clipboard.writeText(code).then(
      () => {
        messageApi?.success("源码已复制");
      },
      () => {
        messageApi?.error("复制失败");
      }
    );
  };

  const handleDownload = async () => {
    if (!containerRef.current) {
      messageApi?.error("图表未渲染");
      return;
    }

    try {
      const svgElement = containerRef.current.querySelector("svg");
      if (!svgElement) {
        messageApi?.error("未找到图表");
        return;
      }

      // 克隆 SVG 元素以避免修改原始元素
      const clonedSvg = svgElement.cloneNode(true) as SVGElement;

      // 获取 SVG 的实际尺寸
      const bbox = svgElement.getBBox();
      const width = bbox.width || svgElement.clientWidth || 800;
      const height = bbox.height || svgElement.clientHeight || 600;

      // 设置明确的尺寸属性
      clonedSvg.setAttribute("width", String(width));
      clonedSvg.setAttribute("height", String(height));
      clonedSvg.setAttribute("viewBox", `${bbox.x || 0} ${bbox.y || 0} ${width} ${height}`);

      const canvas = document.createElement("canvas");
      const scale = 2; // 提高分辨率
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        messageApi?.error("无法创建画布");
        return;
      }

      ctx.scale(scale, scale);
      ctx.fillStyle = isDark ? "#000000" : "#ffffff";
      ctx.fillRect(0, 0, width, height);

      // 将 SVG 转换为图片
      const svgString = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        canvas.toBlob(blob => {
          if (blob) {
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = "mermaid-diagram.png";
            a.click();
            URL.revokeObjectURL(downloadUrl);
            messageApi?.success("图表已下载");
          } else {
            messageApi?.error("下载失败");
          }
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        messageApi?.error("转换图片失败");
      };
      img.src = url;
    } catch (err) {
      console.error("Download error:", err);
      messageApi?.error("下载失败");
    }
  };

  const renderContent = () => {
    if (viewMode === "preview") {
      if (isLoading) {
        return (
          <div className="flex min-h-[320px] items-center justify-center">
            <Spin size="large" />
          </div>
        );
      }

      if (error) {
        return <Alert type="error" message="Diagram render error" description={error} showIcon />;
      }

      return (
        <div className="flex-1 overflow-auto bg-white dark:bg-black">
          <div
            ref={containerRef}
            dangerouslySetInnerHTML={{ __html: svgContent }}
            className={styles.svgContainer}
          />
          {/* 隐藏的 mermaid 锚点 */}
          <code id={mermaidId} style={{ display: "none" }}></code>
        </div>
      );
    } else {
      return (
        <div className="flex-1 overflow-auto bg-gray-50 p-3 dark:bg-neutral-900">
          <LazySyntaxHighlighter language="mermaid" isDark={isDark}>
            {code}
          </LazySyntaxHighlighter>
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
              Mermaid Diagram
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip title="刷新">
              <button
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                onClick={handleRefresh}
              >
                <RotateCw size={16} />
              </button>
            </Tooltip>
            <Tooltip title={viewMode === "preview" ? "查看源码" : "查看预览"}>
              <button
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                onClick={() => setViewMode(viewMode === "preview" ? "source" : "preview")}
              >
                {viewMode === "preview" ? <Code size={16} /> : <Eye size={16} />}
              </button>
            </Tooltip>
            {viewMode === "source" && (
              <Tooltip title="复制源码">
                <button
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={handleCopySource}
                >
                  <Copy size={16} />
                </button>
              </Tooltip>
            )}
            {viewMode === "preview" && svgContent && (
              <Tooltip title="下载为图片">
                <button
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={handleDownload}
                >
                  <Download size={16} />
                </button>
              </Tooltip>
            )}
            <Tooltip title="全屏">
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
        <FullscreenPortal title="Mermaid Diagram" onClose={() => setIsFullscreen(false)}>
          {renderContent()}
        </FullscreenPortal>
      )}
    </>
  );
};

export default MermaidRenderer;
