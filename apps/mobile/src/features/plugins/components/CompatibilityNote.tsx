import { pluginTranslator, usePluginI18n } from "../i18n";
import { CircleCheck, Info } from "lucide-react";
import type { CenterCompatibility } from "@tau/plugins/center";
import { cn } from "@tau/ui";
import { reasonLabel } from "./pluginStatus";
const t = pluginTranslator.t;

/** 此设备能否使用的一句话结论：结论来自选版结果，原始能力 ID 不外露。 */
export function CompatibilityNote({
  latestVersion,
  compatibleVersion,
  compatibility,
}: {
  latestVersion: string;
  compatibleVersion: string | null;
  compatibility: CenterCompatibility;
}) {
  usePluginI18n();
  if (compatibility.status === "unchecked") return null;
  const warn = !compatibleVersion;
  const lines = !compatibleVersion
    ? compatibility.reasons.map(reasonLabel)
    : [
        t("compatibility.full"),
        ...(compatibleVersion !== latestVersion
          ? [t("compatibility.version", { version: compatibleVersion })]
          : []),
      ];
  if (!lines.length) return null;
  const Icon = warn ? Info : CircleCheck;
  return (
    <div
      aria-label={!compatibleVersion ? t("compatibility.blockers") : t("compatibility.label")}
      className={cn(
        "flex items-start gap-2 rounded-xl px-3 py-2 text-[12.5px] leading-relaxed",
        warn ? "bg-warn-soft text-ink-1" : "bg-surface text-ok"
      )}
    >
      <Icon size={15} className={cn("mt-0.5 shrink-0", warn && "text-warn")} aria-hidden />
      <ul className="flex min-w-0 flex-col">
        {lines.map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
