/**
 * Typst 块（D-057，legacy）：旧对话里的 Typst 文档照常可看（主进程编译），
 * 新对话不再引导生成。预览可缩放平移。
 */

import { FileType } from "lucide-react";
import { Typst } from "@tau/editor/extensions/diagram/renderers";
import useTheme from "@/hooks/useTheme";
import { compileTypst } from "@/commands/typst";
import { defineBlockRenderer, type BlockPreviewProps } from "@/types/block-preview";
import { ZoomSurface } from "@/features/previews/components/ZoomSurface";

function TypstPreview({ block }: BlockPreviewProps) {
  const { isDark } = useTheme();
  return (
    <ZoomSurface>
      <Typst content={block.content} isDark={isDark} compileTypst={compileTypst} />
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
