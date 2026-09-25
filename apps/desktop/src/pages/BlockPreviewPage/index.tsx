import { memo } from "react";
import { useTabContext } from "@/contexts/TabContext";
import { blockRegistry } from "@/utils/blockRegistry";
import { TabType } from "@/types/tab";
import type { BlockData } from "@/types/block-preview";
import { BlockPreviewFrame } from "@/features/previews/components/BlockPreviewFrame";

/** legacy 标签页里的块预览（/legacy 路由）：同一个统一预览框，快照内容 */
const BlockPreviewPage = memo(() => {
  const { tab } = useTabContext();
  const block =
    tab.type === TabType.BlockPreview ? (tab.params as { block?: BlockData })?.block : undefined;
  const renderer = block ? blockRegistry.find(block) : undefined;

  if (!block || !renderer) {
    return <div className="text-ink-3 flex h-full items-center justify-center">无法预览此内容</div>;
  }
  return <BlockPreviewFrame block={block} renderer={renderer} generating={false} />;
});

BlockPreviewPage.displayName = "BlockPreviewPage";

export default BlockPreviewPage;
