import type { MarkdownCodec } from "@tau/markdown";

// 没有 Markdown 语法：导出走 ER-006 兜底（JSON 围栏），只在位置映射里按 void 处理
export const graphvizCodec: MarkdownCodec = {
  type: "graphviz",
  isVoid: true,
};
