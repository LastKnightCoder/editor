import { assertContentResourceSpecs } from "@tau/db-schema/content-resources";
import type { PluginDefinition } from "./contract";
import type { PluginEditorExtension } from "./editor";
import { scopePortablePluginModules } from "./portable-services";
import { assertPluginEditorExtension } from "./editor-fields.ts";
import type { MarkdownCodec } from "@tau/markdown";
import {
  readPortablePluginManifest,
  assertPortablePluginCompatibility,
  assertPortableElementDeclarations,
  PORTABLE_SHARED_MODULES,
  getPortableElementSupport,
  type PortablePlatform,
  type ReadablePortablePluginManifest,
  type PortablePluginHost,
} from "./portable";
import {
  PLUGIN_SHARED_MODULES,
  validatePluginManifest,
  type DevelopmentPluginPackage,
  type PluginManifest,
} from "./package.ts";
export type { PublishedPluginRender } from "./render-artifact";

export function assertUniqueEditorCodecs(codecs: readonly MarkdownCodec[]) {
  const types = new Set<string>();
  const directives = new Set<string>();
  for (const codec of codecs) {
    if (types.has(codec.type)) throw new Error(`插件 Markdown 类型重复：${codec.type}`);
    types.add(codec.type);
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
    ? readPortablePluginManifest(value)
    : validatePluginManifest(value);
}

export function evaluatePublishedPluginPackage(
  artifact: {
    manifest: PluginManifest | ReadablePortablePluginManifest;
    code: string;
    css?: string;
  },
  modules: Readonly<Record<string, unknown>>
): PluginDefinition {
  const manifest = readPublishedPluginManifest(artifact.manifest);
  if (manifest.formatVersion !== 3)
    return evaluatePluginPackage({ ...artifact, manifest }, modules);
  if (!manifest.editor || !manifest.targets.desktop) throw new Error("博客渲染需要桌面编辑器贡献");
  const definition = evaluateModule(manifest, artifact.code, modules, PORTABLE_SHARED_MODULES);
  assertPortableElementDeclarations(manifest, getPluginNodeTypes(definition));
  return adaptPortablePluginDefinition(definition, manifest, "desktop").definition;
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
  const manifest = validatePluginManifest(artifact.manifest);
  return evaluateModule(manifest, artifact.code, modules, PLUGIN_SHARED_MODULES);
}

/** 只供显式接入跨端协议的宿主；执行前必须先由包读取器验证文件完整性。 */
export function evaluatePortablePluginPackage(
  artifact: { manifest: ReadablePortablePluginManifest; code: string; css?: string },
  modules: Readonly<Record<string, unknown>>,
  host: PortablePluginHost
): PluginDefinition {
  const manifest = readPortablePluginManifest(artifact.manifest);
  const target = assertPortablePluginCompatibility(manifest, host);
  const definition = evaluateModule(
    manifest,
    artifact.code,
    scopePortablePluginModules(modules, target, host.capabilities),
    PORTABLE_SHARED_MODULES
  );
  assertPortableElementDeclarations(manifest, getPluginNodeTypes(definition));
  return definition;
}

/** 各宿主共用支持等级投影；原始数据与节点身份不改写。 */
export function adaptPortablePluginDefinition(
  definition: PluginDefinition,
  manifest: ReadablePortablePluginManifest,
  platform: PortablePlatform
) {
  const support = Object.freeze(
    Object.fromEntries(
      getPluginNodeTypes(definition).map(type => [
        type,
        getPortableElementSupport(manifest, platform, type),
      ])
    )
  );
  const extensions = definition.editorExtensions?.flatMap(extension => {
    const elements = extension.elements
      ?.filter(element => support[element.type] !== "none")
      .map(element =>
        support[element.type] === "edit" ? element : { ...element, behaviors: undefined }
      );
    if (!elements?.length) return [];
    const types = new Set(elements.map(element => element.type));
    const editable = elements.every(element => support[element.type] === "edit");
    return [
      {
        ...extension,
        elements,
        styleSources: extension.styleSources?.filter(source => types.has(source.type)),
        htmlSerializers: extension.htmlSerializers?.filter(serializer =>
          types.has(serializer.type)
        ),
        ...(editable
          ? {}
          : {
              blockPanel: undefined,
              commands: undefined,
              hotkeys: undefined,
              menu: undefined,
              behaviorsFor: undefined,
            }),
      },
    ];
  });
  return {
    support,
    definition: {
      ...definition,
      editorExtensions: extensions?.length ? extensions : undefined,
      editorCodecs: definition.editorCodecs?.filter(codec => support[codec.type] !== "none"),
    },
  };
}

type DefinitionManifest = Pick<
  PluginManifest,
  "id" | "name" | "version" | "apiVersion" | "editor" | "whiteboard"
>;

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
  if (Boolean(definition.editorExtensions?.length) !== Boolean(manifest.editor))
    throw new Error("编辑器贡献必须与 manifest.editor 声明一致");
  if (Boolean(definition.whiteboardExtensions?.length) !== Boolean(manifest.whiteboard))
    throw new Error("白板贡献必须与 manifest.whiteboard 声明一致");
  getPluginWhiteboardTypes(definition);
  if (definition.editorCodecs?.length && !manifest.editor)
    throw new Error("Markdown codec 必须随编辑器贡献声明");
  if (manifest.editor) {
    const types = getPluginNodeTypes(definition);
    if (definition.editorCodecs?.some(codec => !types.includes(codec.type)))
      throw new Error("插件 codec 只能声明本插件提供的节点类型");
  }
  return definition;
}

export function getPluginNodeTypes(definition: PluginDefinition): string[] {
  const types: string[] = [];
  for (const extension of definition.editorExtensions ?? []) {
    assertPluginEditorExtension(extension);
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
  for (const extension of definition.editorExtensions ?? []) {
    for (const source of extension.styleSources ?? [])
      if (
        !types.includes(source.type) ||
        !source.field ||
        !["html", "tsx"].includes(source.language)
      )
        throw new Error("插件样式源码必须声明本插件的节点字段和语言");
    for (const serializer of extension.htmlSerializers ?? []) {
      if (
        !types.includes(serializer.type) ||
        htmlTypes.has(serializer.type) ||
        typeof serializer.toHtml !== "function"
      )
        throw new Error("插件 HTML 导出类型重复或不属于本插件");
      htmlTypes.add(serializer.type);
    }
  }
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
