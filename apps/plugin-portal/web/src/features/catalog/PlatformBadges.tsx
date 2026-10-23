import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@tau/ui";
import type { CenterVersion } from "../../../../contracts";
import { PLATFORM_LABELS, PORTABLE_PLATFORMS } from "./platforms";

const ICONS = { desktop: Monitor, android: Smartphone, ios: Smartphone } as const;

/** 版本声明的平台标识；旧格式包只投影为桌面并额外标注。 */
export function PlatformBadges({
  version,
  className,
}: {
  version: Pick<CenterVersion, "targets" | "formatVersion">;
  className?: string;
}) {
  const ordered = PORTABLE_PLATFORMS.filter(platform => version.targets[platform]);
  if (!ordered.length) return null;
  const legacy = version.formatVersion !== 3;
  const names = ordered.map(platform => PLATFORM_LABELS[platform]).join("、");
  return (
    <ul
      aria-label={`支持平台：${names}${legacy ? "（旧格式）" : ""}`}
      className={cn("text-tau-micro text-ink-3 flex flex-wrap items-center gap-2", className)}
    >
      {ordered.map(platform => {
        const Icon = ICONS[platform];
        return (
          <li key={platform} className="inline-flex items-center gap-1">
            <Icon size={12} aria-hidden="true" />
            {PLATFORM_LABELS[platform]}
          </li>
        );
      })}
      {legacy && <li>旧格式</li>}
    </ul>
  );
}
