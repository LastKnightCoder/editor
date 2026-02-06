import React, { memo, useState, useRef } from "react";
import { Network, Maximize2, Code, Eye, Copy } from "lucide-react";
import { Tooltip, App } from "antd";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import MindMapRenderer from "@/layouts/ContentLayout/components/ChatSidebar/MindMapRenderer";
import LazySyntaxHighlighter from "@/layouts/ContentLayout/components/ChatSidebar/LazySyntaxHighlighter";
import FullscreenPortal from "@/components/FullscreenPortal";
import { MindMapRef } from "@/components/MindMap";
import { copyElementsToClipboard } from "@/utils/clipboardHelpers";

// 预览渲染
const MindMapBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
    const { message } = App.useApp();
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSource, setShowSource] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const mindMapRef = useRef<MindMapRef>(null);

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

    const renderContent = () => (
      <div className="flex-1 overflow-auto bg-white p-3 dark:bg-neutral-900">
        {showSource ? (
          <LazySyntaxHighlighter language="markdown">
            {block.content}
          </LazySyntaxHighlighter>
        ) : (
          <MindMapRenderer ref={mindMapRef} code={block.content} />
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
          {renderContent()}
        </div>
        {isFullscreen && (
          <FullscreenPortal
            title={block.metadata.title || "Mind Map"}
            onClose={() => setIsFullscreen(false)}
          >
            {renderContent()}
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
