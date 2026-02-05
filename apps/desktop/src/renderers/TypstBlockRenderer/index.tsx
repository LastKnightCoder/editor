import React, { memo } from "react";
import { FileType } from "lucide-react";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import { Typst } from "@tau/shared";
import { compileTypst } from "@/commands/typst";
import useTheme from "@/hooks/useTheme";

// 预览渲染
const TypstBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
    const { isDark } = useTheme();

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex flex-1 items-center justify-center overflow-auto">
          <Typst
            content={block.content}
            isDark={isDark}
            compileTypst={compileTypst}
          />
        </div>
      </div>
    );
  },
);

TypstBlockPreview.displayName = "TypstBlockPreview";

// 导出渲染器
export const typstBlockRenderer: BlockRenderer = {
  type: "typst",

  canRender: (block: BlockData) => {
    const lang = block.metadata.language?.toLowerCase();
    return block.type === "typst" || lang === "typst" || lang === "typ";
  },

  renderPreview: (props: BlockPreviewRendererProps) => {
    return <TypstBlockPreview {...props} />;
  },

  extractMetadata: (content: string) => {
    // 计算大小，保留1位小数
    const sizeKB = (content.length / 1024).toFixed(1);
    const size =
      parseFloat(sizeKB) >= 0.1 ? `${sizeKB} KB` : `${content.length} bytes`;

    return {
      icon: <FileType size={20} />,
      title: "Typst Document",
      size,
      description: "点击预览 Typst 文档",
    };
  },
};
