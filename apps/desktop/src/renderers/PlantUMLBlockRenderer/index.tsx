/**
 * PlantUML 块：图源经 plantuml.com 渲染（本地渲染需 Java / 自建服务，不做），
 * 头部注明外发；离线或服务不可达时给明确错误态。预览可缩放平移。
 */

import { useState } from "react";
import { GitFork, WifiOff } from "lucide-react";
import { buildPlantumlSvgUrl, applyDarkTheme } from "@tau/editor/extensions/diagram/plantuml";
import useTheme from "@/hooks/useTheme";
import { defineBlockRenderer, type BlockPreviewProps } from "@/types/block-preview";
import { ZoomSurface } from "@/features/previews/components/ZoomSurface";
import { useUmlI18n, umlMessages } from "./i18n";
import { desktopI18n } from "@/app/i18n/runtime";

function PlantUMLPreview({ block }: BlockPreviewProps) {
  const { isDark } = useTheme();
  const { t } = useUmlI18n();
  const url = buildPlantumlSvgUrl(
    isDark ? applyDarkTheme(block.content, "cyborg-outline") : block.content
  );
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (failedUrl === url)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
        <WifiOff size={26} strokeWidth={1.5} className="text-ink-3 mb-2" />
        <p className="text-ink-1 text-[15px] font-semibold">{t("connectFailed")}</p>
        <p className="text-tau-sm text-ink-2">{t("connectFailedHint")}</p>
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
  note: () => desktopI18n.get(umlMessages).t("serviceNote"),
  title: content => /^\s*title\s+(.+)$/im.exec(content)?.[1]?.trim(),
  Preview: PlantUMLPreview,
});
