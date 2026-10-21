import type { PluginDefinition } from "./contract";
import type { PluginEditorExtension } from "./editor";
import { assertPluginEditorExtension } from "./editor-fields.ts";
import type { MarkdownCodec } from "@tau/markdown";
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
  const module: { exports: { default?: PluginDefinition } } = { exports: {} };
  new Function(
    "require",
    "module",
    "exports",
    '"use strict";\n' +
      artifact.code +
      `\n//# sourceURL=tau-plugin://${manifest.id}/${manifest.version}/main.js`
  )(
    (id: string) => {
      if (!PLUGIN_SHARED_MODULES.some(name => name === id) || !Object.hasOwn(modules, id))
        throw new Error(`插件使用了未提供的宿主模块：${id}`);
      return modules[id];
    },
    module,
    module.exports
  );
  return validatePluginDefinition(manifest, module.exports.default);
}

export function validatePluginDefinition(
  manifest: PluginManifest,
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
