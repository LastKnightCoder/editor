import React, { memo, useState, useRef } from "react";
import { Network, Maximize2, Code, Eye, Copy } from "lucide-react";
import { Tooltip, message } from "antd";
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
import styles from "./index.module.less";

// 预览渲染
const MindMapBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
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
      <div className={styles.mindMapContent}>
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
        <div className={styles.mindMapContainer}>
          {/* 顶部工具栏 */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <span className={styles.toolbarTitle}>Mind Map</span>
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
