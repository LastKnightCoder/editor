import { comparePluginVersions, type PluginManifest } from "./package.ts";
import { readPluginMetadata, readPluginFilePath, readPluginFiles } from "./package-fields.ts";
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
}

/** 作者声明身份与支持平台，宿主功能通过统一 API 注册。 */
export function buildPortablePluginManifest(
  value: unknown,
  output: PluginBuildOutput
): PortablePluginManifest {
  const item = record(value, "作者清单");
  const files = record(output, "构建文件信息");
  return validatePortableDistributionManifest({
    id: item.id,
    name: item.name,
    version: item.version,
    description: item.description,
    categories: item.categories,
    keywords: item.keywords,
    permissions: item.permissions,
    formatVersion: 3,
    apiVersion: 1,
    platform: "portable",
    profile: "web-v1",
    format: "cjs",
    main: files.main,
    styles: files.styles,
    skills: files.skills,
    integrity: files.integrity,
    targets: item.targets,
  });
}

export interface PortablePluginHost {
  readonly environment: PluginEnvironment;
  readonly appVersion: string;
  readonly profiles: readonly string[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}必须是对象`);
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
  if ((manifest.targets.android || manifest.targets.ios) && manifest.permissions?.length)
    throw new Error("移动端尚未接入业务数据授权，不能发布声明这些权限的移动目标");
  return manifest;
}

function parsePortablePluginManifest(value: unknown): PortablePluginManifest {
  const item = record(value, "跨端清单");
  if (item.formatVersion !== 3 || item.platform !== "portable" || item.profile !== "web-v1")
    throw new Error("跨端包格式或运行配置不兼容");
  if (item.apiVersion !== 1 || item.format !== "cjs") throw new Error("插件 API 或入口格式不兼容");
  const metadata = readPluginMetadata(item);
  const main = readPluginFilePath(item.main, ".js");
  const styles = item.styles === undefined ? undefined : readPluginFilePath(item.styles, ".css");
  const files = readPluginFiles(item, [main, ...(styles ? [styles] : [])]);
  const rawTargets = record(item.targets, "目标平台");
  const targets: Partial<Record<PortablePlatform, PortablePluginTarget>> = {};
  for (const platform of PORTABLE_PLATFORMS) {
    if (!Object.hasOwn(rawTargets, platform)) continue;
    const target = record(rawTargets[platform], "平台配置");
    if (typeof target.minAppVersion !== "string") throw new Error("平台缺少最低客户端版本");
    comparePluginVersions(target.minAppVersion, target.minAppVersion);
    targets[platform] = Object.freeze({ minAppVersion: target.minAppVersion });
  }
  if (!Object.keys(targets).length) throw new Error("需要至少一个支持的目标平台");
  const declaredFiles = item.integrity as Record<string, unknown>;
  if (Object.keys(declaredFiles).some(file => !Object.hasOwn(files.integrity, file)))
    throw new Error("跨端包包含未声明文件");
  for (const file of Object.keys(files.integrity)) {
    if (file === main || file === styles) continue;
    if (!file.endsWith(".md") || file.split("/").includes("scripts") || file.includes("\\"))
      throw new Error("跨端 Skill 仅支持纯 Markdown 文档，不支持脚本或附件");
  }
  return Object.freeze({
    ...metadata,
    apiVersion: 1 as const,
    format: "cjs" as const,
    main,
    ...(styles ? { styles } : {}),
    ...files,
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
