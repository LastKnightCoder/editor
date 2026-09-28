import type { Descendant } from "slate";

import type { CustomDirectiveHandler, MarkdownCodec } from "./codec.ts";
import {
  BUILTIN_INLINE_WRAPPER_DIRECTIVES,
  BUILTIN_VOID_TYPES,
  importFromMarkdownUsing,
  importFromMarkdownWithPositionsUsing,
  type ImportConfig,
  type ImportFromMarkdownOptions,
  type SlateWithPositions,
} from "./markdown.ts";
import {
  elementToMarkdownUsing,
  getMarkdownUsing,
  getMarkdownWithPositionsUsing,
  type ExportConfig,
  type MarkdownWithPositions,
} from "./markdown-helper.ts";
import { MarkdownSerializerRegistry } from "./markdownSerializerRegistry.ts";
import type { CustomElement } from "./types.ts";

export interface MarkdownProcessor {
  importFromMarkdown(
    markdown: string,
    ignoreTypes?: string[],
    options?: ImportFromMarkdownOptions
  ): Descendant[];
  importFromMarkdownWithPositions(
    markdown: string,
    ignoreTypes?: string[],
    options?: ImportFromMarkdownOptions
  ): SlateWithPositions;
  getMarkdown(value: Descendant[]): string;
  getMarkdownWithPositions(value: Descendant[]): MarkdownWithPositions;
  elementToMarkdown(element: CustomElement, parentElement: CustomElement | null): string;
}

export interface MarkdownProcessorOptions {
  /** 宿主元素类型的编解码；同 type 覆盖内置 */
  codecs?: MarkdownCodec[];
}

/**
 * 创建 Markdown 处理器（01 §8.2）：内置元素由框架处理，宿主类型经 codecs 注入。
 * 宿主只定义一次处理器，渲染进程和 Electron 主进程共用，避免两边漂移。
 */
export function createMarkdownProcessor(options: MarkdownProcessorOptions = {}): MarkdownProcessor {
  const codecs = options.codecs ?? [];

  const directives: Record<string, CustomDirectiveHandler> = {};
  const voidTypes = new Set(BUILTIN_VOID_TYPES);
  const importVoidTypes = new Set(BUILTIN_VOID_TYPES);
  const inlineWrapperDirectives = new Set(BUILTIN_INLINE_WRAPPER_DIRECTIVES);
  for (const codec of codecs) {
    Object.assign(directives, codec.directives);
    if (codec.isVoid) voidTypes.add(codec.type);
    if (codec.isVoid || codec.isVoidOnImportOnly) importVoidTypes.add(codec.type);
    if (codec.inlineWrapperDirective) inlineWrapperDirectives.add(codec.inlineWrapperDirective);
  }

  const importConfig: ImportConfig = {
    directives,
    voidTypes: importVoidTypes,
    inlineWrapperDirectives,
  };
  const exportConfig: ExportConfig = {
    registry: new MarkdownSerializerRegistry(
      codecs.flatMap(codec => (codec.serializer ? [{ ...codec.serializer, type: codec.type }] : []))
    ),
    voidTypes,
  };

  return {
    importFromMarkdown: (markdown, ignoreTypes, importOptions) =>
      importFromMarkdownUsing(importConfig, markdown, ignoreTypes, importOptions),
    importFromMarkdownWithPositions: (markdown, ignoreTypes, importOptions) =>
      importFromMarkdownWithPositionsUsing(importConfig, markdown, ignoreTypes, importOptions),
    getMarkdown: value => getMarkdownUsing(exportConfig, value),
    getMarkdownWithPositions: value => getMarkdownWithPositionsUsing(exportConfig, value),
    elementToMarkdown: (element, parentElement) =>
      elementToMarkdownUsing(exportConfig, element, parentElement),
  };
}
