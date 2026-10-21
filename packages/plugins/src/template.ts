import { assertLocalId } from "./ids";
import { comparePluginVersions } from "./version";
import { validatePluginManifest, type PluginManifest } from "./package";
import { readCatalogFields, type PluginCatalogFields } from "./categories.ts";
import type { JsonValue } from "./json";

interface SiteFieldBase {
  /** 模板从 `site.fields[key]` 读取 */
  key: string;
  label: string;
  description?: string;
}
/** 模板声明的站点字段，宿主据此渲染「博客模板」设置并在发布时按声明解析取值。 */
export type TemplateSiteField =
  | (SiteFieldBase & {
      type: "text" | "textarea" | "url";
      placeholder?: string;
      default?: string;
    })
  | (SiteFieldBase & {
      type: "select";
      options: { value: string; label: string }[];
      default?: string;
    })
  | (SiteFieldBase & { type: "switch"; default?: boolean });
export type SiteFieldValue = string | boolean;

export interface TemplateManifest extends PluginCatalogFields {
  formatVersion: 1;
  apiVersion: 1;
  platform: "desktop";
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  template: {
    protocolVersion: 1;
    root: string;
    entries: string[];
    siteFields?: TemplateSiteField[];
  };
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

export const SITE_FIELD_LIMITS = {
  fields: 32,
  options: 50,
  label: 40,
  description: 160,
  value: 2000,
} as const;
const SITE_FIELD_TYPES = new Set(["text", "textarea", "url", "select", "switch"]);

const optionalText = (value: unknown, limit: number, name: string) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > limit) throw new Error(`站点字段${name}无效`);
  return value;
};
const requiredText = (value: unknown, limit: number, name: string) => {
  if (typeof value !== "string" || !value.trim() || value.length > limit)
    throw new Error(`站点字段${name}无效`);
  return value;
};

function readSiteFields(value: unknown): TemplateSiteField[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > SITE_FIELD_LIMITS.fields)
    throw new Error(`站点字段最多声明 ${SITE_FIELD_LIMITS.fields} 个`);
  const keys = new Set<string>();
  const fields = value.map((raw): TemplateSiteField => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("站点字段无效");
    const item = raw as Record<string, unknown>;
    if (typeof item.key !== "string" || !/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(item.key))
      throw new Error("站点字段 key 只能由字母、数字和下划线组成，且以字母开头");
    if (keys.has(item.key)) throw new Error(`站点字段 key 重复：${item.key}`);
    keys.add(item.key);
    if (typeof item.type !== "string" || !SITE_FIELD_TYPES.has(item.type))
      throw new Error(`站点字段类型不支持：${String(item.type)}`);
    const base = {
      key: item.key,
      label: requiredText(item.label, SITE_FIELD_LIMITS.label, "名称"),
      ...(item.description === undefined
        ? {}
        : { description: optionalText(item.description, SITE_FIELD_LIMITS.description, "说明") }),
    };
    if (item.type === "switch") {
      if (item.default !== undefined && typeof item.default !== "boolean")
        throw new Error("开关字段默认值必须是布尔值");
      return Object.freeze({
        ...base,
        type: "switch",
        ...(item.default === undefined ? {} : { default: item.default }),
      });
    }
    const fallback = optionalText(item.default, SITE_FIELD_LIMITS.value, "默认值");
    if (item.type === "select") {
      if (
        !Array.isArray(item.options) ||
        !item.options.length ||
        item.options.length > SITE_FIELD_LIMITS.options
      )
        throw new Error("下拉字段选项无效");
      const options = item.options.map(option => {
        const entry = (option ?? {}) as Record<string, unknown>;
        return Object.freeze({
          value: requiredText(entry.value, SITE_FIELD_LIMITS.value, "选项值"),
          label: requiredText(entry.label, SITE_FIELD_LIMITS.label, "选项名称"),
        });
      });
      if (new Set(options.map(option => option.value)).size !== options.length)
        throw new Error("下拉字段选项值重复");
      if (fallback !== undefined && !options.some(option => option.value === fallback))
        throw new Error("下拉字段默认值不在选项中");
      return Object.freeze({
        ...base,
        type: "select",
        options: Object.freeze(options) as unknown as { value: string; label: string }[],
        ...(fallback === undefined ? {} : { default: fallback }),
      });
    }
    const placeholder = optionalText(item.placeholder, SITE_FIELD_LIMITS.label * 2, "占位文字");
    return Object.freeze({
      ...base,
      type: item.type as "text" | "textarea" | "url",
      ...(placeholder === undefined ? {} : { placeholder }),
      ...(fallback === undefined ? {} : { default: fallback }),
    });
  });
  return Object.freeze(fields) as unknown as TemplateSiteField[];
}

/** 按模板声明解析站点字段：只输出声明过的 key，类型不符或越界的存量值回落到默认值。 */
export function resolveSiteFields(
  fields: readonly TemplateSiteField[] | undefined,
  values: Record<string, JsonValue> | undefined
): Record<string, SiteFieldValue> {
  const result: Record<string, SiteFieldValue> = {};
  for (const field of fields ?? []) {
    const value = values?.[field.key];
    if (field.type === "switch") {
      result[field.key] = typeof value === "boolean" ? value : (field.default ?? false);
      continue;
    }
    const valid =
      typeof value === "string" &&
      value.length <= SITE_FIELD_LIMITS.value &&
      (field.type !== "select" || field.options.some(option => option.value === value));
    result[field.key] = valid
      ? value
      : (field.default ?? (field.type === "select" ? field.options[0].value : ""));
  }
  return result;
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
  if (["main", "format", "styles", "editor", "whiteboard", "backend"].some(key => key in item))
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
  const siteFields = readSiteFields(template.siteFields);
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
      ...(siteFields ? { siteFields } : {}),
    }),
    integrity: Object.freeze(integrity),
  });
}

export function distributionFiles(manifest: DistributionManifest): string[] {
  return Object.keys(manifest.integrity);
}
