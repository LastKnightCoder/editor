import { assertLocalId } from "./ids";
import { comparePluginVersions } from "./version";
import { validatePluginManifest, type PluginManifest } from "./package";

export interface TemplateManifest {
  formatVersion: 1;
  apiVersion: 1;
  platform: "desktop";
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  template: { protocolVersion: 1; root: string; entries: string[] };
  integrity: Record<string, string>;
}

export type DistributionManifest = PluginManifest | TemplateManifest;
export const DISTRIBUTION_LIMITS = {
  zipBytes: 16 * 1024 * 1024,
  expandedBytes: 32 * 1024 * 1024,
  entries: 512,
} as const;

/** 包文件路径只约束文件系统边界，不约束模板的公开 URL。 */
export function assertPackagePath(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    /[\\:%?#\u0000-\u001f]/.test(value) ||
    value.split("/").some(part => !part || part === "." || part === "..")
  )
    throw new Error("插件资源路径无效");
}

export function assertPublishPath(value: unknown): asserts value is string {
  assertPackagePath(value);
  if (value.split("/").some(part => part.toLowerCase() === ".git"))
    throw new Error("发布文件不能覆盖 Git 元数据");
}

export function isTemplateManifest(value: DistributionManifest): value is TemplateManifest {
  return "template" in value;
}

export function validateDistributionManifest(value: unknown): DistributionManifest {
  if (!value || typeof value !== "object" || !("template" in value))
    return validatePluginManifest(value);
  const item = value as Record<string, unknown>;
  const template = item.template as Record<string, unknown> | null;
  if (
    item.formatVersion !== 1 ||
    item.apiVersion !== 1 ||
    item.platform !== "desktop" ||
    !template ||
    template.protocolVersion !== 1
  )
    throw new Error("模板协议版本不兼容");
  if (typeof item.id !== "string") throw new Error("插件 ID 无效");
  assertLocalId(item.id);
  if (typeof item.name !== "string" || !item.name.trim() || typeof item.version !== "string")
    throw new Error("插件名称或版本无效");
  comparePluginVersions(item.version, item.version);
  if (item.minAppVersion !== undefined) {
    if (typeof item.minAppVersion !== "string") throw new Error("最低客户端版本无效");
    comparePluginVersions(item.minAppVersion, item.minAppVersion);
  }
  assertPackagePath(template.root);
  if (
    !Array.isArray(template.entries) ||
    !template.entries.length ||
    new Set(template.entries).size !== template.entries.length
  )
    throw new Error("模板入口无效");
  const entries = template.entries.map(entry => {
    assertPackagePath(entry);
    if (!entry.endsWith(".html")) throw new Error("模板入口必须是已有 HTML");
    return entry;
  });
  if (!item.integrity || typeof item.integrity !== "object" || Array.isArray(item.integrity))
    throw new Error("模板资源缺少摘要清单");
  const executable =
    item.main !== undefined ||
    item.format !== undefined ||
    item.styles !== undefined ||
    item.editor !== undefined ||
    item.whiteboard !== undefined;
  const codeManifest = executable ? validatePluginManifest(item) : undefined;
  const integrity: Record<string, string> = Object.create(null);
  for (const [name, digest] of Object.entries(item.integrity)) {
    assertPackagePath(name);
    if (name.startsWith(template.root + "/"))
      assertPublishPath(name.slice(template.root.length + 1));
    if (
      !(
        name.startsWith(template.root + "/") ||
        (codeManifest && [codeManifest.main, codeManifest.styles].includes(name))
      ) ||
      typeof digest !== "string" ||
      !/^[a-f0-9]{64}$/.test(digest)
    )
      throw new Error("模板资产路径或摘要无效");
    integrity[name] = digest;
  }
  for (const entry of entries)
    if (!integrity[template.root + "/" + entry]) throw new Error("模板入口未包含在摘要清单");
  // 混合代码能力继续遵守现有代码包协议，不能借静态模板绕过校验。
  if (codeManifest) Object.assign(integrity, codeManifest.integrity);
  if (item.sync !== undefined) throw new Error("Node同步入口已停用，请更新插件");
  return Object.freeze({
    ...codeManifest,
    formatVersion: 1 as const,
    apiVersion: 1 as const,
    platform: "desktop" as const,
    id: item.id,
    name: item.name,
    version: item.version,
    ...(typeof item.minAppVersion === "string" ? { minAppVersion: item.minAppVersion } : {}),
    template: Object.freeze({
      protocolVersion: 1 as const,
      root: template.root,
      entries: Object.freeze(entries) as unknown as string[],
    }),
    integrity: Object.freeze(integrity),
  });
}

export function distributionFiles(manifest: DistributionManifest): string[] {
  return Object.keys(manifest.integrity);
}
