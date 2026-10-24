import { validatePluginManifest, comparePluginVersions, type PluginManifest } from "./package";
import type { PluginEnvironment } from "./environment";

export const PORTABLE_PLATFORMS = ["desktop", "android", "ios"] as const;
export type PortablePlatform = (typeof PORTABLE_PLATFORMS)[number];
export type PluginElementSupport = "none" | "render" | "edit";
export const PORTABLE_SHARED_MODULES = [
  "@tau/plugins",
  "@tau/plugins/whiteboard",
  "@tau/ui",
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
] as const;

export interface PortablePluginTarget {
  readonly minAppVersion: string;
}

export interface PortablePluginManifest extends Omit<
  PluginManifest,
  "formatVersion" | "platform" | "backend" | "minAppVersion" | "editor" | "whiteboard"
> {
  readonly formatVersion: 3;
  readonly platform: "portable";
  readonly profile: "web-v1";
  readonly description?: string;
  readonly targets: Readonly<Partial<Record<PortablePlatform, PortablePluginTarget>>>;
}

export type ReadablePortablePluginManifest = PortablePluginManifest;

export interface PluginAuthorTarget {
  readonly minAppVersion: string;
}

export interface PluginAuthorManifest extends Pick<
  PluginManifest,
  "id" | "name" | "version" | "categories" | "keywords" | "permissions"
> {
  readonly description?: string;
  readonly targets: Readonly<Partial<Record<PortablePlatform, PluginAuthorTarget>>>;
}

export interface PluginBuildOutput {
  readonly main: string;
  readonly styles?: string;
  readonly integrity: Readonly<Record<string, string>>;
  readonly skills?: readonly string[];
  readonly imports?: readonly string[];
}

function assertKeys(item: Record<string, unknown>, keys: readonly string[], label: string) {
  if (Object.keys(item).some(key => !keys.includes(key))) throw new Error(`${label}包含未知字段`);
}

/** 作者声明身份与支持平台，宿主功能通过统一 API 注册。 */
export function buildPortablePluginManifest(
  value: unknown,
  output: PluginBuildOutput
): PortablePluginManifest {
  const item = record(value, "作者清单");
  const files = record(output, "构建文件信息");
  assertKeys(files, ["main", "styles", "integrity", "skills", "imports"], "构建文件信息");
  const imports = files.imports ?? [];
  if (!Array.isArray(imports) || imports.some(name => !PORTABLE_SHARED_MODULES.includes(name)))
    throw new Error("构建模块依赖无效");
  const { imports: _imports, ...buildFiles } = files;
  assertKeys(
    item,
    ["id", "name", "version", "description", "categories", "keywords", "permissions", "targets"],
    "作者清单"
  );
  const targets = record(item.targets, "目标平台");
  const normalized = Object.fromEntries(
    Object.entries(targets).map(([platform, input]) => {
      const target = record(input, "平台配置");
      assertKeys(target, ["minAppVersion"], "平台配置");
      return [platform, { minAppVersion: target.minAppVersion }];
    })
  );
  const { targets: _targets, ...metadata } = item;
  return validatePortableDistributionManifest({
    ...metadata,
    formatVersion: 3,
    apiVersion: 1,
    platform: "portable",
    profile: "web-v1",
    format: "cjs",
    ...buildFiles,
    targets: normalized,
  });
}

export interface PortablePluginHost {
  readonly environment: PluginEnvironment;
  readonly appVersion: string;
  readonly profiles: readonly string[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    throw new Error(`${label}必须是普通对象`);
  return value as Record<string, unknown>;
}

/** 作者、中心和宿主读取同一份平台与版本契约。 */
export function validatePortablePluginManifest(value: unknown): PortablePluginManifest {
  return parsePortablePluginManifest(value);
}
export const readPortablePluginManifest = validatePortablePluginManifest;

/** 构建器与中心共用发行范围；不代表中心已开放批准发布。 */
export function validatePortableDistributionManifest(value: unknown): PortablePluginManifest {
  const manifest = validatePortablePluginManifest(value);
  if (/[-+]/.test(manifest.version)) throw new Error("正式跨端包版本不能含预发布或构建标识");
  if ((manifest.targets.android || manifest.targets.ios) && manifest.permissions?.length)
    throw new Error("移动端尚未接入业务数据授权，不能发布声明这些权限的移动目标");
  return manifest;
}

function parsePortablePluginManifest(value: unknown): PortablePluginManifest {
  const item = record(value, "跨端清单");
  const keys = new Set([
    "formatVersion",
    "apiVersion",
    "id",
    "name",
    "description",
    "version",
    "platform",
    "profile",
    "targets",
    "format",
    "main",
    "styles",
    "categories",
    "keywords",
    "permissions",
    "integrity",
    "skills",
  ]);
  if (Object.keys(item).some(key => !keys.has(key))) throw new Error("跨端清单包含未支持字段");
  if (item.formatVersion !== 3 || item.platform !== "portable" || item.profile !== "web-v1")
    throw new Error("跨端包格式或运行配置不兼容");
  if (
    item.description !== undefined &&
    (typeof item.description !== "string" ||
      !item.description.trim() ||
      item.description.length > 160)
  )
    throw new Error("插件简介必须为 1 至 160 字");
  // 复用身份、路径、摘要和分类校验；返回值仍保持独立的跨端协议。
  const base = validatePluginManifest(
    { ...item, formatVersion: 1, platform: "desktop" },
    { strict: true }
  );
  const rawTargets = record(item.targets, "目标平台");
  if (
    !Object.keys(rawTargets).length ||
    Object.keys(rawTargets).some(key => !PORTABLE_PLATFORMS.some(platform => platform === key))
  )
    throw new Error("目标平台为空或包含未知平台");
  const targets: Partial<Record<PortablePlatform, PortablePluginTarget>> = {};
  for (const platform of PORTABLE_PLATFORMS) {
    if (!Object.hasOwn(rawTargets, platform)) continue;
    const target = record(rawTargets[platform], "平台配置");
    assertKeys(target, ["minAppVersion"], "平台配置");
    if (typeof target.minAppVersion !== "string") throw new Error("平台缺少最低客户端版本");
    comparePluginVersions(target.minAppVersion, target.minAppVersion);
    targets[platform] = Object.freeze({ minAppVersion: target.minAppVersion });
  }
  const files = record(item.integrity, "文件摘要");
  if (Object.keys(files).some(file => !Object.hasOwn(base.integrity, file)))
    throw new Error("跨端包包含未声明文件");
  for (const file of Object.keys(files)) {
    if (file === base.main || file === base.styles) continue;
    if (!file.endsWith(".md") || file.split("/").includes("scripts") || file.includes("\\"))
      throw new Error("跨端 Skill 仅支持纯 Markdown 文档，不支持脚本或附件");
  }
  return Object.freeze({
    ...base,
    formatVersion: 3 as const,
    platform: "portable" as const,
    profile: "web-v1" as const,
    ...(typeof item.description === "string" ? { description: item.description } : {}),
    targets: Object.freeze(targets),
  });
}

export function assertPortablePluginCompatibility(
  manifest: ReadablePortablePluginManifest,
  host: PortablePluginHost
): PortablePluginTarget {
  if (!host.profiles.includes(manifest.profile)) throw new Error("宿主未接入跨端运行配置");
  const platform = host.environment.platform;
  if (!PORTABLE_PLATFORMS.some(value => value === platform))
    throw new Error("当前平台不能激活跨端应用插件");
  const target = manifest.targets[platform as PortablePlatform];
  if (!target) throw new Error("插件不支持当前平台");
  if ((platform === "android" || platform === "ios") && manifest.permissions?.length)
    throw new Error("移动宿主尚未接入业务数据授权");
  if (comparePluginVersions(host.appVersion, target.minAppVersion) < 0)
    throw new Error("客户端版本低于插件要求");
  return target;
}
