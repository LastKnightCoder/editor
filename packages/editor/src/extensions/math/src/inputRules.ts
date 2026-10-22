import type { InlineInputRule } from "@tau/editor/api";

const inline: InlineInputRule["inline"] = { type: "inline-math", create: tex => ({ tex }) };
/** 行内代码里的 `$` 是原样文本 */
const excludeMarks = ["code"];

/** `$x$` 与 `$$x$$` 都转成行内公式，与 remark-math 的行内解析一致 */
export const inlineMathInputRules: InlineInputRule[] = [
  { id: "tau.math.inline-double-dollar", delimiter: "$$", inline, excludeMarks },
  { id: "tau.math.inline-dollar", delimiter: "$", inline, excludeMarks },
];
