import { comparePluginVersions } from "@tau/plugins/package";
import type { PackageManifest, ReleaseSummary } from "../../../../contracts";

/** 比当前版本低的最高已发布版本：审核对比的基线 */
export function previousRelease(
  releases: ReleaseSummary[] | undefined,
  version: string
): ReleaseSummary | null {
  let best: ReleaseSummary | null = null;
  for (const release of releases ?? []) {
    if (comparePluginVersions(release.version, version) >= 0) continue;
    if (!best || comparePluginVersions(release.version, best.version) > 0) best = release;
  }
  return best;
}

/** 已发布版本里是否已有不低于当前的版本（同版本号不能再发布） */
export function blockingRelease(
  releases: ReleaseSummary[] | undefined,
  version: string
): ReleaseSummary | null {
  return (
    (releases ?? []).find(release => comparePluginVersions(release.version, version) >= 0) ?? null
  );
}

export interface FileChange {
  path: string;
  change: "added" | "removed" | "modified";
}

/** 按完整性清单比较两版的文件：摘要不同即视为修改 */
export function diffFiles(before: PackageManifest, after: PackageManifest): FileChange[] {
  const changes: FileChange[] = [];
  for (const [path, hash] of Object.entries(after.integrity)) {
    const old = before.integrity[path];
    if (old === undefined) changes.push({ path, change: "added" });
    else if (old !== hash) changes.push({ path, change: "modified" });
  }
  for (const path of Object.keys(before.integrity))
    if (!(path in after.integrity)) changes.push({ path, change: "removed" });
  const order = { modified: 0, added: 1, removed: 2 };
  return changes.sort((a, b) => order[a.change] - order[b.change] || a.path.localeCompare(b.path));
}

const FIELDS: { key: keyof PackageManifest; label: string }[] = [
  { key: "name", label: "名称" },
  { key: "description", label: "简介" },
  { key: "minAppVersion", label: "最低 Tau" },
  { key: "main", label: "入口" },
  { key: "styles", label: "样式" },
];

export function diffManifest(before: PackageManifest, after: PackageManifest) {
  return FIELDS.filter(field => before[field.key] !== after[field.key]).map(field => ({
    label: field.label,
    before: String(before[field.key] ?? "—"),
    after: String(after[field.key] ?? "—"),
  }));
}
