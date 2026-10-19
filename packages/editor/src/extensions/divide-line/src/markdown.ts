import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";

export const divideLineCodec: MarkdownCodec = {
  type: "divide-line",
  // 连续分割线只保留最后一个（顶层除外，沿用迁移前行为）
  normalize: (_element, context) =>
    context.parent && (context.nextSibling as { type?: string } | null)?.type === "divide-line"
      ? []
      : null,
  // thematicBreak（--- / ***）与硬换行（break）都映射为分割线（沿用迁移前行为）
  importNode: node =>
    node.type === "thematicBreak" || node.type === "break"
      ? ({
          type: "divide-line",
          children: [{ type: "formatted", text: "" }],
        } as Descendant)
      : null,
  isVoid: true,
  serializer: {
    isBlock: true,
    toMarkdown: () => "---",
  },
};
