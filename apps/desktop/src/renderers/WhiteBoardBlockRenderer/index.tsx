import React, { memo, useState } from "react";
import { Layout, Maximize2, Code, Eye } from "lucide-react";
import { Tooltip } from "antd";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import WhiteBoardRenderer from "@/layouts/ContentLayout/components/ChatSidebar/WhiteBoardRenderer";
import LazySyntaxHighlighter from "@/layouts/ContentLayout/components/ChatSidebar/LazySyntaxHighlighter";
import FullscreenPortal from "@/components/FullscreenPortal";
import styles from "./index.module.less";

// 预览渲染
const WhiteBoardBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSource, setShowSource] = useState(false);

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
