import { assertLocalId } from "./ids.ts";
import { comparePluginVersions } from "./version.ts";
import { readCatalogFields } from "./categories.ts";
import { readPermissionsField } from "./permissions.ts";
import { readSkillFiles, readSkillsField } from "./skills.ts";

export function readPluginIdentity(item: Record<string, unknown>) {
  const { id, name, version } = item;
  if (typeof id !== "string") throw new Error("插件 ID 无效");
  assertLocalId(id);
  if (typeof name !== "string" || !name.trim() || typeof version !== "string")
    throw new Error("插件名称或版本无效");
  comparePluginVersions(version, version);
  return { id, name, version };
}

export function readPluginMetadata(item: Record<string, unknown>) {
  return { ...readPluginIdentity(item), ...readCatalogFields(item), ...readPermissionsField(item) };
}

export function readPluginFilePath(input: unknown, extension: string): string {
  if (
    typeof input !== "string" ||
    !/^[\w./-]+$/.test(input) ||
    input.split("/").some(part => !part || part === "." || part === "..") ||
    !input.endsWith(extension)
  )
    throw new Error("插件入口或样式路径无效");
  return input;
}

export function readPluginFiles(item: Record<string, unknown>, entries: readonly string[]) {
  if (!item.integrity || typeof item.integrity !== "object" || Array.isArray(item.integrity))
    throw new Error("插件产物缺少完整性摘要清单");
  const source = item.integrity as Record<string, unknown>;
  const integrity: Record<string, string> = {};
  for (const name of entries) {
    const hash = source[name];
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
      throw new Error("插件产物缺少有效的完整性摘要");
    integrity[name] = hash;
  }
  const skills = readSkillsField(item.skills);
  Object.assign(integrity, readSkillFiles(skills, source));
  return {
    ...(skills ? { skills } : {}),
    integrity: Object.freeze(integrity),
  };
}
