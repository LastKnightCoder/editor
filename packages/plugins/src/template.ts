import { readPluginIdentity } from "./package-fields.ts";
import { comparePluginVersions } from "./version.ts";
import { validatePluginManifest, type PluginManifest } from "./package.ts";
import { readCatalogFields, type PluginCatalogFields } from "./categories.ts";
import type { JsonValue } from "./json";
import { hasSkillScripts, readSkillFiles, readSkillsField } from "./skills.ts";
import {
  readPackageTargets,
  assertPackageTargetCompatibility,
  type PackagePlatform,
  type PackageTargets,
  type PackageTarget,
} from "./package-targets.ts";
import { validatePortableDistributionManifest, type PortablePluginManifest } from "./portable.ts";
export { hasSkillScripts, SKILL_README, SKILL_ROOT } from "./skills.ts";

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

/** 独立 Skill 包：没有代码入口，只分发 `skills/<id>/` 目录，安装后即可在 Skill 页使用。 */
interface SkillPackageBase extends PluginCatalogFields {
  formatVersion: 1;
  apiVersion: 1;
  id: string;
  name: string;
  version: string;
  skills: readonly string[];
  integrity: Record<string, string>;
}
export interface DesktopSkillPackageManifest extends SkillPackageBase {
  platform: "desktop";
  minAppVersion?: string;
}
export interface PortableSkillPackageManifest extends SkillPackageBase {
  platform: "portable";
  targets: PackageTargets;
  minAppVersion?: never;
}
export type SkillPackageManifest = DesktopSkillPackageManifest | PortableSkillPackageManifest;

export type DistributionManifest = PluginManifest | TemplateManifest | SkillPackageManifest;
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

const SITE_FIELD_TYPES = new Set(["text", "textarea", "url", "select", "switch"]);

const optionalText = (value: unknown, name: string) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`站点字段${name}无效`);
  return value;
};
const requiredText = (value: unknown, name: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`站点字段${name}无效`);
  return value;
};

function readSiteFields(value: unknown): TemplateSiteField[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("站点字段必须是数组");
  const keys = new Set<string>();
  const fields = value.map((raw): TemplateSiteField => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("站点字段无效");
    const item = raw as Record<string, unknown>;
    if (typeof item.key !== "string" || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(item.key))
      throw new Error("站点字段 key 只能由字母、数字和下划线组成，且以字母开头");
    if (keys.has(item.key)) throw new Error(`站点字段 key 重复：${item.key}`);
    keys.add(item.key);
    if (typeof item.type !== "string" || !SITE_FIELD_TYPES.has(item.type))
      throw new Error(`站点字段类型不支持：${String(item.type)}`);
    const base = {
      key: item.key,
      label: requiredText(item.label, "名称"),
      ...(item.description === undefined
        ? {}
        : { description: optionalText(item.description, "说明") }),
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
    const fallback = optionalText(item.default, "默认值");
    if (item.type === "select") {
      if (!Array.isArray(item.options) || !item.options.length) throw new Error("下拉字段选项无效");
      const options = item.options.map(option => {
        const entry = (option ?? {}) as Record<string, unknown>;
        return Object.freeze({
          value: requiredText(entry.value, "选项值"),
          label: requiredText(entry.label, "选项名称"),
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
    const placeholder = optionalText(item.placeholder, "占位文字");
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
      (field.type !== "select" || field.options.some(option => option.value === value));
    result[field.key] = valid
      ? value
      : (field.default ?? (field.type === "select" ? field.options[0].value : ""));
  }
  return result;
}

export function isTemplateManifest(value: unknown): value is TemplateManifest {
  return !!value && typeof value === "object" && !Array.isArray(value) && "template" in value;
}

export function isSkillPackageManifest(value: unknown): value is SkillPackageManifest {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "formatVersion" in value &&
    value.formatVersion === 1 &&
    "apiVersion" in value &&
    value.apiVersion === 1 &&
    "platform" in value &&
    (value.platform === "desktop" || value.platform === "portable") &&
    "skills" in value &&
    Array.isArray(value.skills) &&
    value.skills.length > 0 &&
    !("template" in value) &&
    !("main" in value)
  );
}

/** 模板与 Skill 包共用的身份字段校验。 */
function readStaticIdentity(item: Record<string, unknown>) {
  const identity = readPluginIdentity(item);
  if (item.minAppVersion !== undefined) {
    if (typeof item.minAppVersion !== "string") throw new Error("最低客户端版本无效");
    comparePluginVersions(item.minAppVersion, item.minAppVersion);
  }
  return {
    ...identity,
    ...(typeof item.minAppVersion === "string" ? { minAppVersion: item.minAppVersion } : {}),
  };
}

export function validateSkillPackageManifest(value: unknown): SkillPackageManifest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Skill 包清单必须是对象");
  const item = value as Record<string, unknown>;
  if (
    item.formatVersion !== 1 ||
    item.apiVersion !== 1 ||
    !["desktop", "portable"].includes(String(item.platform))
  )
    throw new Error("Skill 包格式、API 版本或平台不兼容");
  const codeFields =
    item.platform === "portable"
      ? ["main", "format", "profile", "styles", "backend", "template"]
      : ["main", "template"];
  if (codeFields.some(field => Object.hasOwn(item, field)))
    throw new Error("独立 Skill 包不能包含代码入口或模板字段");
  const skills = readSkillsField(item.skills);
  if (!skills) throw new Error("Skill 包至少声明一个 Skill");
  if (!item.integrity || typeof item.integrity !== "object" || Array.isArray(item.integrity))
    throw new Error("Skill 包缺少摘要清单");
  const integrity = readSkillFiles(skills, item.integrity as Record<string, unknown>);
  if (Object.keys(integrity).length !== Object.keys(item.integrity).length)
    throw new Error("Skill 包只能包含已声明 Skill 目录内的文件");
  const common = {
    formatVersion: 1 as const,
    apiVersion: 1 as const,
    ...readPluginIdentity(item),
    ...readCatalogFields(item),
    skills,
    integrity: Object.freeze(integrity),
  };
  return item.platform === "portable"
    ? Object.freeze({
        ...common,
        platform: "portable" as const,
        targets: readPackageTargets(item.targets),
      })
    : Object.freeze({ ...common, ...readStaticIdentity(item), platform: "desktop" as const });
}

export function validatePortableSkillPackageManifest(value: unknown): PortableSkillPackageManifest {
  const manifest = validateSkillPackageManifest(value);
  if (manifest.platform !== "portable") throw new Error("Skill 包未声明跨端目标平台");
  return manifest;
}

export type DistributionPackageKind = "plugin" | "skills" | "template";
export function distributionPackageKind(
  manifest: DistributionManifest | PortablePluginManifest
): DistributionPackageKind {
  if (isSkillPackageManifest(manifest)) return "skills";
  if (isTemplateManifest(manifest)) return "template";
  return "plugin";
}

export function assertSkillPackageCompatibility(
  manifest: SkillPackageManifest,
  host: { platform: PackagePlatform; appVersion: string }
): PackageTarget {
  if (manifest.platform === "portable")
    return assertPackageTargetCompatibility(manifest.targets, host);
  if (host.platform !== "desktop") throw new Error("桌面 Skill 包不支持当前平台");
  if (manifest.minAppVersion)
    return assertPackageTargetCompatibility(
      { desktop: { minAppVersion: manifest.minAppVersion } },
      host
    );
  comparePluginVersions(host.appVersion, host.appVersion);
  return { minAppVersion: "0.0.0" };
}

export function validateMobilePackageManifest(
  value: unknown,
  host?: { platform: "android" | "ios"; appVersion: string }
): PortablePluginManifest | PortableSkillPackageManifest {
  if (
    value &&
    typeof value === "object" &&
    "skills" in value &&
    !("main" in value) &&
    !("template" in value)
  ) {
    const manifest = validatePortableSkillPackageManifest(value);
    if (host) assertSkillPackageCompatibility(manifest, host);
    return manifest;
  }
  const manifest = validatePortableDistributionManifest(value);
  if (host) assertPackageTargetCompatibility(manifest.targets, host);
  return manifest;
}

export function validateDistributionManifest(value: unknown): DistributionManifest {
  if (
    value &&
    typeof value === "object" &&
    "skills" in value &&
    !("template" in value) &&
    !("main" in value)
  )
    return validateSkillPackageManifest(value as Record<string, unknown>);
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
  const identity = readStaticIdentity(item);
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
  const catalog = readCatalogFields(item);
  return Object.freeze({
    formatVersion: 1 as const,
    apiVersion: 1 as const,
    platform: "desktop" as const,
    ...identity,
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

/** 能在用户本机执行代码的版本（本机后台、带脚本的 Skill）必须经人工系统审核才能发布与安装。 */
export function requiresSystemReview(manifest: {
  backend?: unknown;
  skills?: readonly string[];
  integrity?: Record<string, string>;
}): boolean {
  if (manifest.backend) return true;
  return hasSkillScripts({ skills: manifest.skills, integrity: manifest.integrity ?? {} });
}

export function distributionFiles(manifest: DistributionManifest): string[] {
  return Object.keys(manifest.integrity);
}
