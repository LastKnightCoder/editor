import { Role } from "@/constants";
import { v4 as uuidv4 } from "uuid";
import type {
  AssistantBlock,
  AssistantReasoningBlock,
  AssistantTextBlock,
  AssistantToolCallBlock,
  ChatSessionMessage,
  ResponseContentBlock,
  ResponseMessage,
  ToolCallExecutionState,
  ToolCallPayload,
} from "@/types";

export const CHAT_MESSAGE_SCHEMA_VERSION = 3;

const SYNTHETIC_MIGRATION_TURN_ID = "turn:migrated:0";

export const createChatMessageClientId = () => `msg:${uuidv4()}`;

type LegacyResponseMessage = ResponseMessage & {
  tool_executions?: ToolCallExecutionState[];
  content_blocks?: ResponseContentBlock[];
};

const ensureMessageClientId = <T extends ChatSessionMessage>(
  message: T,
): { message: T; changed: boolean } => {
  if (typeof message.clientId === "string" && message.clientId.length > 0) {
    return { message, changed: false };
  }

  return {
    message: {
      ...message,
      clientId: createChatMessageClientId(),
    },
    changed: true,
  };
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

const createSyntheticToolCall = (
  execution: ToolCallExecutionState,
): ToolCallPayload => ({
  id: execution.toolCallId,
  type: "function",
  function: {
    name: execution.toolName,
    arguments: execution.input,
  },
});

const deriveAssistantFields = (blocks: AssistantBlock[]) => {
  const textBlocks = blocks.filter(
    (block): block is AssistantTextBlock => block.type === "text",
  );
  const reasoningBlocks = blocks.filter(
    (block): block is AssistantReasoningBlock => block.type === "reasoning",
  );
  const toolBlocks = blocks.filter(
    (block): block is AssistantToolCallBlock => block.type === "tool_call",
  );

  const lastToolTurnId = toolBlocks[toolBlocks.length - 1]?.turnId;

  return {
    content: textBlocks.map((block) => block.content).join("\n\n"),
    reasoning_content: reasoningBlocks
      .map((block) => block.content)
      .join("\n\n"),
    tool_calls: lastToolTurnId
      ? toolBlocks
          .filter((block) => block.turnId === lastToolTurnId)
          .map((block) => block.toolCall)
      : undefined,
  };
};

const buildBlocksFromLegacyContentBlocks = (
  message: LegacyResponseMessage,
): AssistantBlock[] => {
  const toolCallsById = new Map(
    (message.tool_calls || []).map((toolCall) => [toolCall.id, toolCall]),
  );

  return (message.content_blocks || []).flatMap<AssistantBlock>(
    (block, blockIndex) => {
      if (block.type === "text") {
        return [
          {
            id: `${SYNTHETIC_MIGRATION_TURN_ID}:text:${blockIndex}`,
            turnId: SYNTHETIC_MIGRATION_TURN_ID,
            type: "text",
            state: "final",
            content: block.content,
          },
        ];
      }

      if (block.type === "reasoning") {
        return [
          {
            id: `${SYNTHETIC_MIGRATION_TURN_ID}:reasoning:${blockIndex}`,
            turnId: SYNTHETIC_MIGRATION_TURN_ID,
            type: "reasoning",
            state: "final",
            content: block.content,
            startTime: block.startTime,
            endTime: block.endTime,
            duration: block.duration,
          },
        ];
      }

      return block.executions.map((execution, executionIndex) => ({
        id: `${execution.toolCallId}:${blockIndex}:${executionIndex}`,
        turnId: SYNTHETIC_MIGRATION_TURN_ID,
        type: "tool_call" as const,
        state: "final" as const,
        toolCall:
          toolCallsById.get(execution.toolCallId) ||
          createSyntheticToolCall(execution),
        execution,
      }));
    },
  );
};

const buildBlocksFromLegacyFields = (
  message: LegacyResponseMessage,
): AssistantBlock[] => {
  if (message.content_blocks?.length) {
    return buildBlocksFromLegacyContentBlocks(message);
  }

  const blocks: AssistantBlock[] = [];
  if (
    typeof message.reasoning_content === "string" &&
    message.reasoning_content
  ) {
    blocks.push({
      id: `${SYNTHETIC_MIGRATION_TURN_ID}:reasoning`,
      turnId: SYNTHETIC_MIGRATION_TURN_ID,
      type: "reasoning",
      state: "final",
      content: message.reasoning_content,
    });
  }

  const seenToolCallIds = new Set<string>();
  (message.tool_calls || []).forEach((toolCall) => {
    seenToolCallIds.add(toolCall.id);
    blocks.push({
      id: toolCall.id,
      turnId: SYNTHETIC_MIGRATION_TURN_ID,
      type: "tool_call",
      state: "final",
      toolCall,
      execution: (message.tool_executions || []).find(
        (execution) => execution.toolCallId === toolCall.id,
      ),
    });
  });

  (message.tool_executions || []).forEach((execution) => {
    if (seenToolCallIds.has(execution.toolCallId)) {
      return;
    }

    blocks.push({
      id: execution.toolCallId,
      turnId: SYNTHETIC_MIGRATION_TURN_ID,
      type: "tool_call",
      state: "final",
      toolCall: createSyntheticToolCall(execution),
      execution,
    });
  });

  if (typeof message.content === "string" && message.content) {
    blocks.push({
      id: `${SYNTHETIC_MIGRATION_TURN_ID}:text`,
      turnId: SYNTHETIC_MIGRATION_TURN_ID,
      type: "text",
      state: "final",
      content: message.content,
    });
  }

  return blocks;
};

const equalToolCalls = (
  left?: ToolCallPayload[],
  right?: ToolCallPayload[],
): boolean => JSON.stringify(left || []) === JSON.stringify(right || []);

export const migrateAssistantMessage = (
  message: LegacyResponseMessage,
): { message: ResponseMessage; changed: boolean } => {
  const assistantBlocks = message.assistant_blocks?.length
    ? message.assistant_blocks
    : buildBlocksFromLegacyFields(message);
  const derived = deriveAssistantFields(assistantBlocks);
  const nextMessage: ResponseMessage = {
    clientId: message.clientId,
    role: Role.Assistant,
    content: derived.content,
    reasoning_content: derived.reasoning_content,
    tool_calls: derived.tool_calls,
    assistant_blocks: assistantBlocks,
    usage: message.usage,
  };

  const changed =
    !message.assistant_blocks?.length ||
    "tool_executions" in message ||
    "content_blocks" in message ||
    message.content !== nextMessage.content ||
    (message.reasoning_content || "") !==
      (nextMessage.reasoning_content || "") ||
    !equalToolCalls(message.tool_calls, nextMessage.tool_calls);

  return {
    message: nextMessage,
    changed,
  };
};

export const migrateChatSessionMessages = (
  messages: ChatSessionMessage[],
): { messages: ChatSessionMessage[]; changed: boolean } => {
  let changed = false;

  const nextMessages = messages.map((message) => {
    if (message.role !== Role.Assistant) {
      const ensured = ensureMessageClientId(message);
      changed = changed || ensured.changed;
      return ensured.message;
    }

    const migrated = migrateAssistantMessage(message as LegacyResponseMessage);
    const ensured = ensureMessageClientId(migrated.message);
    changed = changed || migrated.changed || ensured.changed;
    return ensured.message;
  });

  return {
    messages: nextMessages,
    changed,
  };
};

export const getAssistantToolExecutionsFromBlocks = (
  blocks: AssistantBlock[],
): ToolCallExecutionState[] =>
  blocks
    .filter(
      (block): block is AssistantToolCallBlock => block.type === "tool_call",
    )
    .map((block) => createSyntheticExecution(block.toolCall, block.execution));
