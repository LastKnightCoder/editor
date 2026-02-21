import React, { memo } from "react";
import { Workflow } from "lucide-react";
import { App } from "antd";
import {
  BlockRenderer,
  BlockData,
  BlockPreviewRendererProps,
} from "@/types/block-preview";
import { MermaidRenderer } from "@tau/shared";
import { useMarkdownContext } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import useMermaidRenderPreference from "@/hooks/useMermaidRenderPreference";

// 预览渲染
const MermaidBlockPreview: React.FC<BlockPreviewRendererProps> = memo(
  ({ block }) => {
    const { isDark } = useMarkdownContext();
    const { message } = App.useApp();
    const mermaidRenderPreference = useMermaidRenderPreference();
    return (
      <MermaidRenderer
        code={block.content}
        isDark={isDark}
        messageApi={message}
        renderPreference={mermaidRenderPreference}
      />
    );
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
