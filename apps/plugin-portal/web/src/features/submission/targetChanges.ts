import type { CenterTarget, CenterTargets } from "@tau/plugins/center";
import {
  ELEMENT_SUPPORT,
  PORTABLE_PLATFORMS,
  capabilityLabel,
  type PortablePlatform,
} from "../catalog/platforms";

export interface PlatformChange {
  platform: PortablePlatform;
  kind: "added" | "removed" | "changed";
  lines: string[];
}

function listDelta(label: string, before: readonly string[], after: readonly string[]) {
  const added = after.filter(item => !before.includes(item)).map(capabilityLabel);
  const removed = before.filter(item => !after.includes(item)).map(capabilityLabel);
  return [
    ...(added.length ? [`${label}新增 ${added.join("、")}`] : []),
    ...(removed.length ? [`${label}移除 ${removed.join("、")}`] : []),
  ];
}

function targetDelta(before: CenterTarget, after: CenterTarget): string[] {
  const lines =
    before.minAppVersion === after.minAppVersion
      ? []
      : [`最低 Tau ${before.minAppVersion} → ${after.minAppVersion}`];
  lines.push(...listDelta("必需能力", before.required, after.required));
  lines.push(...listDelta("可选能力", before.optional, after.optional));
  const types = new Set([
    ...Object.keys(before.elements ?? {}),
    ...Object.keys(after.elements ?? {}),
  ]);
  for (const type of types) {
    const from = before.elements?.[type] ?? "none";
    const to = after.elements?.[type] ?? "none";
    if (from !== to)
      lines.push(`节点 ${type}：${ELEMENT_SUPPORT[from].label} → ${ELEMENT_SUPPORT[to].label}`);
  }
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
