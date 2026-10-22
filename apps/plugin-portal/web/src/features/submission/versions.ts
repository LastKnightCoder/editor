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

// 模板与代码插件的清单字段不同，按字段名读取，缺失即显示为空。
const FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "名称" },
  { key: "description", label: "简介" },
  { key: "minAppVersion", label: "最低 Tau" },
  { key: "main", label: "入口" },
  { key: "styles", label: "样式" },
];

const field = (manifest: PackageManifest, key: string) =>
  (manifest as unknown as Record<string, unknown>)[key];

export function diffManifest(before: PackageManifest, after: PackageManifest) {
  const changes = FIELDS.filter(item => field(before, item.key) !== field(after, item.key)).map(
    item => ({
      label: item.label,
      before: String(field(before, item.key) ?? "—"),
      after: String(field(after, item.key) ?? "—"),
    })
  );
  const skillsOf = (manifest: PackageManifest) =>
    ("skills" in manifest && manifest.skills?.join("、")) || "—";
  if (skillsOf(before) !== skillsOf(after))
    changes.push({ label: "Skill", before: skillsOf(before), after: skillsOf(after) });
  const previous = "backend" in before ? before.backend : undefined;
  const next = "backend" in after ? after.backend : undefined;
  for (const [key, label] of [
    ["entry", "后台入口"],
    ["activation", "启动时机"],
    ["scope", "后台范围"],
    ["lifetime", "常驻策略"],
    ["systemAccess", "系统用途"],
    ["tools", "外部程序"],
    ["reason", "后台说明"],
  ] as const) {
    if (JSON.stringify(previous?.[key]) !== JSON.stringify(next?.[key]))
      changes.push({
        label,
        before: JSON.stringify(previous?.[key]) ?? "未声明",
        after: JSON.stringify(next?.[key]) ?? "未声明",
      });
  }
  return changes;
}
