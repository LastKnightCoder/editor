import type { CenterTarget, CenterTargets } from "@tau/plugins/center";
import { PORTABLE_PLATFORMS, type PortablePlatform } from "../catalog/platforms";

export interface PlatformChange {
  platform: PortablePlatform;
  kind: "added" | "removed" | "changed";
  lines: string[];
}

function targetDelta(before: CenterTarget, after: CenterTarget): string[] {
  const lines =
    before.minAppVersion === after.minAppVersion
      ? []
      : [`最低 Tau ${before.minAppVersion} → ${after.minAppVersion}`];
  return lines;
}

/** 两个版本目标声明的展示差异，只做比对，不判定是否允许发布。 */
export function diffTargets(previous: CenterTargets, current: CenterTargets): PlatformChange[] {
  return PORTABLE_PLATFORMS.flatMap((platform): PlatformChange[] => {
    const before = previous[platform];
    const after = current[platform];
    if (!after) return before ? [{ platform, kind: "removed", lines: [] }] : [];
    if (!before) return [{ platform, kind: "added", lines: [`最低 Tau ${after.minAppVersion}`] }];
    const lines = targetDelta(before, after);
    return lines.length ? [{ platform, kind: "changed", lines }] : [];
  });
}
