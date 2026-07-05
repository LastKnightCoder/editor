import type { ToolCallExecutionState, ToolCallPayload } from "@/types";

export type CodexMappedEvent =
  | {
      type: "text-delta";
      delta: string;
      responseText: string;
      turnId?: string;
    }
  | {
      type: "reasoning-delta";
      delta: string;
      reasoningText: string;
      turnId?: string;
    }
  | {
      type: "tool-calls-update";
      executions: ToolCallExecutionState[];
      toolCalls: ToolCallPayload[];
      turnId?: string;
    }
  | {
      type: "thread-started";
      threadId: string;
    }
  | {
      type: "turn-completed";
      turnId?: string;
    }
  | {
      type: "error";
      error: Error;
      turnId?: string;
    };

type CodexItem = {
  id?: string;
  type?: string;
  status?: string;
  text?: string;
  content?: unknown;
  arguments?: unknown;
  result?: unknown;
  output?: unknown;
  aggregated_output?: unknown;
  command?: unknown;
  cwd?: unknown;
  working_directory?: unknown;
  workingDirectory?: unknown;
  shell?: unknown;
  error?: unknown;
  server?: string;
  tool?: string;
  name?: string;
  query?: string;
  [key: string]: unknown;
};

type CodexEvent = {
  type?: string;
  item?: CodexItem;
  thread_id?: string;
  threadId?: string;
  id?: string;
  error?: unknown;
  [key: string]: unknown;
};

const CODEX_TURN_ID = "codex";
const createCodexSegmentTurnId = (segmentIndex: number) =>
  `${CODEX_TURN_ID}:${segmentIndex}`;

const stringifyInput = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "{}";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const extractTextContent = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(extractTextContent).filter(Boolean).join("\n");
  }

  if (!value || typeof value !== "object") {
    return value == null ? "" : String(value);
  }

  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  if (typeof record.content === "string") {
    return record.content;
  }
  if (Array.isArray(record.content)) {
    return extractTextContent(record.content);
  }

  try {
    return JSON.stringify(record, null, 2);
  } catch {
    return String(value);
  }
};

const extractItemText = (item: CodexItem): string => {
  if (typeof item.text === "string") {
    return item.text;
  }
  return extractTextContent(item.content);
};

const shellQuoteArg = (arg: string): string => {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, `'\\''`)}'`;
};

const extractCommandText = (item: CodexItem): string => {
  if (typeof item.command === "string" && item.command.trim()) {
    return item.command;
  }

  const directKeys = [
    "cmd",
    "command_line",
    "commandLine",
    "shell_command",
    "shellCommand",
  ];
  for (const key of directKeys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  const arrayKeys = ["argv", "args", "command_args", "commandArgs"];
  for (const key of arrayKeys) {
    const value = item[key];
    if (Array.isArray(value) && value.length > 0) {
      return value.map((part) => shellQuoteArg(String(part))).join(" ");
    }
  }

  const args = item.arguments;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return extractCommandText(args as CodexItem);
  }

  return "";
};

const normalizeError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message =
      typeof record.message === "string"
        ? record.message
        : extractTextContent(record);
    return new Error(message || "Codex 请求失败");
  }

  return new Error(typeof error === "string" ? error : "Codex 请求失败");
};

const mapCodexStatus = (
  status: string | undefined,
): ToolCallExecutionState["status"] => {
  switch (status) {
    case "in_progress":
    case "running":
    case "started":
      return "executing";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "completed":
    case "success":
    case undefined:
      return "success";
    default:
      return "pending";
  }
};

const buildResultOutput = (item: CodexItem): string => {
  if (item.error) {
    return extractTextContent(item.error);
  }

  const result = item.result ?? item.output ?? item.aggregated_output;
  if (!result) {
    return "";
  }

  if (typeof result === "string") {
    return result;
  }

  if (typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (Array.isArray(record.content)) {
      const contentText = extractTextContent(record.content);
      if (contentText) {
        return contentText;
      }
    }
    if (record.structured_content) {
      return extractTextContent(record.structured_content);
    }
  }

  return extractTextContent(result);
};

export const mapCodexItemToToolExecution = (
  item: CodexItem,
): ToolCallExecutionState => {
  const codexItemType = item.type || "unknown";
  const commandText =
    codexItemType === "command_execution" ? extractCommandText(item) : "";
  const toolName =
    codexItemType === "web_search"
      ? "web_search"
      : String(item.tool || item.name || codexItemType);
  const input =
    codexItemType === "web_search"
      ? stringifyInput({ query: item.query ?? extractItemText(item) })
      : codexItemType === "command_execution"
        ? stringifyInput({
            command: commandText || undefined,
            cwd:
              item.cwd ??
              item.working_directory ??
              item.workingDirectory ??
              undefined,
            shell: item.shell ?? undefined,
          })
        : stringifyInput(item.arguments ?? {});
  const status = mapCodexStatus(item.status);
  const output =
    codexItemType === "web_search"
      ? String(item.query ?? extractItemText(item) ?? "")
      : buildResultOutput(item);

  return {
    toolCallId: String(item.id || `${codexItemType}:${toolName}`),
    toolName,
    status,
    input,
    output,
    error: status === "failed" ? output || "Codex 工具调用失败" : undefined,
    timestamp: Date.now(),
    metadata: {
      codexItemType,
      server: item.server,
      command: commandText || undefined,
      rawItem: item,
      render: {
        rendererKey: `codex.${codexItemType}`,
        payload: item,
      },
    },
  };
};

export const mapCodexItemToToolCall = (item: CodexItem): ToolCallPayload => {
  const execution = mapCodexItemToToolExecution(item);
  return {
    id: execution.toolCallId,
    type: "function",
    function: {
      name: execution.toolName,
      arguments: execution.input,
    },
  };
};

export const createCodexEventAdapter = () => {
  let segmentIndex = 0;
  let lastItemKind: "none" | "text" | "reasoning" | "tool" = "none";
  const textByTurn = new Map<string, string>();
  const reasoningByTurn = new Map<string, string>();
  const toolTurnIds = new Map<string, string>();
  const executionsByTurn = new Map<
    string,
    Map<string, ToolCallExecutionState>
  >();
  const toolCallsByTurn = new Map<string, Map<string, ToolCallPayload>>();

  const getCurrentTurnId = () => createCodexSegmentTurnId(segmentIndex);

  const startTextualSegmentAfterTool = () => {
    if (lastItemKind === "tool") {
      segmentIndex += 1;
    }
  };

  const getToolTurnId = (item: CodexItem) => {
    const itemId = String(
      item.id || `${item.type || "tool"}:${toolTurnIds.size}`,
    );
    const existingTurnId = toolTurnIds.get(itemId);
    if (existingTurnId) {
      return existingTurnId;
    }
    const turnId = getCurrentTurnId();
    toolTurnIds.set(itemId, turnId);
    return turnId;
  };

  const getTurnExecutionMap = (turnId: string) => {
    const existing = executionsByTurn.get(turnId);
    if (existing) {
      return existing;
    }
    const next = new Map<string, ToolCallExecutionState>();
    executionsByTurn.set(turnId, next);
    return next;
  };

  const getTurnToolCallMap = (turnId: string) => {
    const existing = toolCallsByTurn.get(turnId);
    if (existing) {
      return existing;
    }
    const next = new Map<string, ToolCallPayload>();
    toolCallsByTurn.set(turnId, next);
    return next;
  };

  const mapItem = (item: CodexItem): CodexMappedEvent[] => {
    if (item.type === "agent_message") {
      startTextualSegmentAfterTool();
      const turnId = getCurrentTurnId();
      const delta = extractItemText(item);
      const responseText = `${textByTurn.get(turnId) || ""}${delta}`;
      textByTurn.set(turnId, responseText);
      lastItemKind = "text";
      return [
        {
          type: "text-delta",
          delta,
          responseText,
          turnId,
        },
      ];
    }

    if (item.type === "reasoning") {
      startTextualSegmentAfterTool();
      const turnId = getCurrentTurnId();
      const delta = extractItemText(item);
      const reasoningText = `${reasoningByTurn.get(turnId) || ""}${delta}`;
      reasoningByTurn.set(turnId, reasoningText);
      lastItemKind = "reasoning";
      return [
        {
          type: "reasoning-delta",
          delta,
          reasoningText,
          turnId,
        },
      ];
    }

    if (
      item.type === "mcp_tool_call" ||
      item.type === "web_search" ||
      item.type === "todo_list" ||
      item.type === "command_execution" ||
      item.type === "file_change"
    ) {
      const turnId = getToolTurnId(item);
      const execution = mapCodexItemToToolExecution(item);
      const toolCall = mapCodexItemToToolCall(item);
      const turnExecutions = getTurnExecutionMap(turnId);
      const turnToolCalls = getTurnToolCallMap(turnId);
      turnExecutions.set(execution.toolCallId, execution);
      turnToolCalls.set(toolCall.id, toolCall);
      lastItemKind = "tool";
      return [
        {
          type: "tool-calls-update",
          executions: Array.from(turnExecutions.values()),
          toolCalls: Array.from(turnToolCalls.values()),
          turnId,
        },
      ];
    }

    return [];
  };

  return {
    mapEvent(event: CodexEvent): CodexMappedEvent[] {
      if (event.type === "thread.started") {
        const threadId = event.thread_id || event.threadId || event.id;
        return threadId
          ? [{ type: "thread-started", threadId: String(threadId) }]
          : [];
      }

      if (event.type === "turn.completed" || event.type === "turn.finished") {
        return [{ type: "turn-completed", turnId: CODEX_TURN_ID }];
      }

      if (
        event.type === "turn.failed" ||
        event.type === "turn.error" ||
        event.type === "error"
      ) {
        return [
          {
            type: "error",
            error: normalizeError(event.error ?? event),
          },
        ];
      }

      if (
        event.type === "item.completed" ||
        event.type === "item.updated" ||
        event.type === "item.started"
      ) {
        return event.item ? mapItem(event.item) : [];
      }

      return [];
    },
  };
};
