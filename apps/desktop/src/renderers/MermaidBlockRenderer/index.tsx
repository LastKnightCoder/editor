/**
 * Mermaid 块（D-057）：对话里直接画出来（display: inline），右上角「放大」进统一预览框；
 * 预览里可缩放平移，更多菜单导出 SVG / PNG。
 */

import { useRef } from "react";
import { Download, FileImage, Workflow } from "lucide-react";
import {
  defineBlockRenderer,
  type BlockInlineProps,
  type BlockPreviewProps,
} from "@/types/block-preview";
import { InlineBlockShell } from "@/features/previews/components/InlineBlockShell";
import { ZoomSurface } from "@/features/previews/components/ZoomSurface";
import { usePreviewActions } from "@/features/previews/components/previewActions";
import { downloadBlob, svgToPngBlob, safeFileName } from "@/features/previews/exportImage";
import { MermaidDiagram } from "./MermaidDiagram";

function MermaidInline({ block, generating, onExpand }: BlockInlineProps) {
  return (
    <InlineBlockShell source={block.content} onExpand={onExpand} className="px-4 py-5">
      <MermaidDiagram code={block.content} generating={generating} />
    </InlineBlockShell>
  );
}

function MermaidPreview({ block, generating }: BlockPreviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const name = safeFileName(block.metadata.title || "mermaid");
  const svg = () => ref.current?.querySelector("svg") ?? null;

  usePreviewActions({
    more: [
      {
        key: "svg",
        label: "导出 SVG",
        icon: Download,
        onSelect: () => {
          const el = svg();
          if (!el) throw new Error("图表尚未渲染");
          downloadBlob(
            new Blob([new XMLSerializer().serializeToString(el)], { type: "image/svg+xml" }),
            `${name}.svg`
          );
        },
      },
      {
        key: "png",
        label: "导出 PNG",
        icon: FileImage,
        onSelect: async () => {
          const el = svg();
          if (!el) throw new Error("图表尚未渲染");
          downloadBlob(await svgToPngBlob(el), `${name}.png`);
        },
      },
    ],
  });

  return (
    <ZoomSurface>
      <MermaidDiagram ref={ref} code={block.content} generating={generating} />
    </ZoomSurface>
  );
}

export default defineBlockRenderer({
  type: "mermaid",
  label: "Mermaid",
  icon: Workflow,
  display: "inline",
  surface: "canvas",
  title: content => /^\s*---\s*\n\s*title:\s*(.+)$/m.exec(content)?.[1]?.trim(),
  Preview: MermaidPreview,
  Inline: MermaidInline,
});
