import React, { memo, useEffect } from "react";
import { Card, Tag, Spin } from "antd";
import { FileTextOutlined, LoadingOutlined } from "@ant-design/icons";
import classNames from "classnames";
import { useThrottle } from "ahooks";
import { BlockData } from "@/types/block-preview";
import { useBlockPreview } from "@/contexts/BlockPreviewContext";
import { blockRegistry } from "@/utils/blockRegistry";
import styles from "./index.module.less";

interface BlockCardProps {
  block: BlockData;
  className?: string;
}

const BlockCard: React.FC<BlockCardProps> = memo(({ block, className }) => {
  const { openPreview, isBlockActive, updateBlockContent } = useBlockPreview();
  const isActive = isBlockActive(block);

  // 节流内容更新（200ms），避免高频流式输出被吞掉
  const throttledBlock = useThrottle(block, {
    wait: 200,
    leading: true,
    trailing: true,
  });

  // 当防抖后的内容变化且该块正在预览时，更新预览内容
  useEffect(() => {
    if (isActive) {
      updateBlockContent(throttledBlock);
    }
  }, [throttledBlock, isActive, updateBlockContent]);

  const handleClick = () => {
    openPreview(block);
  };

  const renderer = blockRegistry.findRenderer(block);

  // 如果有自定义渲染器，使用它
  if (renderer?.renderCard) {
    return renderer.renderCard({
      block,
      isSelected: isActive,
      onClick: handleClick,
    }) as JSX.Element;
  }

  // 默认卡片样式
  const { metadata } = block;
  const icon = metadata.icon || <FileTextOutlined />;

  return (
    <Card
      className={classNames(styles.blockCard, className, {
        [styles.active]: isActive,
        [styles.generating]: metadata.isGenerating,
      })}
      hoverable
      onClick={handleClick}
      size="small"
    >
      <div className={styles.cardHeader}>
        <div className={styles.cardIcon}>
          {metadata.isGenerating ? (
            <Spin indicator={<LoadingOutlined spin />} />
          ) : (
            icon
          )}
        </div>
        <div className={styles.cardInfo}>
          <div className={styles.cardTitle}>
            {metadata.title || `${block.type} Block`}
            {metadata.isGenerating && (
              <span className={styles.generatingLabel}> (Generating...)</span>
            )}
          </div>
          <div className={styles.cardMeta}>
            <Tag color="blue">{block.type}</Tag>
            {metadata.size && (
              <span className={styles.cardSize}>{metadata.size}</span>
            )}
          </div>
        </div>
      </div>
      {metadata.description && (
        <div className={styles.cardDescription}>{metadata.description}</div>
      )}
    </Card>
  );
});

BlockCard.displayName = "BlockCard";

export default BlockCard;
