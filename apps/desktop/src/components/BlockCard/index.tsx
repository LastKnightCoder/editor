import React, { memo, useEffect } from "react";
import { FileCode2 } from "lucide-react";
import { useThrottle } from "ahooks";
import { Spinner, cn } from "@tau/ui";
import { BlockData } from "@/types/block-preview";
import { useBlockPreviewOptional } from "@/contexts/BlockPreviewContext";
import { blockRegistry } from "@/utils/blockRegistry";

interface BlockCardProps {
  block: BlockData;
  className?: string;
  onPreview?: (block: BlockData) => void; // 自定义预览处理
}

/**
 * 可预览块卡片（对话里的 HTML / 白板等生成物）：line-1 描边内框行，图标 + 标题 + 类型 / 大小，
 * 正在预览时 accent 轻染（D-048）；渲染器自带 renderCard 时让位给渲染器。
 */
const BlockCard: React.FC<BlockCardProps> = memo(({ block, className, onPreview }) => {
  // 使用可选的 context，当有自定义 onPreview 时可以不在 Provider 内
  const context = useBlockPreviewOptional();
  const isActive = context?.isBlockActive(block) ?? false;

  // 节流内容更新（200ms），避免高频流式输出被吞掉
  const throttledBlock = useThrottle(block, {
    wait: 200,
    leading: true,
    trailing: true,
  });

  // 当防抖后的内容变化且该块正在预览时，更新预览内容
  useEffect(() => {
    if (isActive && context) {
      context.updateBlockContent(throttledBlock);
    }
  }, [throttledBlock, isActive, context]);

  const handleClick = () => {
    if (onPreview) {
      onPreview(block);
    } else if (context) {
      context.openPreview(block);
    }
  };

  const renderer = blockRegistry.findRenderer(block);

  if (renderer?.renderCard) {
    return renderer.renderCard({
      block,
      isSelected: isActive,
      onClick: handleClick,
    }) as React.ReactElement;
  }

  const { metadata } = block;
  const generating = Boolean(metadata.isGenerating);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "rounded-tau-md ease-tau-out my-3 flex w-full min-w-0 items-start gap-2.5 border px-3 py-2.5 text-left transition-colors duration-[160ms] first:mt-0 last:mb-0",
        isActive
          ? "border-accent/40 bg-accent-soft"
          : "border-line-1 bg-surface hover:bg-surface-hover",
        className
      )}
    >
      <span className="bg-tag-3-soft text-tag-3 grid size-7 shrink-0 place-items-center rounded-[8px] [&_svg]:size-4">
        {generating ? (
          <Spinner className="size-3.5 border-[1.5px]" />
        ) : (
          metadata.icon || <FileCode2 strokeWidth={1.75} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-tau-body text-ink-1 block truncate font-medium">
          {metadata.title || `${block.type} 内容`}
        </span>
        <span className="text-tau-sm text-ink-3 flex items-center gap-1.5">
          <span className="font-tau-mono">{block.type}</span>
          {metadata.size && <span>· {metadata.size}</span>}
          <span>· {generating ? "生成中…" : isActive ? "预览中" : "点击预览"}</span>
        </span>
        {metadata.description && (
          <span className="text-tau-sm text-ink-2 mt-1 line-clamp-2 block">
            {metadata.description}
          </span>
        )}
      </span>
    </button>
  );
});

BlockCard.displayName = "BlockCard";

export default BlockCard;
