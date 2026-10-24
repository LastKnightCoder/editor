import { CircleCheck, Info } from "lucide-react";
import type { CenterCompatibility } from "@tau/plugins/center";
import { cn } from "@tau/ui";
import { reasonLabel } from "./pluginStatus";

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
  if (compatibility.status === "unchecked") return null;
  const warn = !compatibleVersion;
  const lines = !compatibleVersion
    ? compatibility.reasons.map(reasonLabel)
    : [
        "可在此设备完整使用",
        ...(compatibleVersion !== latestVersion ? [`此设备可安装 v${compatibleVersion}`] : []),
      ];
  if (!lines.length) return null;
  const Icon = warn ? Info : CircleCheck;
  return (
    <div
      aria-label={!compatibleVersion ? "不可安装原因" : "兼容性"}
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
