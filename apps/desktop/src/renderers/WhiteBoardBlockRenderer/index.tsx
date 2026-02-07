import React, { memo, useState, useMemo } from "react";
import { Layout, Maximize2, Code, Eye, Copy } from "lucide-react";
import { Tooltip, App } from "antd";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import WhiteBoardRenderer from "@/layouts/ContentLayout/components/ChatSidebar/WhiteBoardRenderer";
import { LazySyntaxHighlighter, FullscreenPortal } from "@tau/shared";
import { parseWhiteBoard } from "@/layouts/ContentLayout/components/ChatSidebar/WhiteBoardRenderer/parseWhiteBoard";
import { copyElementsToClipboard } from "@/utils/clipboardHelpers";
import { useMarkdownContext } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";

// 预览渲染
const WhiteBoardBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
    const { message } = App.useApp();
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSource, setShowSource] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const { isDark } = useMarkdownContext();

    // 解析白板数据
    const whiteBoardData = useMemo(() => {
      try {
        return parseWhiteBoard(block.content, isDark);
      } catch (error) {
        console.error("解析白板数据失败:", error);
        return [];
      }
    }, [block.content, isDark]);

    const handleCopy = async () => {
      setIsCopying(true);
      try {
        if (!whiteBoardData || whiteBoardData.length === 0) {
          message.error("无法获取白板数据");
          return;
        }

        await copyElementsToClipboard(whiteBoardData);
      } catch (error) {
        console.error("复制失败:", error);
      } finally {
        setIsCopying(false);
      }
    };

    const renderContent = () => (
      <div className="flex-1 overflow-auto bg-white p-3 dark:bg-neutral-900">
        {showSource ? (
          <LazySyntaxHighlighter language="yaml" isDark={isDark}>
            {block.content}
          </LazySyntaxHighlighter>
        ) : (
          <WhiteBoardRenderer code={block.content} />
        )}
      </div>
    );

    return (
      <>
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          {/* 顶部工具栏 */}
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Whiteboard
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

          {/* 内容区 */}
          {renderContent()}
        </div>

        {/* 全屏模式 */}
        {isFullscreen && (
          <FullscreenPortal
            title="Whiteboard"
            onClose={() => setIsFullscreen(false)}
          >
            {renderContent()}
          </FullscreenPortal>
        )}
      </>
    );
  },
);

WhiteBoardBlockPreview.displayName = "WhiteBoardBlockPreview";

// 导出渲染器
export const whiteBoardBlockRenderer: BlockRenderer = {
  type: "white-board",

  canRender: (block: BlockData) => {
    return (
      block.type === "white-board" || block.metadata.language === "white-board"
    );
  },

  renderPreview: (props: BlockPreviewRendererProps) => {
    return <WhiteBoardBlockPreview {...props} />;
  },

  extractMetadata: (content: string) => {
    // 计算大小，保留1位小数
    const sizeKB = (content.length / 1024).toFixed(1);
    const size =
      parseFloat(sizeKB) >= 0.1 ? `${sizeKB} KB` : `${content.length} bytes`;

    return {
      icon: <Layout size={20} />,
      title: "Whiteboard",
      size,
      description: "Click to preview whiteboard",
    };
  },
};
