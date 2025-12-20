import React, { memo } from "react";
import { Spin, Empty } from "antd";
import { CloseOutlined, LoadingOutlined } from "@ant-design/icons";
import { useBlockPreview } from "@/contexts/BlockPreviewContext";
import { blockRegistry } from "@/utils/blockRegistry";
import styles from "./index.module.less";

const BlockPreviewSidebar: React.FC = memo(() => {
  const { state, closePreview } = useBlockPreview();
  const { currentBlock, isLoading } = state;
  const loading = isLoading || currentBlock?.metadata.isGenerating;

  const renderer = currentBlock
    ? blockRegistry.findRenderer(currentBlock)
    : undefined;

  return (
    <div className={styles.sidebarContainer}>
      {/* 头部 */}
      <div className={styles.sidebarHeader}>
        <div className={styles.headerTitle}>
          {currentBlock?.metadata.title || "Block Preview"}
        </div>
        <CloseOutlined className={styles.closeIcon} onClick={closePreview} />
      </div>

      {/* 内容区 */}
      <div className={styles.sidebarContent}>
        {loading && (
          <div className={styles.loadingInline}>
            <Spin indicator={<LoadingOutlined spin />} size="small" />
            <div className={styles.loadingText}>生成中，内容实时更新...</div>
          </div>
        )}
        {currentBlock && renderer ? (
          <div className={styles.previewContainer}>
            {renderer.renderPreview({
              block: currentBlock,
              onClose: closePreview,
            })}
          </div>
        ) : (
          <Empty description="No preview available" />
        )}
      </div>
    </div>
  );
});

BlockPreviewSidebar.displayName = "BlockPreviewSidebar";

export default BlockPreviewSidebar;
