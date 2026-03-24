import { Role } from "@/constants";
import type {
  AssistantBlock,
  AssistantReasoningBlock,
  AssistantTextBlock,
  AssistantToolCallBlock,
  RequestMessage,
  ResponseContentBlock,
  ResponseMessage,
  ToolCallExecutionState,
  ToolCallPayload,
} from "@/types";

const createTextBlockId = (turnId: string) => `${turnId}:text`;
const createReasoningBlockId = (turnId: string) => `${turnId}:reasoning`;

const ensureAssistantBlocks = (message: ResponseMessage) => {
  if (!message.assistant_blocks) {
    message.assistant_blocks = [];
  }
  return message.assistant_blocks;
};

const createSyntheticExecution = (
  toolCall: ToolCallPayload,
  execution?: ToolCallExecutionState,
): ToolCallExecutionState =>
  execution || {
    toolCallId: toolCall.id,
    toolName: toolCall.function.name,
    status: "pending",
    input: toolCall.function.arguments || "",
    timestamp: 0,
  };

const buildTextMessage = (text: string): RequestMessage => ({
  role: Role.Assistant,
  content: [{ type: "text", text }],
});

const buildToolResultText = (execution: ToolCallExecutionState) => {
  if (execution.output?.trim()) {
    return execution.output;
  }
  if (execution.error?.trim()) {
    return execution.error;
  }

  const metadata = execution.metadata;
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const render =
    metadata.render && typeof metadata.render === "object"
      ? (metadata.render as Record<string, unknown>)
      : null;
  const payload =
    render?.payload && typeof render.payload === "object"
      ? render.payload
      : null;
  if (!payload) {
    return "";
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return "";
  }
};

const getTurnBlockIndices = (blocks: AssistantBlock[], turnId: string) =>
  blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.turnId === turnId);

const getLastTurnBlockIndex = (blocks: AssistantBlock[], turnId: string) => {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index].turnId === turnId) {
      return index;
    }
  }
  return -1;
};

const getTextBlocksForTurn = (blocks: AssistantBlock[], turnId: string) =>
  blocks.filter(
    (block): block is AssistantTextBlock =>
      block.turnId === turnId && block.type === "text",
  );

const getReasoningBlocksForTurn = (blocks: AssistantBlock[], turnId: string) =>
  blocks.filter(
    (block): block is AssistantReasoningBlock =>
      block.turnId === turnId && block.type === "reasoning",
  );

const getToolBlocksForTurn = (blocks: AssistantBlock[], turnId: string) =>
  blocks.filter(
    (block): block is AssistantToolCallBlock =>
      block.turnId === turnId && block.type === "tool_call",
  );

const insertBlockForTurn = (
  blocks: AssistantBlock[],
  turnId: string,
  block: AssistantBlock,
) => {
  const lastTurnBlockIndex = getLastTurnBlockIndex(blocks, turnId);
  if (lastTurnBlockIndex === -1) {
    blocks.push(block);
    return;
  }

  blocks.splice(lastTurnBlockIndex + 1, 0, block);
};

const buildLegacyContentBlocks = (
  blocks: AssistantBlock[],
): ResponseContentBlock[] =>
  blocks.map((block) => {
    if (block.type === "text") {
      return {
        type: "text",
        content: block.content,
      };
    }

    if (block.type === "reasoning") {
      return {
        type: "reasoning",
        content: block.content,
        startTime: block.startTime,
        endTime: block.endTime,
        duration: block.duration,
      };
    }

    return {
      type: "tool_calls",
      executions: [createSyntheticExecution(block.toolCall, block.execution)],
    };
  });

export const syncAssistantLegacyFields = (message: ResponseMessage) => {
  const blocks = message.assistant_blocks || [];
  const textBlocks = blocks.filter(
    (block): block is AssistantTextBlock => block.type === "text",
  );
  const reasoningBlocks = blocks.filter(
    (block): block is AssistantReasoningBlock => block.type === "reasoning",
  );
  const toolBlocks = blocks.filter(
    (block): block is AssistantToolCallBlock => block.type === "tool_call",
  );

  message.content = textBlocks.map((block) => block.content).join("\n\n");
  message.reasoning_content = reasoningBlocks
    .map((block) => block.content)
    .join("\n\n");

  const lastToolTurnId = toolBlocks[toolBlocks.length - 1]?.turnId;
  message.tool_calls = lastToolTurnId
    ? toolBlocks
        .filter((block) => block.turnId === lastToolTurnId)
        .map((block) => block.toolCall)
    : undefined;
  message.tool_executions = toolBlocks.map((block) =>
    createSyntheticExecution(block.toolCall, block.execution),
  );
  message.content_blocks = buildLegacyContentBlocks(blocks);
};

export const createAssistantMessage = (
  initial?: Partial<ResponseMessage>,
): ResponseMessage => {
  const message: ResponseMessage = {
    role: Role.Assistant,
    content: "",
    reasoning_content: "",
    tool_executions: [],
    tool_calls: undefined,
    assistant_blocks: [],
    content_blocks: [],
    ...initial,
  };
  syncAssistantLegacyFields(message);
  return message;
};

export const applyAssistantTextSnapshot = (
  message: ResponseMessage,
  turnId: string,
  fullText: string,
) => {
  const blocks = ensureAssistantBlocks(message);
  const textBlocks = getTextBlocksForTurn(blocks, turnId);
  const textBlock = textBlocks[textBlocks.length - 1];

  if (textBlock) {
    textBlock.content = fullText;
    textBlock.state = "streaming";
    syncAssistantLegacyFields(message);
    return;
  }

  if (!fullText.trim()) {
    syncAssistantLegacyFields(message);
    return;
  }

  if (getToolBlocksForTurn(blocks, turnId).length > 0) {
    syncAssistantLegacyFields(message);
    return;
  }

  insertBlockForTurn(blocks, turnId, {
    id: createTextBlockId(turnId),
    turnId,
    type: "text",
    state: "streaming",
    content: fullText,
  });
  syncAssistantLegacyFields(message);
};

export const applyAssistantReasoningSnapshot = (
  message: ResponseMessage,
  turnId: string,
  fullReasoning: string,
  now = Date.now(),
) => {
  const blocks = ensureAssistantBlocks(message);
  const reasoningBlocks = getReasoningBlocksForTurn(blocks, turnId);
  const reasoningBlock = reasoningBlocks[reasoningBlocks.length - 1];

  if (reasoningBlock) {
    reasoningBlock.content = fullReasoning;
    reasoningBlock.state = "streaming";
    syncAssistantLegacyFields(message);
    return;
  }

  if (!fullReasoning.trim()) {
    syncAssistantLegacyFields(message);
    return;
  }

  if (getToolBlocksForTurn(blocks, turnId).length > 0) {
    syncAssistantLegacyFields(message);
    return;
  }

  const nextBlock: AssistantReasoningBlock = {
    id: createReasoningBlockId(turnId),
    turnId,
    type: "reasoning",
    state: "streaming",
    content: fullReasoning,
    startTime: now,
  };

  const turnBlockIndices = getTurnBlockIndices(blocks, turnId);
  const firstTextIndex = turnBlockIndices.find(
    ({ block }) => block.type === "text",
  )?.index;
  if (typeof firstTextIndex === "number") {
    blocks.splice(firstTextIndex, 0, nextBlock);
  } else {
    insertBlockForTurn(blocks, turnId, nextBlock);
  }
  syncAssistantLegacyFields(message);
};

export const applyAssistantToolCallsSnapshot = (
  message: ResponseMessage,
  turnId: string,
  executions: ToolCallExecutionState[],
  toolCalls?: ToolCallPayload[],
) => {
  const blocks = ensureAssistantBlocks(message);
  const toolCallIds = new Set<string>();

  toolCalls?.forEach((toolCall) => {
    toolCallIds.add(toolCall.id);
    const existingBlock = blocks.find(
      (block): block is AssistantToolCallBlock =>
        block.type === "tool_call" &&
        block.turnId === turnId &&
        block.toolCall.id === toolCall.id,
    );
    if (existingBlock) {
      existingBlock.toolCall = toolCall;
      existingBlock.state = "streaming";
      return;
    }

    insertBlockForTurn(blocks, turnId, {
      id: toolCall.id,
      turnId,
      type: "tool_call",
      state: "streaming",
      toolCall,
    });
  });

  executions.forEach((execution) => {
    toolCallIds.add(execution.toolCallId);
    const existingBlock = blocks.find(
      (block): block is AssistantToolCallBlock =>
        block.type === "tool_call" &&
        block.turnId === turnId &&
        block.toolCall.id === execution.toolCallId,
    );
    if (existingBlock) {
      existingBlock.execution = execution;
      existingBlock.state = "streaming";
      return;
    }

    insertBlockForTurn(blocks, turnId, {
      id: execution.toolCallId,
      turnId,
      type: "tool_call",
      state: "streaming",
      toolCall: {
        id: execution.toolCallId,
        type: "function",
        function: {
          name: execution.toolName,
          arguments: execution.input,
        },
      },
      execution,
    });
  });

  // 同一 turn 内若已有工具块，不允许再因为累计 full 追加新的 text 块。
  // 这里不删除已有 text，只负责建立清晰的 turn 内工具边界。
  if (toolCallIds.size > 0) {
    const reasoningBlocks = getReasoningBlocksForTurn(blocks, turnId);
    reasoningBlocks.forEach((block) => {
      if (block.startTime && !block.endTime) {
        block.endTime = Date.now();
        block.duration = block.endTime - block.startTime;
      }
    });
  }

  syncAssistantLegacyFields(message);
};

export const finalizeAssistantTurn = (
  message: ResponseMessage,
  turnId: string,
  finishReason?: string | null,
) => {
  const blocks = ensureAssistantBlocks(message);
  blocks.forEach((block) => {
    if (block.turnId === turnId) {
      block.state = "final";
      if (
        block.type === "reasoning" &&
        block.startTime &&
        !block.endTime &&
        finishReason !== "cancelled"
      ) {
        block.endTime = Date.now();
        block.duration = block.endTime - block.startTime;
      }
    }
  });
  syncAssistantLegacyFields(message);
};

export const buildAssistantHistoryMessages = (
  message: ResponseMessage,
): RequestMessage[] => {
  const assistantBlocks = message.assistant_blocks;
  if (!assistantBlocks?.length) {
    const requestMessage: RequestMessage = {
      role: message.role,
      content: [{ type: "text", text: message.content }],
    };
    if (message.tool_calls?.length) {
      requestMessage.tool_calls = message.tool_calls;
    }

    const toolMessages = (message.tool_executions || [])
      .map((execution): RequestMessage | null => {
        const outputText = buildToolResultText(execution);
        if (!outputText) {
          return null;
        }
        return {
          role: Role.Tool,
          content: [{ type: "text", text: outputText }],
          tool_call_id: execution.toolCallId,
          name: execution.toolName,
        };
      })
      .filter(
        (value): value is RequestMessage =>
          value !== null && value !== undefined,
      );

    return [requestMessage, ...toolMessages];
  }

  const turnIds: string[] = [];
  assistantBlocks.forEach((block) => {
    if (!turnIds.includes(block.turnId)) {
      turnIds.push(block.turnId);
    }
  });

  return turnIds.flatMap((turnId): RequestMessage[] => {
    const turnBlocks = assistantBlocks.filter(
      (block) => block.turnId === turnId,
    );
    const text = turnBlocks
      .filter((block): block is AssistantTextBlock => block.type === "text")
      .map((block) => block.content)
      .join("\n\n");
    const toolBlocks = turnBlocks.filter(
      (block): block is AssistantToolCallBlock => block.type === "tool_call",
    );

    if (toolBlocks.length > 0) {
      const assistantToolMessage: RequestMessage = {
        role: Role.Assistant,
        content: text ? [{ type: "text", text }] : "",
        tool_calls: toolBlocks.map((block) => block.toolCall),
      };

      const toolMessages = toolBlocks
        .map((block): RequestMessage | null => {
          const execution = block.execution;
          if (!execution) {
            return null;
          }

          const outputText = buildToolResultText(execution);
          if (!outputText) {
            return null;
          }

          return {
            role: Role.Tool,
            content: [{ type: "text", text: outputText }],
            tool_call_id: execution.toolCallId,
            name: execution.toolName,
          };
        })
        .filter(
          (value): value is RequestMessage =>
            value !== null && value !== undefined,
        );

      return [assistantToolMessage, ...toolMessages];
    }

    if (text) {
      return [buildTextMessage(text)];
    }

    return [];
  });
};

export const limitHistoryMessageGroups = (
  groups: RequestMessage[][],
  limit: number,
): RequestMessage[] => {
  if (limit <= 0) {
    return [];
  }

  const selectedGroups: RequestMessage[][] = [];
  let selectedCount = 0;

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index].filter(Boolean);
    if (group.length === 0) {
      continue;
    }

    if (selectedGroups.length > 0 && selectedCount + group.length > limit) {
      break;
    }

    selectedGroups.unshift(group);
    selectedCount += group.length;
  }

  return selectedGroups.flat();
};
