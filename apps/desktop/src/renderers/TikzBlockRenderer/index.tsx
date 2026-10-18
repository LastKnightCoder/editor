/**
 * 旧对话的 TikZ 通过已安装的编辑器插件预览，源码始终保留。
 */

import { useMemo } from "react";
import { Sigma } from "lucide-react";
import { Editor } from "@tau/editor";
import type { Descendant } from "slate";
import { Button } from "@tau/ui";
import { createDesktopKit } from "@/services/editorKit";
import { openPage } from "@/services/page-navigation";
import { defineBlockRenderer, type BlockPreviewProps } from "@/types/block-preview";
import { ZoomSurface } from "@/features/previews/components/ZoomSurface";

function TikzPreview({ block }: BlockPreviewProps) {
  const kit = createDesktopKit();
  const value = useMemo(
    () =>
      [
        { type: "tikz", content: block.content, children: [{ type: "formatted", text: "" }] },
      ] as unknown as Descendant[],
    [block.content]
  );
  if (!kit.elementTypes.includes("tikz"))
    return (
      <div className="space-y-4 p-6">
        <p className="text-ink-2">安装并启用 TikZ 绘图插件，重启后即可预览。源码已保留。</p>
        <Button variant="secondary" onClick={() => openPage("plugins", { tab: "discover" })}>
          打开插件中心
        </Button>
        <pre className="font-tau-mono text-tau-body overflow-auto">
          <code>{block.content}</code>
        </pre>
      </div>
    );
  return (
    <ZoomSurface>
      <Editor key={block.content} kit={kit} initValue={value} readonly />
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
