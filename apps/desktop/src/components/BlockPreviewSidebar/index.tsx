import React, { memo } from "react";
import { X } from "lucide-react";
import { IconButton, Spinner } from "@tau/ui";
import { useBlockPreview } from "@/contexts/BlockPreviewContext";
import { blockRegistry } from "@/utils/blockRegistry";

/**
 * 块预览栏（对话页 / Vibe 学习）：标题行 + 渲染器预览区；生成中在标题下显示一行实时更新提示（D-048 tau 化）。
 */
const BlockPreviewSidebar: React.FC = memo(() => {
  const { state, closePreview } = useBlockPreview();
  const { currentBlock, isLoading } = state;
  const loading = isLoading || currentBlock?.metadata.isGenerating;

  const renderer = currentBlock ? blockRegistry.findRenderer(currentBlock) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 flex-none items-center gap-2 pl-4 pr-2">
        <div className="text-tau-body text-ink-1 min-w-0 flex-1 truncate font-semibold">
          {currentBlock?.metadata.title || "内容预览"}
        </div>
        <IconButton aria-label="关闭预览" title="关闭预览" onClick={closePreview}>
          <X size={16} strokeWidth={1.75} />
        </IconButton>
      </div>

      {loading && (
        <div className="text-tau-sm text-ink-3 flex flex-none items-center gap-2 px-4 pb-2">
          <Spinner className="size-3 border-[1.5px]" />
          生成中，内容实时更新…
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {currentBlock && renderer ? (
          renderer.renderPreview({ block: currentBlock, onClose: closePreview })
        ) : (
          <div className="text-tau-meta text-ink-3 flex h-full items-center justify-center">
            无法预览此内容
          </div>
        )}
      </div>
    </div>
  );
});

BlockPreviewSidebar.displayName = "BlockPreviewSidebar";

export default BlockPreviewSidebar;
