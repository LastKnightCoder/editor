import type { Descendant } from "slate";
import { createMarkdownProcessor, type MarkdownCodec } from "../index.ts";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";

/**
 * 框架测试用的最小 codec 夹具：框架不自带任何元素类型后，只测 walker / 位置映射 / 兜底
 * 这些与具体扩展无关的行为。真实 codec 的行为测试在各扩展包（@tau/editor 的
 * src/markdown.ts 旁），不要把扩展的序列化器复制到这里。
 */
export const paragraphCodec: MarkdownCodec = {
  type: "paragraph",
  importNode: node =>
    node.type === "paragraph" ? ({ type: "paragraph", children: [] } as Descendant) : null,
  serializer: {
    isBlock: true,
    toMarkdown: (_element, childrenStr) => childrenStr,
    toMarkdownStructured: (_element, childrenStr) => ({
      output: childrenStr,
      childrenStart: { line: 0, ch: 0 },
    }),
  },
};

/** header 夹具：import-options 等测 walker 标准语法导入时需要最小认领 */
export const headerCodec: MarkdownCodec = {
  type: "header",
  importNode: node =>
    node.type === "heading"
      ? ({ type: "header", level: node.depth, children: [] } as Descendant)
      : null,
  serializer: {
    isBlock: true,
    toMarkdown: (element, childrenStr) => `${"#".repeat(element.level || 1)} ${childrenStr}`,
  },
};

/** 带段落 codec 的处理器：导入导出都能处理最简单的文档 */
export const fixtureProcessor = createMarkdownProcessor({
  textCodecs: [textFormattingCodec],
  codecs: [paragraphCodec, headerCodec],
});

/** 无 codec 的处理器：只测框架 walker 与 ER-006 兜底 */
export const bareProcessor = createMarkdownProcessor();
