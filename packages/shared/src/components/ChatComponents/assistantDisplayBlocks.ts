import type { ContentBlock, ToolCallExecutionState } from "./types";

const hasReasoningTiming = (block: ContentBlock): boolean =>
  block.type === "reasoning" &&
  (typeof block.startTime === "number" ||
    typeof block.endTime === "number" ||
    typeof block.duration === "number");

const appendBlock = (blocks: ContentBlock[], block: ContentBlock) => {
  if (block.type === "tool_calls") {
    if (block.executions.length > 0) {
      blocks.push(block);
    }
    return;
  }

  if (!block.content.trim()) {
    return;
  }

  const lastBlock = blocks[blocks.length - 1];
  if (!lastBlock || lastBlock.type !== block.type) {
    blocks.push(block);
    return;
  }

  if (block.type === "reasoning") {
    if (hasReasoningTiming(lastBlock) || hasReasoningTiming(block)) {
      blocks.push(block);
      return;
    }
  }

  lastBlock.content += block.content;
};

export const buildLegacyAssistantDisplayBlocks = ({
  content,
  reasoning,
  toolExecutions,
}: {
  content?: string;
  reasoning?: string;
  toolExecutions?: ToolCallExecutionState[];
}): ContentBlock[] => {
  const blocks: ContentBlock[] = [];

  if (reasoning?.trim()) {
    appendBlock(blocks, {
      type: "reasoning",
      content: reasoning,
    });
  }

  if (toolExecutions?.length) {
    blocks.push({
      type: "tool_calls",
      executions: toolExecutions,
    });
  }

  if (content?.trim()) {
    appendBlock(blocks, {
      type: "text",
      content,
    });
  }

  return blocks;
};

export const getDisplayTextFromBlocks = (blocks: ContentBlock[]): string =>
  blocks
    .filter(
      (block): block is Extract<ContentBlock, { type: "text" | "reasoning" }> =>
        block.type === "text" || block.type === "reasoning",
    )
    .map((block) => block.content)
    .filter((content) => content.trim().length > 0)
    .join("\n\n");
