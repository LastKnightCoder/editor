import { comparePluginVersions, type PluginManifest } from "./package.ts";
import { readPluginMetadata, readPluginFilePath, readPluginFiles } from "./package-fields.ts";
import type { PluginEnvironment } from "./environment";
import { PLUGIN_AI_CAPABILITIES, type PluginAICapability } from "./ai.ts";
import {
  PACKAGE_PLATFORMS,
  readPackageTargets,
  type PackagePlatform,
  type PackageTarget,
} from "./package-targets.ts";

export const MOBILE_DATA_MIN_VERSION = "0.2.13";
export const MOBILE_AI_MIN_VERSION = "0.2.13";
export const MOBILE_AI_PERMISSIONS = Object.freeze(
  (Object.keys(PLUGIN_AI_CAPABILITIES) as PluginAICapability[]).map(
    capability => `ai:${capability}` as const
  )
);
export const MOBILE_DATA_PERMISSIONS = [
  "cards:read",
  "cards:write",
  "cards:delete",
  "articles:read",
  "articles:write",
  "articles:delete",
  "projects:read",
  "projects:write",
  "projects:delete",
  "documents:read",
  "documents:write",
  "documents:delete",
  "todos:read",
  "todos:write",
  "todos:delete",
  "calendar:read",
  "calendar:write",
  "calendar:delete",
  "flashcards:read",
  "flashcards:write",
] as const;
/** 语音输入与首页面板随同一客户端版本开放 */
export const MOBILE_SPEECH_MIN_VERSION = "0.2.16";
export const MOBILE_SPEECH_PERMISSIONS = ["speech:input"] as const;

function assertMobilePermissions(manifest: PortablePluginManifest) {
  if (!manifest.permissions?.length) return;
  for (const platform of ["android", "ios"] as const) {
    const target = manifest.targets[platform];
    if (!target) continue;
    if (
      manifest.permissions.some(
        permission =>
          !(MOBILE_DATA_PERMISSIONS as readonly string[]).includes(permission) &&
          !(MOBILE_AI_PERMISSIONS as readonly string[]).includes(permission) &&
          !(MOBILE_SPEECH_PERMISSIONS as readonly string[]).includes(permission)
      )
    )
      throw new Error("移动端尚未开放此业务权限");
    if (
      manifest.permissions.some(permission =>
        (MOBILE_DATA_PERMISSIONS as readonly string[]).includes(permission)
      ) &&
      comparePluginVersions(target.minAppVersion, MOBILE_DATA_MIN_VERSION) < 0
    )
      throw new Error(`移动端业务数据授权要求最低客户端版本 ${MOBILE_DATA_MIN_VERSION}`);
    if (
      manifest.permissions.some(permission =>
        (MOBILE_AI_PERMISSIONS as readonly string[]).includes(permission)
      ) &&
      comparePluginVersions(target.minAppVersion, MOBILE_AI_MIN_VERSION) < 0
    )
      throw new Error(`移动端 AI 授权要求最低客户端版本 ${MOBILE_AI_MIN_VERSION}`);
    if (
      manifest.permissions.some(permission =>
        (MOBILE_SPEECH_PERMISSIONS as readonly string[]).includes(permission)
      ) &&
      comparePluginVersions(target.minAppVersion, MOBILE_SPEECH_MIN_VERSION) < 0
    )
      throw new Error(`移动端语音输入授权要求最低客户端版本 ${MOBILE_SPEECH_MIN_VERSION}`);
  }
}

export const PORTABLE_PLATFORMS = PACKAGE_PLATFORMS;
export type PortablePlatform = PackagePlatform;
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

export type PortablePluginTarget = PackageTarget;

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

export interface PluginAuthorManifest extends Pick<
  PluginManifest,
  "id" | "name" | "version" | "categories" | "keywords" | "permissions"
> {
  readonly description?: string;
  readonly targets: Readonly<Partial<Record<PortablePlatform, PortablePluginTarget>>>;
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

/** 构建器与中心共用发行范围；不代表中心已开放批准发布。 */
export function validatePortableDistributionManifest(value: unknown): PortablePluginManifest {
  const manifest = validatePortablePluginManifest(value);
  assertMobilePermissions(manifest);
  return manifest;
}

/** 作者、中心和宿主读取同一份平台与版本契约。 */
export function validatePortablePluginManifest(value: unknown): PortablePluginManifest {
  const item = record(value, "跨端清单");
  if (item.formatVersion !== 3 || item.platform !== "portable" || item.profile !== "web-v1")
    throw new Error("跨端包格式或运行配置不兼容");
  if (item.apiVersion !== 1 || item.format !== "cjs") throw new Error("插件 API 或入口格式不兼容");
  const metadata = readPluginMetadata(item);
  const main = readPluginFilePath(item.main, ".js");
  const styles = item.styles === undefined ? undefined : readPluginFilePath(item.styles, ".css");
  const files = readPluginFiles(item, [main, ...(styles ? [styles] : [])]);
  const targets = readPackageTargets(item.targets);
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
  manifest: PortablePluginManifest,
  host: PortablePluginHost
): PortablePluginTarget {
  if (!host.profiles.includes(manifest.profile)) throw new Error("宿主未接入跨端运行配置");
  const platform = host.environment.platform;
  if (!PORTABLE_PLATFORMS.some(value => value === platform))
    throw new Error("当前平台不能激活跨端应用插件");
  const target = manifest.targets[platform as PortablePlatform];
  if (!target) throw new Error("插件不支持当前平台");
  if (platform === "android" || platform === "ios") assertMobilePermissions(manifest);
  if (comparePluginVersions(host.appVersion, target.minAppVersion) < 0)
    throw new Error("客户端版本低于插件要求");
  return target;
}
