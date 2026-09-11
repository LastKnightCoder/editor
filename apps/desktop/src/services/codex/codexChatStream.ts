import { off, on } from "@/electron";
import { startCodexStream, cancelCodexStream, sendCodexMcpResponse } from "@/commands";
import toolRegistry, { ensureToolingReady } from "@/tools";
import type { ToolCallPayload } from "@/types";

import type { CodexMappedEvent } from "./codexEventAdapter";
import { createCodexEventAdapter } from "./codexEventAdapter";
import type { CodexInputItem } from "./codexInputAdapter";

const CODEX_EVENT_CHANNEL = "codex-agent:event";
const CODEX_MCP_REQUEST_CHANNEL = "codex-mcp-bridge:request";

interface CodexAgentEventPayload {
  requestId: number;
  runId?: string;
  sessionKey?: string;
  event: Record<string, unknown>;
}

interface CodexAgentStreamResponse {
  requestId: number;
}

interface CodexBridgeToolExecutionRequest {
  requestId: number;
  toolRequestId: string;
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface CodexMcpToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

type ExternalMcpToolExecutor = (
  toolCall: ToolCallPayload
) => Promise<{ content: string; metadata?: Record<string, unknown> } | null>;

interface CodexStreamOptions {
  input: string | CodexInputItem[];
  runId?: string;
  sessionKey?: string;
  agentSessionId?: string | null;
  workingDirectory?: string | null;
  externalMcpTools?: CodexMcpToolDefinition[];
  executeExternalMcpTool?: ExternalMcpToolExecutor;
  signal?: AbortSignal;
  onEvent: (event: CodexMappedEvent) => void | Promise<void>;
}

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
};

const createAbortError = () => {
  const error = new Error("Codex 请求已取消");
  error.name = "AbortError";
  return error;
};

const summarizeToolsBySource = (tools: Array<{ name: string; source: string; enabled: boolean }>) =>
  tools.reduce<Record<string, { enabled: number; total: number }>>((summary, tool) => {
    const current = summary[tool.source] ?? { enabled: 0, total: 0 };
    current.total += 1;
    if (tool.enabled) {
      current.enabled += 1;
    }
    summary[tool.source] = current;
    return summary;
  }, {});

const getCodexMcpToolsSnapshot = () => {
  ensureToolingReady();
  const registeredTools = toolRegistry.getRegisteredTools();
  const enabledTools = registeredTools.filter(tool => tool.enabled);
  const snapshot = enabledTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  console.info("[Codex MCP] renderer tools snapshot", {
    registeredCount: registeredTools.length,
    enabledCount: enabledTools.length,
    disabledCount: registeredTools.length - enabledTools.length,
    sources: summarizeToolsBySource(registeredTools),
    enabledToolNames: enabledTools.map(tool => tool.name),
  });

  return snapshot;
};

export const streamCodexChat = async ({
  input,
  runId,
  sessionKey,
  agentSessionId,
  workingDirectory,
  externalMcpTools = [],
  executeExternalMcpTool,
  signal,
  onEvent,
}: CodexStreamOptions): Promise<void> => {
  const adapter = createCodexEventAdapter();
  const externalToolNames = new Set(externalMcpTools.map(tool => tool.name));
  const pendingToolRequests: CodexBridgeToolExecutionRequest[] = [];
  let activeRequestId: number | null = null;
  let settled = false;
  let resolveStream: (() => void) | null = null;
  let rejectStream: ((error: Error) => void) | null = null;

  const cleanup = () => {
    off(CODEX_EVENT_CHANNEL, handleEvent);
    off(CODEX_MCP_REQUEST_CHANNEL, handleToolRequest);
    signal?.removeEventListener("abort", handleAbort);
  };

  const executeToolRequest = async (payload: CodexBridgeToolExecutionRequest) => {
    if (payload.requestId !== activeRequestId) {
      return;
    }

    console.info("[Codex MCP] renderer received tool request", {
      requestId: payload.requestId,
      toolRequestId: payload.toolRequestId,
      toolCallId: payload.toolCallId,
      toolName: payload.toolName,
      argumentKeys: Object.keys(payload.arguments ?? {}),
    });

    try {
      const toolCall: ToolCallPayload = {
        id: payload.toolCallId,
        type: "function",
        function: {
          name: payload.toolName,
          arguments: safeStringify(payload.arguments),
        },
      };

      const result =
        executeExternalMcpTool && externalToolNames.has(payload.toolName)
          ? await executeExternalMcpTool(toolCall)
          : await (async () => {
              ensureToolingReady();
              return toolRegistry.executeToolCall(toolCall);
            })();

      console.info("[Codex MCP] renderer tool request succeeded", {
        requestId: payload.requestId,
        toolRequestId: payload.toolRequestId,
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        hasContent: Boolean(result?.content),
        hasMetadata: Boolean(result?.metadata),
      });
      sendCodexMcpResponse({
        requestId: payload.requestId,
        toolRequestId: payload.toolRequestId,
        ok: true,
        content: result?.content || "工具执行成功，但未返回结果",
        metadata: result?.metadata,
      });
    } catch (error) {
      console.warn("[Codex MCP] renderer tool request failed", {
        requestId: payload.requestId,
        toolRequestId: payload.toolRequestId,
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        error: error instanceof Error ? error.message : error,
      });
      sendCodexMcpResponse({
        requestId: payload.requestId,
        toolRequestId: payload.toolRequestId,
        ok: false,
        error: error instanceof Error ? error.message : "工具执行失败",
      });
    }
  };

  const handleToolRequest = (_event: unknown, payload: CodexBridgeToolExecutionRequest) => {
    if (activeRequestId === null) {
      pendingToolRequests.push(payload);
      return;
    }
    void executeToolRequest(payload);
  };

  const handleAbort = () => {
    if (settled) {
      return;
    }
    if (activeRequestId !== null) {
      void cancelCodexStream({
        requestId: activeRequestId,
        runId,
      });
    }
    settled = true;
    cleanup();
    rejectStream?.(createAbortError());
  };

  const handleEvent = (_event: unknown, payload: CodexAgentEventPayload) => {
    if (payload.requestId !== activeRequestId) {
      return;
    }
    if ((runId && payload.runId !== runId) || (sessionKey && payload.sessionKey !== sessionKey))
      return;

    if (payload.event.type === "done") {
      settled = true;
      cleanup();
      resolveStream?.();
      return;
    }

    const mappedEvents = adapter.mapEvent(payload.event as any);
    mappedEvents.forEach(event => void onEvent(event));

    if (payload.event.type === "error") {
      settled = true;
      cleanup();
      rejectStream?.(
        new Error(
          typeof payload.event.message === "string" ? payload.event.message : "Codex 请求失败"
        )
      );
    }
  };

  const streamPromise = new Promise<void>((resolve, reject) => {
    resolveStream = resolve;
    rejectStream = reject;
  });

  on(CODEX_EVENT_CHANNEL, handleEvent);
  on(CODEX_MCP_REQUEST_CHANNEL, handleToolRequest);
  signal?.addEventListener("abort", handleAbort);

  try {
    const mcpTools = [...getCodexMcpToolsSnapshot(), ...externalMcpTools];
    console.info("[Codex MCP] renderer starting Codex stream", {
      agentSessionId: agentSessionId ?? null,
      mcpToolCount: mcpTools.length,
      mcpToolNames: mcpTools.map(tool => tool.name),
    });

    const response = await startCodexStream<CodexAgentStreamResponse>({
      input,
      runId,
      sessionKey,
      agentSessionId,
      workingDirectory,
      mcpTools,
    });
    activeRequestId = response.requestId;
    pendingToolRequests.splice(0).forEach(payload => {
      void executeToolRequest(payload);
    });
    console.info("[Codex MCP] renderer Codex stream request created", {
      requestId: activeRequestId,
      mcpToolCount: mcpTools.length,
    });

    if (signal?.aborted) {
      handleAbort();
    }

    await streamPromise;
  } finally {
    if (!settled) {
      cleanup();
    }
  }
};
