/**
 * Typst 块（D-057，legacy）：旧对话里的 Typst 文档照常可看（仅展示已保存的
 * 排版缓存，宿主不再内置编译），新对话不再引导生成。预览可缩放平移。
 */

import { FileType } from "lucide-react";
import { Typst } from "@tau/editor/extensions/diagram/renderers";
import useTheme from "@/hooks/useTheme";
import { defineBlockRenderer, type BlockPreviewProps } from "@/types/block-preview";
import { ZoomSurface } from "@/features/previews/components/ZoomSurface";

function TypstPreview({ block }: BlockPreviewProps) {
  const { isDark } = useTheme();
  return (
    <ZoomSurface>
      <Typst content={block.content} isDark={isDark} />
    </ZoomSurface>
  );
}

export default defineBlockRenderer({
  type: "typst",
  aliases: ["typ"],
  label: "Typst",
  icon: FileType,
  legacy: true,
  surface: "white",
  Preview: TypstPreview,
});
