import { defineExtension } from "@tau/editor/contracts";
import type { EditorExtension as InternalExtension } from "@tau/editor/contracts";
import { normalizePluginEditorExtension, type OpenEditorExtensionField } from "./editor-fields";

export { defineElement as defineEditorElement } from "@tau/editor/contracts";
export type { ElementRenderProps as EditorElementRenderProps } from "@tau/editor/contracts";
export type { ContentMetricRule as EditorMetricRule } from "@tau/db-schema/content-metrics";
export type { MarkdownCodec as EditorMarkdownCodec } from "@tau/markdown";
export type {
  ContentResourceSpec as EditorResourceSpec,
  ContentResourceKind as EditorResourceKind,
} from "@tau/db-schema/content-resources";

/** 作者通过模块增强登记自定义节点，无需引用编辑器内部包。 */
declare const elementMapBrand: unique symbol;
declare const inlineMapBrand: unique symbol;
export interface EditorElementMap {
  [elementMapBrand]: never;
}
export interface EditorInlineElementMap {
  [inlineMapBrand]: never;
}
declare module "@tau/editor/api" {
  interface ExtensionElementMap extends EditorElementMap {
    [elementMapBrand]: never;
  }
  interface ExtensionInlineElementMap extends EditorInlineElementMap {
    [inlineMapBrand]: never;
  }
}

export type PluginEditorExtension = Pick<InternalExtension, OpenEditorExtensionField> & {
  plugins?: never;
  /** 发布时从节点字段收集 Tailwind 源码，复用宿主编译器。 */
  styleSources?: readonly { type: string; field: string; language: "html" | "tsx" }[];
  /** 静态 HTML/EPUB 导出；博客始终使用 elements.render，不经过这里。 */
  htmlSerializers?: readonly {
    type: string;
    dataVersion?: number;
    toHtml(element: Record<string, unknown>): string;
  }[];
};

export function defineEditorExtension(
  definition: Omit<PluginEditorExtension, "apiVersion">
): PluginEditorExtension {
  return defineExtension(normalizePluginEditorExtension(definition)) as PluginEditorExtension;
}
