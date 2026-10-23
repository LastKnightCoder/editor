import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { CenterCompatibility, CenterVersion } from "../../../../contracts";
import { capabilityLabel, reasonLabel } from "./platforms";

/**
 * 最新版本与可安装版本的区分展示。兼容结论来自逻辑层；
 * 网页没有真实宿主时为 unchecked，只引导到应用内安装，不宣称当前设备可装。
 */
export function ReleaseAvailability({
  latest,
  compatible,
  compatibility,
}: {
  latest: Pick<CenterVersion, "version">;
  compatible: Pick<CenterVersion, "version"> | null;
  compatibility: CenterCompatibility;
}) {
  if (compatibility.status === "unchecked")
    return (
      <div role="note" className="text-tau-meta text-ink-2 flex gap-2 leading-[1.7]">
        <Info size={15} className="text-ink-3 mt-[3px] shrink-0" aria-hidden="true" />
        <p>
          网页无法确认你的设备能否安装。请在 Tau
          应用的插件中心安装，应用会按设备选出可用的最高版本。下载 ZIP 只是保存文件，不会装到手机。
        </p>
      </div>
    );
  if (compatibility.status === "compatible" && compatible)
    return (
      <div role="status" className="text-tau-meta flex flex-col gap-1">
        <p className="text-ok inline-flex items-center gap-1.5">
          <CircleCheck size={15} aria-hidden="true" />
          可安装 v{compatible.version}
        </p>
        {compatible.version !== latest.version && (
          <p className="text-ink-3">
            最新版本 v{latest.version} 暂不适用于此设备，安装时使用 v{compatible.version}。
          </p>
        )}
        {compatibility.missingOptional.length > 0 && (
          <p className="text-ink-3">
            部分功能不可用：{compatibility.missingOptional.map(capabilityLabel).join("、")}
          </p>
        )}
      </div>
    );
  return (
    <div role="status" className="text-tau-meta flex flex-col gap-1.5">
      <p className="text-warn inline-flex items-center gap-1.5">
        <CircleAlert size={15} aria-hidden="true" />
        没有可安装的版本
      </p>
      {compatibility.reasons.length > 0 && (
        <ul aria-label="不可安装原因" className="text-ink-2 flex list-disc flex-col gap-0.5 pl-5">
          {compatibility.reasons.map(reason => (
            <li key={reasonLabel(reason)}>{reasonLabel(reason)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
