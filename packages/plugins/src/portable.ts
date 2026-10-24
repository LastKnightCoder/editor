import {
  validatePluginManifest,
  comparePluginVersions,
  assertLocalId,
  type PluginManifest,
} from "./package";
import {
  readPluginCapabilities,
  readPluginCapabilityNames,
  type PluginCapability,
} from "./capabilities";
import type { PluginEnvironment } from "./environment";
export { isPluginCapability } from "./capabilities";
export type { PluginCapability } from "./capabilities";

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

export interface PortablePluginTarget<Capability extends string = PluginCapability> {
  readonly minAppVersion: string;
  readonly required: readonly Capability[];
  readonly optional: readonly Capability[];
  readonly elements?: Readonly<Record<string, PluginElementSupport>>;
}

export interface PortablePluginManifest<Capability extends string = PluginCapability> extends Omit<
  PluginManifest,
  "formatVersion" | "platform" | "backend" | "minAppVersion"
> {
  readonly formatVersion: 3;
  readonly platform: "portable";
  readonly profile: "web-v1";
  readonly description?: string;
  readonly targets: Readonly<Partial<Record<PortablePlatform, PortablePluginTarget<Capability>>>>;
}

export type ReadablePortablePluginManifest = PortablePluginManifest<string>;

export const PLUGIN_BASE_REQUIREMENTS = [
  "commands",
  "storage",
  "pages",
  "navigation",
  "settings",
  "dialogs",
] as const satisfies readonly PluginCapability[];
export type PluginRequirement =
  "sourceEditor" | "runtimeStyles" | "media" | "fetch" | "sync" | "upload";
export type OptionalPluginRequirement = "runtimeStyles";

export interface PluginAuthorTarget {
  readonly minAppVersion: string;
  readonly requires?: readonly PluginRequirement[];
  readonly optional?: readonly OptionalPluginRequirement[];
  readonly editor?: { readonly elements: Readonly<Record<string, PluginElementSupport>> };
}

export interface PluginAuthorManifest extends Pick<
  PluginManifest,
  "id" | "name" | "version" | "categories" | "keywords" | "permissions"
> {
  readonly description?: string;
  readonly requires?: readonly PluginRequirement[];
  readonly optional?: readonly OptionalPluginRequirement[];
  readonly editor?: { readonly elements: Readonly<Record<string, PluginElementSupport>> };
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

/** 作者只声明额外需求；发行字段由构建工具提供，平台覆盖按整组替换。 */
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
  const whiteboard = imports.includes("@tau/plugins/whiteboard");
  const { imports: _imports, ...buildFiles } = files;
  assertKeys(
    item,
    [
      "id",
      "name",
      "version",
      "description",
      "categories",
      "keywords",
      "permissions",
      "requires",
      "optional",
      "editor",
      "targets",
    ],
    "作者清单"
  );
  const targets = record(item.targets, "目标平台");
  const requirements = (input: unknown, optional: boolean) => {
    const names = readPluginCapabilities(input ?? []);
    const allowed = optional
      ? ["runtimeStyles"]
      : ["sourceEditor", "runtimeStyles", "media", "fetch", "sync", "upload"];
    if (names.some(name => !allowed.includes(name)))
      throw new Error(optional ? "功能不支持可选访问" : "作者只能声明额外功能需求");
    return names;
  };
  const elements = (input: unknown) => {
    if (input === undefined) return undefined;
    const editor = record(input, "编辑器声明");
    assertKeys(editor, ["elements"], "编辑器声明");
    return record(editor.elements, "节点支持声明");
  };
  const commonRequired = requirements(item.requires, false);
  const commonOptional = requirements(item.optional, true);
  if (commonOptional.some(name => commonRequired.includes(name)))
    throw new Error("必需与可选能力不能重叠");
  const commonElements = elements(item.editor);
  const normalized = Object.fromEntries(
    Object.entries(targets).map(([platform, input]) => {
      const target = record(input, "平台配置");
      assertKeys(target, ["minAppVersion", "requires", "optional", "editor"], "平台配置");
      const extra =
        target.requires === undefined ? commonRequired : requirements(target.requires, false);
      const optional =
        target.optional === undefined ? commonOptional : requirements(target.optional, true);
      if (optional.some(name => extra.includes(name))) throw new Error("必需与可选能力不能重叠");
      if (optional.includes("runtimeStyles") && !extra.includes("sourceEditor"))
        throw new Error("可选样式编译需要 sourceEditor 访问器");
      const support = target.editor === undefined ? commonElements : elements(target.editor);
      const required: PluginCapability[] = [...PLUGIN_BASE_REQUIREMENTS, ...extra];
      if (support) required.push("editor", "editorCodecs");
      return [
        platform,
        {
          minAppVersion: target.minAppVersion,
          required,
          optional,
          ...(support ? { elements: support } : {}),
        },
      ];
    })
  );
  const {
    requires: _requires,
    optional: _optional,
    editor: _editor,
    targets: _targets,
    ...metadata
  } = item;
  return validatePortableDistributionManifest({
    ...metadata,
    formatVersion: 3,
    apiVersion: 1,
    platform: "portable",
    profile: "web-v1",
    format: "cjs",
    ...buildFiles,
    ...(whiteboard ? { whiteboard: true } : {}),
    ...(Object.values(normalized).some(target => target.elements) ? { editor: true } : {}),
    targets: normalized,
  });
}

export interface PortablePluginHost {
  readonly environment: PluginEnvironment;
  readonly capabilities: readonly PluginCapability[];
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

/** 作者与上传入口严格校验能力词表，避免拼写错误被当作可选降级。 */
export function validatePortablePluginManifest(value: unknown): PortablePluginManifest {
  return parsePortablePluginManifest(value, readPluginCapabilities);
}

/** 客户端只放宽能力名称的前向读取，结构、格式、权限与摘要声明仍严格校验。 */
export function readPortablePluginManifest(value: unknown): ReadablePortablePluginManifest {
  return parsePortablePluginManifest(value, readPluginCapabilityNames);
}

/** 构建器与中心共用发行范围；不代表中心已开放批准发布。 */
export function validatePortableDistributionManifest(value: unknown): PortablePluginManifest {
  const manifest = validatePortablePluginManifest(value);
  if (/[-+]/.test(manifest.version)) throw new Error("正式跨端包版本不能含预发布或构建标识");
  if ((manifest.targets.android || manifest.targets.ios) && manifest.permissions?.length)
    throw new Error("移动端尚未接入业务数据授权，不能发布声明这些权限的移动目标");
  return manifest;
}

function parsePortablePluginManifest<Capability extends string>(
  value: unknown,
  readCapabilities: (value: unknown) => readonly Capability[]
): PortablePluginManifest<Capability> {
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
    "whiteboard",
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
  const targets: Partial<Record<PortablePlatform, PortablePluginTarget<Capability>>> = {};
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
    const required = readCapabilities(target.required);
    const optional = readCapabilities(target.optional ?? []);
    if (base.whiteboard && platform !== "desktop") throw new Error("白板扩展只支持桌面目标");
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
        if (support !== "none" && !required.some(capability => capability === "editor"))
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
): PortablePluginTarget<string> {
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
  const missing = target.required.filter(
    capability => !host.capabilities.some(available => available === capability)
  );
  if (missing.length) throw new Error(`宿主缺少必需能力：${missing.join("、")}`);
  return target;
}

export function getPortableElementSupport(
  manifest: ReadablePortablePluginManifest,
  platform: PortablePlatform,
  type: string
): PluginElementSupport {
  const elements = manifest.targets[platform]?.elements;
  return elements && Object.hasOwn(elements, type) ? elements[type] : "none";
}

/** 定义求值后对账节点归属；调用方仍须按支持等级装配渲染与提交保护。 */
export function assertPortableElementDeclarations(
  manifest: ReadablePortablePluginManifest,
  nodeTypes: readonly string[]
) {
  const actual = new Set(nodeTypes);
  for (const target of Object.values(manifest.targets)) {
    const declared = Object.keys(target.elements ?? {});
    if (declared.length !== actual.size || declared.some(type => !actual.has(type)))
      throw new Error("平台节点声明与插件实际贡献不一致");
  }
}
