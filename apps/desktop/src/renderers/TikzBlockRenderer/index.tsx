/**
 * TikZ 块（D-057，legacy）：旧对话里的 TikZ 图照常可看（浏览器内 tikzjax 编译），
 * 新对话不再引导生成。预览可缩放平移。
 */

import { Sigma } from "lucide-react";
import { TikZ } from "@tau/editor-diagram/renderers";
import useTheme from "@/hooks/useTheme";
import { defineBlockRenderer, type BlockPreviewProps } from "@/types/block-preview";
import { ZoomSurface } from "@/features/previews/components/ZoomSurface";

function TikzPreview({ block }: BlockPreviewProps) {
  const { isDark } = useTheme();
  return (
    <ZoomSurface>
      <TikZ content={block.content} isDark={isDark} />
    </ZoomSurface>
  );
}

export default defineBlockRenderer({
  type: "tikz",
  aliases: ["latex-tikz", "tex-tikz"],
  label: "TikZ",
  icon: Sigma,
  sourceLanguage: "latex",
  legacy: true,
  surface: "canvas",
  Preview: TikzPreview,
});
