import { useMemo } from "react";
import { usePage, usePageParams } from "@/page/PageProvider";
import { blockRegistry } from "@/utils/blockRegistry";
import type { BlockData } from "@/types/block-preview";

export function BlockPreviewView() {
  const { block: serialized } = usePageParams<{ block: string }>();
  const { navigator } = usePage();
  const block = useMemo(() => {
    try {
      const value = JSON.parse(serialized) as BlockData;
      return value &&
        typeof value.type === "string" &&
        typeof value.content === "string" &&
        value.metadata
        ? value
        : null;
    } catch {
      return null;
    }
  }, [serialized]);
  const renderer = block ? blockRegistry.findRenderer(block) : undefined;
  if (!block || !renderer) return <div className="text-ink-2 p-6">无法预览此内容</div>;
  return (
    <div className="h-full w-full overflow-auto">
      {renderer.renderPreview({ block, onClose: () => navigator.back() })}
    </div>
  );
}
