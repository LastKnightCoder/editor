import type { MarkInputRule } from "@tau/editor/api";

/** 行内代码里的文字原样保留，不再识别其他定界符 */
const excludeMarks = ["code"];

export const textFormattingInputRules: MarkInputRule[] = [
  {
    id: "tau.mark.bold-italic",
    delimiter: "***",
    marks: { bold: true, italic: true },
    excludeMarks,
  },
  { id: "tau.mark.bold", delimiter: "**", marks: { bold: true }, excludeMarks },
  {
    id: "tau.mark.bold-underscore",
    delimiter: "__",
    marks: { bold: true },
    wordBoundary: true,
    excludeMarks,
  },
  { id: "tau.mark.italic", delimiter: "*", marks: { italic: true }, excludeMarks },
  {
    id: "tau.mark.italic-underscore",
    delimiter: "_",
    marks: { italic: true },
    wordBoundary: true,
    excludeMarks,
  },
  { id: "tau.mark.strikethrough", delimiter: "~~", marks: { strikethrough: true }, excludeMarks },
  // 高亮写颜色值而非 true：导出 Markdown 时只有带颜色的高亮能写进 `:highlight[]` 指令
  { id: "tau.mark.highlight", delimiter: "==", marks: { highlight: "yellow" }, excludeMarks },
  { id: "tau.mark.code", delimiter: "`", marks: { code: true }, excludeMarks },
];
