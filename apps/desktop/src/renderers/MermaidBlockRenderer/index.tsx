import React, { memo } from "react";
import { Workflow } from "lucide-react";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import MermaidRenderer from "@/layouts/ContentLayout/components/ChatSidebar/MermaidRenderer";

// 预览渲染
const MermaidBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
    return <MermaidRenderer code={block.content} />;
  },
);

MermaidBlockPreview.displayName = "MermaidBlockPreview";

// 导出渲染器
export const mermaidBlockRenderer: BlockRenderer = {
  type: "mermaid",

  canRender: (block: BlockData) => {
    return block.type === "mermaid" || block.metadata.language === "mermaid";
  },

  renderPreview: (props: BlockPreviewRendererProps) => {
    return <MermaidBlockPreview {...props} />;
  },

  extractMetadata: (content: string) => {
    // 计算大小，保留1位小数
    const sizeKB = (content.length / 1024).toFixed(1);
    const size =
      parseFloat(sizeKB) >= 0.1 ? `${sizeKB} KB` : `${content.length} bytes`;

    return {
      icon: <Workflow size={20} />,
      title: "Mermaid Diagram",
      size,
      description: "Click to preview diagram",
    };
  },
};
