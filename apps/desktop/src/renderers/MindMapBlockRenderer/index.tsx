import React, { memo, useState } from "react";
import { Network, Maximize2, Code, Eye } from "lucide-react";
import { Tooltip } from "antd";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import MindMapRenderer from "@/layouts/ContentLayout/components/ChatSidebar/MindMapRenderer";
import LazySyntaxHighlighter from "@/layouts/ContentLayout/components/ChatSidebar/LazySyntaxHighlighter";
import FullscreenPortal from "@/components/FullscreenPortal";
import styles from "./index.module.less";

// 预览渲染
const MindMapBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSource, setShowSource] = useState(false);

    const renderContent = () => (
      <div className={styles.mindMapContent}>
        {showSource ? (
          <LazySyntaxHighlighter language="markdown">
            {block.content}
          </LazySyntaxHighlighter>
        ) : (
          <MindMapRenderer code={block.content} />
        )}
      </div>
    );

    return (
      <>
        <div className={styles.mindMapContainer}>
          {/* 顶部工具栏 */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <span className={styles.toolbarTitle}>Mind Map</span>
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
