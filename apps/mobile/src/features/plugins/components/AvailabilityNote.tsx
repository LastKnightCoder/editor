import type { CenterCompatibility } from "@tau/plugins/center";
import { reasonLabel } from "./pluginStatus";

/** 最新与可安装版本的差异、不可安装原因与可选能力降级；结论来自选版结果。 */
export function AvailabilityNote({
  latestVersion,
  compatibleVersion,
  compatibility,
}: {
  latestVersion: string;
  compatibleVersion: string | null;
  compatibility: CenterCompatibility;
}) {
  if (compatibility.status === "unchecked") return null;
  if (!compatibleVersion)
    return compatibility.reasons.length ? (
      <ul aria-label="不可安装原因" className="text-warn flex flex-col gap-0.5 text-[12px]">
        {compatibility.reasons.map(reason => (
          <li key={reasonLabel(reason)}>{reasonLabel(reason)}</li>
        ))}
      </ul>
    ) : null;
  return (
    <>
      {compatibleVersion !== latestVersion && (
        <p className="text-ink-3 text-[12px]">此设备可安装 v{compatibleVersion}</p>
      )}
      {compatibility.missingOptional.length > 0 && (
        <p className="text-ink-3 text-[12px]">
          部分功能在此设备不可用：{compatibility.missingOptional.join("、")}
        </p>
      )}
    </>
  );
}
