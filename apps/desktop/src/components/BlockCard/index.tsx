/**
 * 对话里的块卡片（D-048 / D-057）：line-1 描边行，图标 + 标题 + 类型 · 大小 · 版本 · 状态。
 * 正在预览（块预览页在栈顶且是这一块）时 accent 轻染；同一产物有多个版本时标 vN。
 */

import { memo } from "react";
import { Spinner, cn } from "@tau/ui";
import type { BlockData, BlockRenderer } from "@/types/block-preview";
import { usePageOptional } from "@/page/PageProvider";
import { formatBlockSize } from "@/utils/blockRegistry";
import { useChatBlocks } from "@/features/previews/useChatBlocks";
import { BLOCK_PREVIEW_PAGE, blockPreviewParams } from "@/features/previews/openBlock";

interface BlockCardProps {
  block: BlockData;
  renderer: BlockRenderer;
  generating: boolean;
  onOpen?: () => void;
  className?: string;
}

function useIsPreviewing(block: BlockData): boolean {
  const page = usePageOptional();
  const top = page?.state.back[page.state.back.length - 1];
  return top?.key === BLOCK_PREVIEW_PAGE && top.params?.id === blockPreviewParams(block).id;
}

function useVersionLabel(block: BlockData): string | undefined {
  const blocks = useChatBlocks(block.metadata.sourceChatId);
  const live = blocks.find(b => b.key === block.metadata.blockKey);
  return live && live.versionCount > 1 ? `v${live.version}` : undefined;
}

const BlockCard = memo(function BlockCard({
  block,
  renderer,
  generating,
  onOpen,
  className,
}: BlockCardProps) {
  const active = useIsPreviewing(block);
  const version = useVersionLabel(block);
  const Icon = renderer.icon;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className={cn(
        "rounded-tau-md ease-tau-out my-3 flex w-full min-w-0 items-start gap-2.5 border px-3 py-2.5 text-left transition-colors duration-[160ms] first:mt-0 last:mb-0",
        active
          ? "border-accent/40 bg-accent-soft"
          : "border-line-1 bg-surface enabled:hover:bg-surface-hover",
        className
      )}
    >
      <span className="bg-tag-3-soft text-tag-3 grid size-7 shrink-0 place-items-center rounded-[8px]">
        {generating ? (
          <Spinner className="size-3.5 border-[1.5px]" />
        ) : (
          <Icon size={16} strokeWidth={1.75} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-tau-body text-ink-1 block truncate font-medium">
          {block.metadata.title || renderer.label}
        </span>
        <span className="text-tau-sm text-ink-3 flex items-center gap-1.5 whitespace-nowrap">
          <span>{renderer.label}</span>
          <span>
            ·{" "}
            {generating
              ? `已写入 ${block.content.split("\n").length} 行`
              : formatBlockSize(block.content)}
          </span>
          {version && <span className="tabular-nums">· {version}</span>}
          <span>· {generating ? "生成中…" : active ? "预览中" : "点击预览"}</span>
        </span>
      </span>
    </button>
  );
});

export default BlockCard;
