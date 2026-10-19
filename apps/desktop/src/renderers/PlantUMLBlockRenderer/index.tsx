/**
 * PlantUML 块（D-057）：图源经 plantuml.com 渲染（本地渲染需 Java / 自建服务，不做），
 * 头部注明外发；离线或服务不可达时给明确错误态。预览可缩放平移。
 */

import { useState } from "react";
import { GitFork, WifiOff } from "lucide-react";
import { buildPlantumlSvgUrl, applyDarkTheme } from "@tau/editor/extensions/diagram/plantuml";
import useTheme from "@/hooks/useTheme";
import { defineBlockRenderer, type BlockPreviewProps } from "@/types/block-preview";
import { ZoomSurface } from "@/features/previews/components/ZoomSurface";

function PlantUMLPreview({ block }: BlockPreviewProps) {
  const { isDark } = useTheme();
  const url = buildPlantumlSvgUrl(
    isDark ? applyDarkTheme(block.content, "cyborg-outline") : block.content
  );
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (failedUrl === url)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
        <WifiOff size={26} strokeWidth={1.5} className="text-ink-3 mb-2" />
        <p className="text-ink-1 text-[15px] font-semibold">无法连接 PlantUML 渲染服务</p>
        <p className="text-tau-sm text-ink-2">
          图由 plantuml.com 在线渲染，请检查网络后重试，或先查看源码。
        </p>
      </div>
    );

  return (
    <ZoomSurface>
      {url && (
        <img
          src={url}
          alt={block.metadata.title || "PlantUML"}
          draggable={false}
          onError={() => setFailedUrl(url)}
          className="max-w-full select-none"
        />
      )}
    </ZoomSurface>
  );
}

export default defineBlockRenderer({
  type: "plantuml",
  label: "PlantUML",
  icon: GitFork,
  surface: "canvas",
  note: "由 plantuml.com 渲染",
  title: content => /^\s*title\s+(.+)$/im.exec(content)?.[1]?.trim(),
  Preview: PlantUMLPreview,
});
