import React, { memo } from "react";
import { PenTool } from "lucide-react";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import { TikZ } from "@tau/shared";
import useTheme from "@/hooks/useTheme";

// 预览渲染
const TikzBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
    const { isDark } = useTheme();

    console.log(block.content);

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex flex-1 items-center justify-center overflow-auto">
          <TikZ content={block.content} isDark={isDark} />
        </div>
      </div>
    );
  },
);

TikzBlockPreview.displayName = "TikzBlockPreview";

// 导出渲染器
export const tikzBlockRenderer: BlockRenderer = {
  type: "tikz",

  canRender: (block: BlockData) => {
    const lang = block.metadata.language?.toLowerCase();
    return (
      block.type === "tikz" ||
      lang === "tikz" ||
      lang === "latex-tikz" ||
      lang === "tex-tikz"
    );
  },

  renderPreview: (props: BlockPreviewRendererProps) => {
    return <TikzBlockPreview {...props} />;
  },

  extractMetadata: (content: string) => {
    // 计算大小，保留1位小数
    const sizeKB = (content.length / 1024).toFixed(1);
    const size =
      parseFloat(sizeKB) >= 0.1 ? `${sizeKB} KB` : `${content.length} bytes`;

    return {
      icon: <PenTool size={20} />,
      title: "TikZ Diagram",
      size,
      description: "点击预览 TikZ 图形",
    };
  },
};
