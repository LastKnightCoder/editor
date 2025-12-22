import { memo } from "react";
import { useTabContext } from "@/contexts/TabContext";
import { blockRegistry } from "@/utils/blockRegistry";
import { TabType } from "@/types/tab";
import type { BlockData } from "@/types/block-preview";

const BlockPreviewPage = memo(() => {
  const { tab } = useTabContext();

  if (tab.type !== TabType.BlockPreview || !tab.params) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary">
        无效的预览参数
      </div>
    );
  }

  const block = (tab.params as { block: BlockData }).block;
  const renderer = blockRegistry.findRenderer(block);

  if (!renderer) {
    return (
      <div className="flex items-center justify-center h-full text-text-secondary">
        不支持的预览类型: {block.type}
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto">
      {renderer.renderPreview({
        block,
        onClose: () => {
          // Tab 模式下不需要关闭回调，用户可以直接关闭标签页
        },
      })}
    </div>
  );
});

BlockPreviewPage.displayName = "BlockPreviewPage";

export default BlockPreviewPage;
