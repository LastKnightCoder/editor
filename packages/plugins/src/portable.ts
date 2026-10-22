import {
  validatePluginManifest,
  comparePluginVersions,
  assertLocalId,
  type PluginManifest,
} from "./package";
import { readPluginCapabilities, type PluginCapability } from "./capabilities";
import type { PluginEnvironment } from "./environment";

export const PORTABLE_PLATFORMS = ["desktop", "android", "ios"] as const;
export type PortablePlatform = (typeof PORTABLE_PLATFORMS)[number];
export type PluginElementSupport = "none" | "render" | "edit";
export const PORTABLE_SHARED_MODULES = [
  "@tau/plugins",
  "@tau/ui",
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
] as const;

export interface PortablePluginTarget {
  readonly minAppVersion: string;
  readonly required: readonly PluginCapability[];
  readonly optional: readonly PluginCapability[];
  readonly elements?: Readonly<Record<string, PluginElementSupport>>;
}

export interface PortablePluginManifest extends Omit<
  PluginManifest,
  "formatVersion" | "platform" | "backend" | "whiteboard" | "skills" | "minAppVersion"
> {
  readonly formatVersion: 3;
  readonly platform: "portable";
  readonly profile: "web-v1";
  readonly targets: Readonly<Partial<Record<PortablePlatform, PortablePluginTarget>>>;
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

/** 开发跨端包独立校验；既有生产分发校验器继续拒绝格式 3。 */
export function validatePortablePluginManifest(value: unknown): PortablePluginManifest {
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
    "editor",
    "categories",
    "keywords",
    "permissions",
    "integrity",
  ]);
  if (Object.keys(item).some(key => !keys.has(key))) throw new Error("跨端清单包含未支持字段");
  if (item.formatVersion !== 3 || item.platform !== "portable" || item.profile !== "web-v1")
    throw new Error("跨端包格式或运行配置不兼容");
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
    if (
      Object.keys(target).some(
        key => !["minAppVersion", "required", "optional", "elements"].includes(key)
      )
    )
      throw new Error("平台配置包含未知字段");
    if (typeof target.minAppVersion !== "string") throw new Error("平台缺少最低客户端版本");
    comparePluginVersions(target.minAppVersion, target.minAppVersion);
    const required = readPluginCapabilities(target.required);
    const optional = readPluginCapabilities(target.optional ?? []);
    if (optional.some(capability => required.includes(capability)))
      throw new Error("必需与可选能力不能重叠");
    let elements: Record<string, PluginElementSupport> | undefined;
    if (target.elements !== undefined) {
      const entries = Object.entries(record(target.elements, "节点支持声明"));
      if (!base.editor || !entries.length || entries.length > 128)
        throw new Error("节点支持声明需要编辑器贡献且数量有效");
      elements = Object.create(null) as Record<string, PluginElementSupport>;
      for (const [type, support] of entries) {
        assertLocalId(type);
        if (type === "__proto__" || !["none", "render", "edit"].includes(support as string))
          throw new Error("节点支持等级无效");
        if (support !== "none" && !required.includes("editor.elements.v1"))
          throw new Error("展示或编辑节点需要声明编辑器能力");
        elements[type] = support as PluginElementSupport;
      }
    }
    if (base.editor && !elements) throw new Error("每个目标平台必须明确声明节点支持等级");
    targets[platform] = Object.freeze({
      minAppVersion: target.minAppVersion,
      required,
      optional,
      ...(elements ? { elements: Object.freeze(elements) } : {}),
    });
  }
  const files = record(item.integrity, "文件摘要");
  if (Object.keys(files).some(file => file !== base.main && file !== base.styles))
    throw new Error("跨端包包含未声明文件");
  return Object.freeze({
    ...base,
    formatVersion: 3 as const,
    platform: "portable" as const,
    profile: "web-v1" as const,
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
  if (comparePluginVersions(host.appVersion, target.minAppVersion) < 0)
    throw new Error("客户端版本低于插件要求");
  const missing = target.required.filter(
    capability => !host.environment.capabilities.includes(capability)
  );
  if (missing.length) throw new Error(`宿主缺少必需能力：${missing.join("、")}`);
  return target;
}

export function getPortableElementSupport(
  manifest: PortablePluginManifest,
  platform: PortablePlatform,
  type: string
): PluginElementSupport {
  const elements = manifest.targets[platform]?.elements;
  return elements && Object.hasOwn(elements, type) ? elements[type] : "none";
}

/** 定义求值后对账节点归属；调用方仍须按支持等级装配渲染与提交保护。 */
export function assertPortableElementDeclarations(
  manifest: PortablePluginManifest,
  nodeTypes: readonly string[]
) {
  const actual = new Set(nodeTypes);
  for (const target of Object.values(manifest.targets)) {
    const declared = Object.keys(target.elements ?? {});
    if (declared.length !== actual.size || declared.some(type => !actual.has(type)))
      throw new Error("平台节点声明与插件实际贡献不一致");
  }
}
