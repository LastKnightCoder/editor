import type { ContentBlock } from "./types.ts";

export const getDisplayTextFromBlocks = (blocks: ContentBlock[]): string =>
  blocks
    .filter(
      (block): block is Extract<ContentBlock, { type: "text" | "reasoning" }> =>
        block.type === "text" || block.type === "reasoning"
    )
    .map(block => block.content)
    .filter(content => content.trim().length > 0)
    .join("\n\n");
