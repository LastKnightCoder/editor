import React, { memo, useState, useMemo } from "react";
import { Layout, Maximize2, Code, Eye, Copy } from "lucide-react";
import { Tooltip, App } from "antd";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import WhiteBoardRenderer from "@/layouts/ContentLayout/components/ChatSidebar/WhiteBoardRenderer";
import LazySyntaxHighlighter from "@/layouts/ContentLayout/components/ChatSidebar/LazySyntaxHighlighter";
import FullscreenPortal from "@/components/FullscreenPortal";
import { parseWhiteBoard } from "@/layouts/ContentLayout/components/ChatSidebar/WhiteBoardRenderer/parseWhiteBoard";
import { copyElementsToClipboard } from "@/utils/clipboardHelpers";
import { useMarkdownContext } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import styles from "./index.module.less";

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
      <div className={styles.whiteBoardContent}>
        {showSource ? (
          <LazySyntaxHighlighter language="yaml">
            {block.content}
          </LazySyntaxHighlighter>
        ) : (
          <WhiteBoardRenderer code={block.content} />
        )}
      </div>
    );

    return (
      <>
        <div className={styles.whiteBoardContainer}>
          {/* 顶部工具栏 */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <span className={styles.toolbarTitle}>Whiteboard</span>
            </div>
            <div className={styles.toolbarRight}>
              <Tooltip title="复制到白板">
                <button
                  className={styles.toolbarBtn}
                  onClick={handleCopy}
                  disabled={isCopying || showSource}
                >
                  <Copy size={16} />
                </button>
              </Tooltip>
              <Tooltip title={showSource ? "Hide Source" : "Show Source"}>
                <button
                  className={styles.toolbarBtn}
                  onClick={() => setShowSource(!showSource)}
                >
                  {showSource ? <Eye size={16} /> : <Code size={16} />}
                </button>
              </Tooltip>
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
