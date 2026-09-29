import { createMarkdownProcessor, type MarkdownCodec } from "../index.ts";

/**
 * 框架测试用的最小 codec 夹具：框架不自带元素类型后，只测 walker / 位置映射 / 兜底
 * 这些与具体扩展无关的行为。真实 codec 的行为测试在各扩展包（@tau/editor 的
 * src/markdown.ts 旁），不要把扩展的序列化器复制到这里。
 */
export const paragraphCodec: MarkdownCodec = {
  type: "paragraph",
  serializer: {
    isBlock: true,
    toMarkdown: (_element, childrenStr) => childrenStr,
    toMarkdownStructured: (_element, childrenStr) => ({
      output: childrenStr,
      childrenStart: { line: 0, ch: 0 },
    }),
  },
};

/** 带段落 codec 的处理器：导入导出都能处理最简单的文档 */
export const fixtureProcessor = createMarkdownProcessor({ codecs: [paragraphCodec] });

/** 无 codec 的处理器：只测框架 walker 与 ER-006 兜底 */
export const bareProcessor = createMarkdownProcessor();
