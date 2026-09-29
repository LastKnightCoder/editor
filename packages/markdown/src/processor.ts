import type { Descendant } from "slate";

import type { CustomDirectiveHandler, MarkdownCodec } from "./codec.ts";
import {
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
  /** 元素类型的编解码（各扩展的 markdown.ts 提供）；处理器只认这里的类型，其余走 ER-006 兜底 */
  codecs?: MarkdownCodec[];
}

/**
 * 创建 Markdown 处理器（01 §8.2）：框架不带任何元素类型，全部经 codecs 注入，
 * 宿主把扩展包的 codec 列表（如 @tau/editor/markdown）与自己的业务 codec 合成一次，
 * 渲染进程和 Electron 主进程共用，避免两边漂移。
 */
export function createMarkdownProcessor(options: MarkdownProcessorOptions = {}): MarkdownProcessor {
  const codecs = options.codecs ?? [];

  const directives: Record<string, CustomDirectiveHandler> = {};
  const voidTypes = new Set<string>();
  const inlineWrapperDirectives = new Set<string>();
  const fenceByLanguage = new Map<string, { type: string; property: string }>();
  const importNodes: NonNullable<MarkdownCodec["importNode"]>[] = [];
  const fenceSourceProperties = new Map<string, string>();
  for (const codec of codecs) {
    Object.assign(directives, codec.directives);
    if (codec.isVoid) voidTypes.add(codec.type);
    if (codec.inlineWrapperDirective) inlineWrapperDirectives.add(codec.inlineWrapperDirective);
    if (codec.fence) {
      const languages =
        typeof codec.fence.language === "string" ? [codec.fence.language] : codec.fence.language;
      for (const language of languages) {
        const key = language.trim().toLowerCase();
        const existing = fenceByLanguage.get(key);
        if (existing) {
          throw new Error(
            `[markdown] 围栏语言 ${key} 同时被 ${existing.type} 与 ${codec.type} 认领`
          );
        }
        fenceByLanguage.set(key, { type: codec.type, property: codec.fence.property ?? "content" });
      }
    }
    if (codec.importNode) importNodes.push(codec.importNode);
    if (codec.fenceSourceProperty) fenceSourceProperties.set(codec.type, codec.fenceSourceProperty);
  }

  const normalizeHooks = new Map(
    codecs.filter(codec => codec.normalize).map(codec => [codec.type, codec.normalize!] as const)
  );
  const inlineForms = new Map(
    codecs.filter(codec => codec.inlineForm).map(codec => [codec.type, codec.inlineForm!] as const)
  );

  const importConfig: ImportConfig = {
    directives,
    voidTypes,
    inlineWrapperDirectives,
    fenceByLanguage,
    importNodes,
    fenceSourceProperties,
    normalizeHooks,
    inlineForms,
  };
  const exportConfig: ExportConfig = {
    registry: new MarkdownSerializerRegistry(
      codecs.flatMap(codec => (codec.serializer ? [{ ...codec.serializer, type: codec.type }] : []))
    ),
    voidTypes,
    childSeparators: new Map(
      codecs
        .filter(codec => codec.childSeparator && codec.childSeparator !== "\n\n")
        .map(codec => [codec.type, codec.childSeparator!] as const)
    ),
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
