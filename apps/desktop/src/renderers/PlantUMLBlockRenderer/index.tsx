import React, { memo } from "react";
import { GitBranch } from "lucide-react";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import { PlantUML } from "@tau/shared";
import { nodeFetch } from "@/commands/extra";
import useTheme from "@/hooks/useTheme";

// 预览渲染
const PlantUMLBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
    const { isDark } = useTheme();

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
        <PlantUML
          content={block.content}
          isDark={isDark}
          nodeFetch={nodeFetch}
        />
      </div>
    );
  },
);

PlantUMLBlockPreview.displayName = "PlantUMLBlockPreview";

// 导出渲染器
export const plantumlBlockRenderer: BlockRenderer = {
  type: "plantuml",

  canRender: (block: BlockData) => {
    return block.type === "plantuml" || block.metadata.language === "plantuml";
  },

  renderPreview: (props: BlockPreviewRendererProps) => {
    return <PlantUMLBlockPreview {...props} />;
  },

  extractMetadata: (content: string) => {
    // 计算大小，保留1位小数
    const sizeKB = (content.length / 1024).toFixed(1);
    const size =
      parseFloat(sizeKB) >= 0.1 ? `${sizeKB} KB` : `${content.length} bytes`;

    return {
      icon: <GitBranch size={20} />,
      title: "PlantUML Diagram",
      size,
      description: "Click to preview diagram",
    };
  },
};
