import { assertWhiteboardElementVersions } from "@tau/whiteboard/author";
import { normalizeContentMetricRules } from "@tau/db-schema/content-metrics";
import { assertContentResourceSpecs } from "@tau/db-schema/content-resources";
import type { PluginDefinition } from "./contract";
import type { PluginEditorExtension } from "./editor";
import { normalizePluginEditorExtension } from "./editor-fields.ts";
import type { MarkdownCodec } from "@tau/markdown";
import {
  validatePortablePluginManifest,
  assertPortablePluginCompatibility,
  PORTABLE_SHARED_MODULES,
  type PortablePluginManifest,
  type PortablePluginHost,
} from "./portable";
import {
  PLUGIN_SHARED_MODULES,
  validatePluginManifest,
  type DevelopmentPluginPackage,
  type PluginManifest,
} from "./package.ts";
export type { PublishedPluginRender } from "./render-artifact";

export function assertUniqueEditorCodecs(
  codecs: readonly MarkdownCodec[],
  versions?: ReadonlyMap<string, number | undefined>
) {
  const types = new Set<string>();
  const directives = new Set<string>();
  for (const codec of codecs) {
    const version = codec.dataVersion ?? versions?.get(codec.type);
    if (
      codec.dataVersion !== undefined &&
      (!Number.isSafeInteger(codec.dataVersion) || codec.dataVersion < 1)
    )
      throw new Error("Markdown 数据版本无效");
    const key = JSON.stringify([codec.type, version ?? null]);
    if (types.has(key)) throw new Error(`插件 Markdown 类型重复：${codec.type}`);
    types.add(key);
    if (codec.dataVersion !== undefined && codec.dataVersion !== versions?.get(codec.type))
      continue;
    for (const name of Object.keys(codec.directives ?? {})) {
      if (directives.has(name)) throw new Error(`插件 Markdown directive 重复：${name}`);
      directives.add(name);
    }
  }
}
export const PLUGIN_RENDER_VERSION = 1;

/** 发布站只读取静态贡献；清单保持原格式，不启动应用插件生命周期。 */
export function readPublishedPluginManifest(value: unknown) {
  return (value as { formatVersion?: unknown } | null)?.formatVersion === 3
    ? validatePortablePluginManifest(value)
    : validatePluginManifest(value);
}

export function evaluatePublishedPluginPackage(
  artifact: {
    manifest: PluginManifest | PortablePluginManifest;
    code: string;
    css?: string;
  },
  modules: Readonly<Record<string, unknown>>
): PluginDefinition {
  const manifest = readPublishedPluginManifest(artifact.manifest);
  if (manifest.formatVersion !== 3)
    return evaluatePluginPackage({ ...artifact, manifest }, modules);
  if (!manifest.targets.desktop) throw new Error("博客渲染需要桌面目标");
  const definition = evaluateModule(manifest, artifact.code, modules, PORTABLE_SHARED_MODULES);
  return definition;
}

export interface PluginRenderSelection {
  id: string;
  version: string;
  mainHash: string;
  stylesHash?: string;
  nodeTypes: string[];
  styleSources?: PluginEditorExtension["styleSources"];
}
export interface PluginRenderContext {
  builtinTypes: string[];
  plugins: PluginRenderSelection[];
}
/** 只求值定义，不调用 create/activate；两端使用相同的 CJS 与共享模块约定。 */
export function evaluatePluginPackage(
  artifact: DevelopmentPluginPackage,
  modules: Readonly<Record<string, unknown>>
): PluginDefinition {
  const manifest = readPublishedPluginManifest(artifact.manifest);
  return evaluateModule(
    manifest,
    artifact.code,
    modules,
    manifest.formatVersion === 3 ? PORTABLE_SHARED_MODULES : PLUGIN_SHARED_MODULES
  );
}

/** 只供显式接入跨端协议的宿主；执行前必须先由包读取器验证文件完整性。 */
export function evaluatePortablePluginPackage(
  artifact: { manifest: PortablePluginManifest; code: string; css?: string },
  modules: Readonly<Record<string, unknown>>,
  host: PortablePluginHost
): PluginDefinition {
  const manifest = artifact.manifest;
  assertPortablePluginCompatibility(manifest, host);
  const definition = evaluateModule(manifest, artifact.code, modules, PORTABLE_SHARED_MODULES);
  if (definition.whiteboardExtensions?.length && host.environment.platform !== "desktop")
    throw new Error("当前宿主尚未提供白板扩展");
  return definition;
}

export const hasPluginContent = (definition: PluginDefinition) =>
  Boolean(definition.editorExtensions?.length || definition.whiteboardExtensions?.length);

type DefinitionManifest = Pick<PluginManifest, "id" | "name" | "version" | "apiVersion"> & {
  readonly formatVersion?: number;
  readonly editor?: boolean;
  readonly whiteboard?: boolean;
};

function evaluateModule(
  manifest: DefinitionManifest,
  code: string,
  modules: Readonly<Record<string, unknown>>,
  allowed: readonly string[]
): PluginDefinition {
  const module: { exports: { default?: PluginDefinition } } = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    '"use strict";\n' +
      code +
      `\n//# sourceURL=tau-plugin://${manifest.id}/${manifest.version}/main.js`
  )(
    (id: string) => {
      if (!allowed.includes(id) || !Object.hasOwn(modules, id))
        throw new Error(`插件使用了未提供的宿主模块：${id}`);
      return modules[id];
    },
    module,
    module.exports
  );
  return validatePluginDefinition(manifest, module.exports.default);
}

export function validatePluginDefinition(
  manifest: DefinitionManifest,
  definition: PluginDefinition | undefined
): PluginDefinition {
  if (
    !definition ||
    typeof definition.create !== "function" ||
    definition.id !== manifest.id ||
    definition.name !== manifest.name ||
    definition.version !== manifest.version ||
    definition.apiVersion !== manifest.apiVersion
  )
    throw new Error("插件入口定义与清单不一致");
  if (
    manifest.formatVersion !== 3 &&
    Boolean(definition.editorExtensions?.length) !== Boolean(manifest.editor)
  )
    throw new Error("编辑器贡献必须与 manifest.editor 声明一致");
  if (
    manifest.formatVersion !== 3 &&
    Boolean(definition.whiteboardExtensions?.length) !== Boolean(manifest.whiteboard)
  )
    throw new Error("白板贡献必须与 manifest.whiteboard 声明一致");
  definition = {
    ...definition,
    editorExtensions: definition.editorExtensions?.map(normalizePluginEditorExtension),
  };
  getPluginWhiteboardTypes(definition);
  if (definition.editorCodecs?.length && !definition.editorExtensions?.length)
    throw new Error("Markdown codec 必须随编辑器贡献声明");
  {
    const types = getPluginNodeTypes(definition);
    if (definition.editorCodecs?.some(codec => !types.includes(codec.type)))
      throw new Error("插件 codec 只能声明本插件提供的节点类型");
  }
  return definition;
}

export function getPluginNodeTypes(definition: PluginDefinition): string[] {
  const types: string[] = [];
  for (const extension of definition.editorExtensions ?? []) {
    for (const element of extension.elements ?? []) {
      if (!element.type || types.includes(element.type))
        throw new Error(`插件节点类型为空或重复：${element.type}`);
      if (element.resources !== undefined) {
        try {
          assertContentResourceSpecs(element.resources);
        } catch {
          throw new Error(`插件节点资源声明无效：${element.type}`);
        }
      }
      types.push(element.type);
    }
  }
  if (definition.editorExtensions?.length && !types.length)
    throw new Error("编辑器插件必须声明节点类型");
  const htmlTypes = new Set<string>();
  const declared = new Map(
    definition.editorExtensions
      ?.flatMap(extension => extension.elements ?? [])
      .map(element => [element.type, element])
  );
  for (const extension of definition.editorExtensions ?? []) {
    for (const source of extension.styleSources ?? [])
      if (
        !types.includes(source.type) ||
        !source.field ||
        !["html", "tsx"].includes(source.language)
      )
        throw new Error("插件样式源码必须声明本插件的节点字段和语言");
    for (const serializer of extension.htmlSerializers ?? []) {
      const element = declared.get(serializer.type);
      const version = serializer.dataVersion ?? element?.dataVersion;
      const key = JSON.stringify([serializer.type, version ?? null]);
      const supported = element
        ? [
            element.dataVersion,
            ...(element.previousVersions ?? []).map(item => item.element.dataVersion),
          ]
        : [];
      if (
        !types.includes(serializer.type) ||
        htmlTypes.has(key) ||
        (serializer.dataVersion !== undefined && !supported.includes(serializer.dataVersion)) ||
        typeof serializer.toHtml !== "function"
      )
        throw new Error("插件 HTML 导出类型重复或不属于本插件");
      htmlTypes.add(key);
    }
  }
  for (const rule of normalizeContentMetricRules(definition.editorMetrics ?? []))
    if (!types.includes(rule.type)) throw new Error("字数统计规则只能声明本插件的节点");
  return types;
}

export function getPluginWhiteboardTypes(definition: PluginDefinition): string[] {
  if (
    definition.whiteboardExtensions !== undefined &&
    !Array.isArray(definition.whiteboardExtensions)
  )
    throw new Error("白板扩展声明必须为数组");
  const types = new Set<string>();
  const extensions = new Set<string>();
  for (const extension of definition.whiteboardExtensions ?? []) {
    if (
      !extension ||
      typeof extension.id !== "string" ||
      extension.apiVersion !== 1 ||
      typeof extension.create !== "function" ||
      (extension.id !== definition.id && !extension.id.startsWith(`${definition.id}.`)) ||
      extensions.has(extension.id)
    )
      throw new Error("白板扩展身份重复或不属于当前插件");
    extensions.add(extension.id);
    if (!Array.isArray(extension.elements) || !extension.elements.length)
      throw new Error("白板插件必须声明静态元素");
    for (const element of extension.elements) {
      if (
        !element ||
        typeof element.type !== "string" ||
        !element.type.startsWith(`${definition.id}.`) ||
        types.has(element.type) ||
        typeof element.render !== "function"
      )
        throw new Error("白板元素重复、缺少渲染或不属于当前插件");
      assertWhiteboardElementVersions(
        element as unknown as import("@tau/whiteboard").WhiteboardElementDefinition
      );
      types.add(element.type);
    }
  }
  return [...types];
}

export function assertRenderTypes(definition: PluginDefinition, expected: readonly string[]) {
  const actual = getPluginNodeTypes(definition);
  if (actual.length !== expected.length || actual.some(type => !expected.includes(type)))
    throw new Error("发布的节点归属与插件定义不一致");
}
