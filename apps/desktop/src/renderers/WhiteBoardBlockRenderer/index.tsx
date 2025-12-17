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
import {
  buildClipboardPayload,
  writeClipboardPayload,
} from "@/components/WhiteBoard/utils/ClipboardUtil";
import styles from "./index.module.less";

// 预览渲染
const WhiteBoardBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
    const { message } = App.useApp();
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSource, setShowSource] = useState(false);

    // 解析白板元素（用于复制）
    const boardElements = useMemo(() => {
      try {
        return parseWhiteBoard(block.content, false);
      } catch (error) {
        console.error("Failed to parse whiteboard:", error);
        return [];
      }
    }, [block.content]);

    // 复制到剪贴板
    const handleCopy = async () => {
      if (boardElements.length === 0) {
        message.warning("没有可复制的内容");
        return;
      }

      // 创建一个简单的 Board 对象，只实现 moveElement 方法
      // 参考 CommonPlugin 的实现，简单地移动元素的 x, y 坐标
      const mockBoard = {
        moveElement: (element: any, dx: number, dy: number) => ({
          ...element,
          x: element.x + dx,
          y: element.y + dy,
        }),
      };

      const payload = buildClipboardPayload(mockBoard as any, boardElements);
      if (!payload) {
        message.error("复制失败");
        return;
      }

      const success = await writeClipboardPayload(payload);
      if (success) {
        message.success("已复制到剪贴板，可以粘贴到白板中");
      } else {
        message.error("复制到剪贴板失败");
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
              <Tooltip title="Copy to Whiteboard">
                <button className={styles.toolbarBtn} onClick={handleCopy}>
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
