import { assertLocalId } from "./ids";
import { comparePluginVersions } from "./version";
import { validatePluginManifest, type PluginManifest } from "./package";
import { readCatalogFields, type PluginCatalogFields } from "./categories.ts";

export interface TemplateManifest extends PluginCatalogFields {
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
    /[\\:%?#]/.test(value) ||
    [...value].some(char => char.charCodeAt(0) < 0x20) ||
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

export function validateDistributionManifest(
  value: unknown,
  options: { strict?: boolean } = {}
): DistributionManifest {
  if (!value || typeof value !== "object" || !("template" in value))
    return validatePluginManifest(value, options);
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
  if (["main", "format", "styles", "editor", "whiteboard", "sync"].some(key => key in item))
    throw new Error("模板包只包含静态站点产物，不能同时声明代码插件入口");
  const integrity: Record<string, string> = Object.create(null);
  for (const [name, digest] of Object.entries(item.integrity)) {
    assertPackagePath(name);
    if (
      !name.startsWith(template.root + "/") ||
      typeof digest !== "string" ||
      !/^[a-f0-9]{64}$/.test(digest)
    )
      throw new Error("模板资产路径或摘要无效");
    assertPublishPath(name.slice(template.root.length + 1));
    integrity[name] = digest;
  }
  for (const entry of entries)
    if (!integrity[template.root + "/" + entry]) throw new Error("模板入口未包含在摘要清单");
  const catalog = readCatalogFields(item, options.strict === true);
  return Object.freeze({
    formatVersion: 1 as const,
    apiVersion: 1 as const,
    platform: "desktop" as const,
    id: item.id,
    name: item.name,
    version: item.version,
    ...(typeof item.minAppVersion === "string" ? { minAppVersion: item.minAppVersion } : {}),
    ...catalog,
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
