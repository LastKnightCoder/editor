import React, { memo, useState, useRef } from "react";
import { Network, Maximize2, Code, Eye, Copy, Download } from "lucide-react";
import { Tooltip, App } from "antd";
import { snapdom } from "@zumer/snapdom";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import MindMapRenderer from "@/layouts/ContentLayout/components/ChatSidebar/MindMapRenderer";
import { LazySyntaxHighlighter, FullscreenPortal } from "@tau/shared";
import { useMarkdownContext } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { MindMapRef } from "@/components/MindMap";
import { copyElementsToClipboard } from "@/utils/clipboardHelpers";

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

// 预览渲染
const MindMapBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
    const { message } = App.useApp();
    const { isDark } = useMarkdownContext();
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSource, setShowSource] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [exportingImage, setExportingImage] = useState(false);
    const mindMapRef = useRef<MindMapRef>(null);
    const exportRef = useRef<HTMLDivElement>(null);
    const fullscreenExportRef = useRef<HTMLDivElement>(null);

    const handleCopy = async () => {
      setIsCopying(true);
      try {
        const layoutTree = mindMapRef.current?.getLayoutTree();
        if (!layoutTree) {
          message.error("无法获取思维导图数据");
          return;
        }

        // 直接使用根节点（保持树形结构）
        await copyElementsToClipboard([layoutTree]);
      } catch (error) {
        console.error("复制失败:", error);
      } finally {
        setIsCopying(false);
      }
    };

    const handleExportImage = async () => {
      if (exportingImage) return;
      const exportElement = isFullscreen
        ? fullscreenExportRef.current
        : exportRef.current;
      if (!exportElement) {
        message.error("未找到可导出的思维导图区域");
        return;
      }

      const mindMapSvg = exportElement.querySelector(
        "svg.pointer-events-none",
      ) as SVGSVGElement | null;
      const canvasElement = (mindMapSvg?.parentElement ||
        null) as HTMLElement | null;
      const captureTarget = canvasElement || exportElement;

      const rect = captureTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        message.error("思维导图尚未渲染完成，请稍后重试");
        return;
      }

      setExportingImage(true);
      try {
        const originalStyle = {
          width: captureTarget.style.width,
          height: captureTarget.style.height,
          maxHeight: captureTarget.style.maxHeight,
          overflow: captureTarget.style.overflow,
          transform: captureTarget.style.transform,
          transformOrigin: captureTarget.style.transformOrigin,
          background: captureTarget.style.background,
        };

        const computed = window.getComputedStyle(captureTarget);
        const computedWidth = parseFloat(computed.width) || rect.width;
        const computedHeight = parseFloat(computed.height) || rect.height;

        captureTarget.style.width = `${Math.ceil(computedWidth)}px`;
        captureTarget.style.height = `${Math.ceil(computedHeight)}px`;
        captureTarget.style.maxHeight = "none";
        captureTarget.style.overflow = "visible";
        captureTarget.style.transformOrigin = "top left";
        captureTarget.style.transform = "none";
        if (!captureTarget.style.background) {
          captureTarget.style.background =
            computed.backgroundColor || "#ffffff";
        }

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

        const blob = await snapdom.toBlob(captureTarget, {
          dpr: window.devicePixelRatio || 2,
          type: "png",
          quality: 0.95,
          filter: (element) => {
            const el = element as HTMLElement | null;
            return !el?.hasAttribute?.("data-export-mask");
          },
          filterMode: "hide",
        });

        captureTarget.style.width = originalStyle.width;
        captureTarget.style.height = originalStyle.height;
        captureTarget.style.maxHeight = originalStyle.maxHeight;
        captureTarget.style.overflow = originalStyle.overflow;
        captureTarget.style.transform = originalStyle.transform;
        captureTarget.style.transformOrigin = originalStyle.transformOrigin;
        captureTarget.style.background = originalStyle.background;

        const title = (block.metadata.title || "Mind Map")
          .replace(/[\\:*?"<>|]/g, "_")
          .trim();
        downloadBlob(blob, `${title}.png`);
        message.success("图片导出成功");
      } catch (e) {
        console.error("Export mindmap image failed:", e);
        message.error("导出失败，请重试");
      } finally {
        setExportingImage(false);
      }
    };

    const renderContent = (ref?: React.RefObject<HTMLDivElement | null>) => (
      <div className="relative flex-1 overflow-auto bg-white p-3 dark:bg-neutral-900">
        {showSource ? (
          <LazySyntaxHighlighter language="markdown" isDark={isDark}>
            {block.content}
          </LazySyntaxHighlighter>
        ) : (
          <div ref={ref} className="relative h-full">
            {exportingImage && (
              <div
                data-export-mask
                className="absolute inset-0 z-10 flex items-center justify-center bg-black/35 backdrop-blur-[1px]"
              >
                <div className="flex items-center gap-2 text-sm text-white">
                  正在导出图片...
                </div>
              </div>
            )}
            <MindMapRenderer ref={mindMapRef} code={block.content} />
          </div>
        )}
      </div>
    );

    return (
      <>
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Mind Map
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip title="复制到白板">
                <button
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={handleCopy}
                  disabled={isCopying || showSource}
                >
                  <Copy size={16} />
                </button>
              </Tooltip>
              <Tooltip title="导出为图片">
                <button
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={handleExportImage}
                  disabled={exportingImage || showSource}
                >
                  <Download size={16} />
                </button>
              </Tooltip>
              <Tooltip title={showSource ? "Hide Source" : "Show Source"}>
                <button
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 active:translate-y-px dark:text-gray-300 dark:hover:bg-neutral-700 dark:hover:text-white"
                  onClick={() => setShowSource(!showSource)}
                >
                  {showSource ? <Eye size={16} /> : <Code size={16} />}
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
          {renderContent(exportRef)}
        </div>
        {isFullscreen && (
          <FullscreenPortal
            title={block.metadata.title || "Mind Map"}
            onClose={() => setIsFullscreen(false)}
          >
            {renderContent(fullscreenExportRef)}
          </FullscreenPortal>
        )}
      </>
    );
  },
);

MindMapBlockPreview.displayName = "MindMapBlockPreview";

// 导出渲染器
export const mindMapBlockRenderer: BlockRenderer = {
  type: "mind-map",

  canRender: (block: BlockData) => {
    return block.type === "mind-map" || block.metadata.language === "mind-map";
  },

  renderPreview: (props: BlockPreviewRendererProps) => {
    return <MindMapBlockPreview {...props} />;
  },

  extractMetadata: (content: string) => {
    // 尝试提取第一行作为标题
    const firstLine = content
      .split("\n")[0]
      ?.trim()
      .replace(/^[*-]\s*/, "");
    const title = firstLine || "Mind Map";

    // 计算大小，保留1位小数
    const sizeKB = (content.length / 1024).toFixed(1);
    const size =
      parseFloat(sizeKB) >= 0.1 ? `${sizeKB} KB` : `${content.length} bytes`;

    return {
      icon: <Network size={20} />,
      title,
      size,
      description: "Click to preview mind map",
    };
  },
};
