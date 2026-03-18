import {
  RequestMessage,
  ReasoningEffort,
  ToolCallPayload,
  ToolExecutionMetadata,
  ToolCallExecutionState,
  ToolExecutionResult,
} from "@/types";
import { useMemoizedFn } from "ahooks";
import { chat, stream } from "@/commands";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import { getModelRequestOverrides } from "@/utils/model-overrides";
import { Role } from "@/constants";
import { normalizeRequestMessages } from "@/services/chatMessageNormalization";
import toolRegistry, { ensureToolingReady } from "@/tools";
import { toolIntegrationRegistry } from "@/tools/toolIntegrationRegistry";
import {
  filterConflictingToolSchemas,
  shouldSkipToolTimeout,
} from "@/tools/toolRuntimePolicy";

ensureToolingReady();

export interface ChatRuntimeNotice {
  level: "warning" | "error";
  code:
    | "missing_provider_config"
    | "missing_model_config"
    | "tool_calls_exceeded"
    | "tool_mode_disabled"
    | "chat_request_failed";
  message: string;
}

interface IChatStreamOptions {
  onFinish?: (
    content: string,
    reasoning_content: string,
    res: Response,
  ) => void;
  onUpdate?: (
    responseText: string,
    fetchText: string,
    reasoningText?: string,
  ) => void;
  onReasoning?: (responseText: string, fetchText: string) => void;
  onError?: (e: Error) => void;
  onNotice?: (notice: ChatRuntimeNotice) => void;
  onController?: (controller: AbortController) => void;
  reasoningEffort?: ReasoningEffort;
  onToolCallsUpdate?: (executions: ToolCallExecutionState[]) => void;
  onToolCallsDelta?: (toolCalls: ToolCallPayload[]) => void;
  enableTools?: boolean;
  /** 会话键，用于工具跨页面/重启恢复 */
  conversationKey?: string;
  /** 当前轮次工具执行附加上下文 */
  toolContext?: ToolExecutionMetadata;
  /** 延迟 assistant 正文到 onFinish 才提交，避免工具审阅前出现正文 */
  deferAssistantTextUntilFinish?: boolean;
  /** 禁用 requestAnimationFrame 动画缓冲，SSE 数据直接透传回调 */
  disableAnimation?: boolean;
}

export interface ChatStreamCoreOptions {
  providerConfig: ProviderConfig;
  modelConfig: ModelConfig;
  messages: RequestMessage[];
  // 流式回调
  onFinish?: (content: string, reasoning_content: string) => void;
  onUpdate?: (responseText: string, fetchText: string) => void;
  onReasoning?: (responseText: string, fetchText: string) => void;
  onError?: (e: Error) => void;
  onNotice?: (notice: ChatRuntimeNotice) => void;
  onController?: (controller: AbortController) => void;
  onToolCallsUpdate?: (executions: ToolCallExecutionState[]) => void;
  // 配置选项
  reasoningEffort?: ReasoningEffort;
  enableTools?: boolean;
  conversationKey?: string;
  toolContext?: ToolExecutionMetadata;
  deferAssistantTextUntilFinish?: boolean;
  // 外部工具扩展
  additionalTools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  // 自定义工具执行器（用于路由到外部执行，如浏览器扩展）
  executeToolCall?: (
    call: ToolCallPayload,
    options?: {
      signal?: AbortSignal;
      conversationKey?: string;
      toolContext?: ToolExecutionMetadata;
    },
  ) => Promise<ToolExecutionResult | null>;
  /** 禁用 requestAnimationFrame 动画缓冲，SSE 数据直接透传回调（用于 WebSocket 转发场景） */
  disableAnimation?: boolean;
}

const MAX_TOOL_CALL_LOOPS = 15; // 最大工具调用循环次数
const MAX_EXECUTION_RETRY = 2; // 执行失败（瞬时故障）最多自动重试次数
const TOOL_EXECUTION_TIMEOUT = 30000; // 单个工具执行超时时间 30 秒

/**
 * 判断执行错误是否为可自动重试的瞬时故障（网络、超时等）。
 * 参数错误不在此判断——参数错误由 toolRegistry 返回 isParameterError，走反馈模型路径。
 */
const isTransientError = (error: Error): boolean => {
  const msg = error.message.toLowerCase();
  const transientPatterns = [
    "timeout",
    "timed out",
    "econnrefused",
    "econnreset",
    "enotfound",
    "network",
    "fetch failed",
    "socket hang up",
    "aborted",
    "temporarily unavailable",
    "service unavailable",
    "rate limit",
    "too many requests",
    "429",
    "502",
    "503",
    "504",
  ];
  return transientPatterns.some((p) => msg.includes(p));
};

const extractTextFromMessage = (message: RequestMessage): string => {
  if (typeof message.content === "string") {
    return message.content;
  }
  return (
    message.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n") ?? ""
  );
};

const buildToolResultMessage = (
  call: ToolCallPayload,
  content: string,
): RequestMessage => ({
  role: Role.Tool,
  content: [
    {
      type: "text",
      text: content,
    },
  ],
  tool_call_id: call.id,
  name: call.function.name,
});

const buildAssistantToolCallMessage = (
  toolCalls: ToolCallPayload[],
): RequestMessage => ({
  role: Role.Assistant,
  content: "",
  tool_calls: toolCalls,
});

const mapToStreamPayload = (messages: RequestMessage[]) => {
  return messages
    .map((msg) => {
      if (msg.role === Role.Tool) {
        return {
          role: "tool",
          content: extractTextFromMessage(msg),
          tool_call_id: msg.tool_call_id,
        };
      }

      if (msg.role === Role.Assistant && msg.tool_calls?.length) {
        return {
          role: msg.role,
          content: typeof msg.content === "string" ? msg.content : "",
          tool_calls: msg.tool_calls,
        };
      }

      if (typeof msg.content === "string") {
        return {
          role: msg.role,
          content: msg.content,
        };
      }

      if (msg.content?.length === 1 && msg.content[0].type === "text") {
        return {
          role: msg.role,
          content: msg.content[0].text,
        };
      }

      return {
        role: msg.role,
        content: msg.content
          ?.map((item) => {
            if (item.type === "text") {
              return {
                type: "text",
                text: item.text,
              };
            }
            if (item.type === "image") {
              return {
                type: "image_url",
                image_url: {
                  url: item.image,
                },
              };
            }
            if (item.type === "file") {
              if (!item.file?.startsWith("data:application/pdf")) {
                console.warn(
                  "附件缺少 PDF data URL，已跳过发送",
                  item.fileName ?? "",
                );
                return null;
              }
              return {
                type: "file",
                file: {
                  filename: item.fileName || "file",
                  file_data: item.file,
                },
              };
            }
            return null;
          })
          .filter((item): item is Exclude<typeof item, null> => Boolean(item)),
      };
    })
    .filter((item): item is Exclude<typeof item, undefined> => Boolean(item));
};

const buildMessagePreview = (message: RequestMessage) => {
  if (message.tool_calls?.length) {
    return {
      role: message.role,
      tool_calls: message.tool_calls.map((tool) => ({
        id: tool.id,
        name: tool.function.name,
      })),
    };
  }

  const text =
    typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content
            .filter((item) => item.type === "text")
            .map((item) => item.text)
            .join("\n")
        : "";
  return {
    role: message.role,
    text: text?.slice(0, 200),
  };
};

const logMessagesPreview = (label: string, messages: RequestMessage[]) => {
  console.debug(label, messages.map(buildMessagePreview));
};

const chatInner = async (
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  messages: RequestMessage[],
  options?: {
    reasoningEffort?: ReasoningEffort;
    enableTools?: boolean;
    onNotice?: (notice: ChatRuntimeNotice) => void;
  },
) => {
  if (!providerConfig) {
    options?.onNotice?.({
      level: "error",
      code: "missing_provider_config",
      message: "未提供大模型配置",
    });
    return null;
  }

  if (!modelConfig) {
    options?.onNotice?.({
      level: "error",
      code: "missing_model_config",
      message: "未提供具体模型配置",
    });
    return null;
  }

  const { apiKey, baseUrl } = providerConfig;
  const { name: modelName } = modelConfig;

  const finalMessages = [...messages];

  const preparedMessages = await normalizeRequestMessages(finalMessages);
  const availableTools = filterConflictingToolSchemas(
    toolRegistry.getToolSchemas(),
  );
  let runtimeMessages = [...preparedMessages];
  let toolLoopCount = 0;
  let toolModeActive =
    (options?.enableTools ?? false) && availableTools.length > 0;
  let toolFallbackNotified = false;

  while (true) {
    try {
      console.debug("[MCP] chat request", {
        toolModeActive,
        toolCount: toolModeActive ? availableTools.length : 0,
        messageCount: runtimeMessages.length,
      });
      logMessagesPreview("[MCP] chat messages", runtimeMessages);
      const result = await chat(apiKey, baseUrl, modelName, runtimeMessages, {
        reasoningEffort: options?.reasoningEffort,
        tools: toolModeActive ? availableTools : undefined,
      });
      console.debug("[MCP] chat response", {
        finishReason: result.finish_reason,
        hasToolCalls: Boolean(result.message.tool_calls?.length),
        contentPreview: result.message.content?.slice(0, 200),
      });
      const toolCalls = result.message.tool_calls || [];

      if (
        result.finish_reason === "tool_calls" &&
        toolModeActive &&
        toolCalls.length > 0
      ) {
        if (toolLoopCount >= MAX_TOOL_CALL_LOOPS) {
          options?.onNotice?.({
            level: "error",
            code: "tool_calls_exceeded",
            message: "工具调用次数过多，已停止此次请求",
          });
          return null;
        }
        toolLoopCount += 1;

        console.debug("[MCP] assistant requested tool calls", {
          count: toolCalls.length,
          toolCalls,
        });
        runtimeMessages = [
          ...runtimeMessages,
          buildAssistantToolCallMessage(toolCalls),
        ];

        for (const call of toolCalls) {
          // 执行工具调用，支持瞬时故障自动重试
          let lastError: Error | null = null;
          let success = false;
          for (let attempt = 0; attempt <= MAX_EXECUTION_RETRY; attempt++) {
            try {
              const execution = await toolRegistry.executeToolCall(call);
              const content =
                execution?.content ?? "工具没有返回内容，已返回默认提示。";
              runtimeMessages.push(buildToolResultMessage(call, content));
              success = true;
              break;
            } catch (error) {
              lastError = error as Error;
              // 仅对瞬时故障自动重试，且未达最大次数
              if (
                isTransientError(error as Error) &&
                attempt < MAX_EXECUTION_RETRY
              ) {
                console.debug(
                  `[MCP] Tool "${call.function.name}" transient error, retry ${attempt + 1}/${MAX_EXECUTION_RETRY}`,
                );
                continue;
              }
              break;
            }
          }
          if (!success) {
            // 所有重试均失败，将错误信息反馈给模型
            runtimeMessages.push(
              buildToolResultMessage(
                call,
                `工具执行异常: ${(lastError as Error).message}`,
              ),
            );
          }
        }
        continue;
      }

      return result.message.content;
    } catch (error) {
      if (toolModeActive) {
        toolModeActive = false;
        console.warn("[MCP] tool mode disabled due to error", error);
        if (!toolFallbackNotified) {
          toolFallbackNotified = true;
          options?.onNotice?.({
            level: "warning",
            code: "tool_mode_disabled",
            message: "当前模型不支持工具调用，已自动关闭 MCP 功能",
          });
        }
        continue;
      }
      console.error("Chat 调用失败", error);
      options?.onNotice?.({
        level: "error",
        code: "chat_request_failed",
        message: "请求失败，请稍后重试",
      });
      return null;
    }
  }
};

export const chatStreamCore = async (
  options: ChatStreamCoreOptions,
): Promise<void> => {
  const {
    providerConfig,
    modelConfig,
    messages,
    onFinish,
    onUpdate,
    onReasoning,
    onError,
    onNotice,
    onController,
    onToolCallsUpdate,
    reasoningEffort,
    enableTools,
    conversationKey,
    toolContext,
    deferAssistantTextUntilFinish,
    additionalTools,
    executeToolCall: customExecuteToolCall,
    disableAnimation,
  } = options;

  if (!providerConfig) {
    onError?.(new Error("无法获取到当前 LLM 配置"));
    return;
  }

  if (!modelConfig) {
    onError?.(new Error("无法获取到当前模型配置"));
    return;
  }

  const { apiKey, baseUrl } = providerConfig;
  const { name: modelName } = modelConfig;
  const chatPath = `${baseUrl}${baseUrl.endsWith("/") ? "" : "/"}chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const finalMessages = [...messages];

  // 转换消息格式用于流式请求
  const preparedMessages = await normalizeRequestMessages(finalMessages);

  const normalizedReasoningEffort =
    reasoningEffort && reasoningEffort !== "none" ? reasoningEffort : undefined;

  // 获取模型特定的参数覆盖配置
  const modelOverrides = getModelRequestOverrides({
    modelName,
    reasoningEffort,
  });

  // 分离 reasoning_effort，确保覆盖逻辑正确处理
  const { reasoning_effort: overrideReasoningEffort, ...restOverrides } =
    modelOverrides;

  const basePayload = {
    stream: true,
    model: modelName,
    temperature: 0.3,
    presence_penalty: 0,
    frequency_penalty: 0,
    top_p: 1,
    reasoning_effort:
      overrideReasoningEffort !== undefined
        ? undefined
        : normalizedReasoningEffort,
    ...restOverrides,
  };

  const controller = new AbortController();
  onController?.(controller);

  // 合并本地工具和外部工具
  const externalTools = additionalTools || [];
  const localTools = filterConflictingToolSchemas(
    toolRegistry.getToolSchemas(),
    externalTools,
  );
  const allTools = [...localTools, ...externalTools];
  const supportsTools = allTools.length > 0;

  // 记录外部工具名称，用于路由
  const externalToolNames = new Set(externalTools.map((t) => t.function.name));

  // 工具执行函数：支持自定义执行器
  const executeToolCallFn = async (
    call: ToolCallPayload,
    signal?: AbortSignal,
  ): Promise<ToolExecutionResult | null> => {
    // 如果是外部工具且提供了自定义执行器，使用自定义执行器
    if (externalToolNames.has(call.function.name) && customExecuteToolCall) {
      return await customExecuteToolCall(call, {
        signal,
        conversationKey,
        toolContext,
      });
    }
    // 否则使用本地 toolRegistry
    return await toolRegistry.executeToolCall(call, {
      signal,
      conversationKey,
      toolContext,
    });
  };

  let runtimeMessages = [...preparedMessages];
  let toolLoopCount = 0;
  let toolModeActive = (enableTools ?? false) && supportsTools;
  let toolFallbackNotified = false;
  let toolExecutions: ToolCallExecutionState[] = [];
  let lastStreamError: Error | null = null;

  const streamCallbacks: IChatStreamOptions = {
    onUpdate,
    onReasoning,
    onToolCallsDelta: (toolCalls) => {
      toolExecutions = toolIntegrationRegistry.upsertStreamingExecutions(
        toolExecutions,
        toolCalls,
        "streaming",
      );
      onToolCallsUpdate?.(toolExecutions);
    },
    onFinish: (content, reasoning) => {
      onFinish?.(content, reasoning);
    },
    onError: (err: Error) => {
      lastStreamError = err;
    },
    deferAssistantTextUntilFinish,
    disableAnimation,
  };

  const parseStreamChunk = (text: string) => {
    const json = JSON.parse(text);
    const choice = json.choices?.[0];
    if (!choice) {
      return undefined;
    }
    const delta = choice.delta || {};
    if (delta?.tool_calls?.length) {
      console.debug("[MCP] stream delta tool_calls", delta.tool_calls);
    }

    const normalizeContentText = (content: any): string => {
      if (!content) return "";
      if (typeof content === "string") {
        return content;
      }
      if (!Array.isArray(content)) {
        return "";
      }
      return content
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          if (item?.type === "text") {
            if (typeof item.text === "string") {
              return item.text;
            }
            if (typeof item.text?.value === "string") {
              return item.text.value;
            }
          }
          if (item?.type === "output_text" && typeof item.text === "string") {
            return item.text;
          }
          return "";
        })
        .join("");
    };

    const normalizedDelta = {
      ...delta,
      content: normalizeContentText(delta.content),
    };

    return {
      delta: normalizedDelta,
      finish_reason: choice.finish_reason,
    };
  };

  while (!controller.signal.aborted) {
    const payload: any = {
      ...basePayload,
      messages: mapToStreamPayload(runtimeMessages),
    };
    if (toolModeActive) {
      payload.tools = allTools;
    } else {
      console.debug("[MCP] stream tool mode disabled, sending without tools");
      delete payload.tools;
    }

    let result;
    lastStreamError = null;
    try {
      console.debug("[MCP] stream request", {
        toolModeActive,
        toolCount: toolModeActive ? allTools.length : 0,
        externalToolCount: externalToolNames.size,
        messageCount: runtimeMessages.length,
      });
      logMessagesPreview("[MCP] stream messages", runtimeMessages);
      result = await stream(
        chatPath,
        payload,
        headers,
        controller,
        parseStreamChunk,
        streamCallbacks,
      );
      console.debug("[MCP] stream response", {
        type: result.type,
        finishReason:
          result.type === "response" ? result.finishReason : "tool_calls",
      });
    } catch (error) {
      if (toolModeActive) {
        toolModeActive = false;
        console.warn("[MCP] stream tool mode disabled due to error", error);
        if (!toolFallbackNotified) {
          toolFallbackNotified = true;
          onNotice?.({
            level: "warning",
            code: "tool_mode_disabled",
            message: "当前模型不支持工具调用，已自动关闭 MCP 功能",
          });
        }
        continue;
      }
      onError?.(lastStreamError ?? (error as Error));
      break;
    }

    if (result.type === "tool_calls" && toolModeActive) {
      if (toolLoopCount >= MAX_TOOL_CALL_LOOPS) {
        onError?.(new Error("工具调用次数过多"));
        break;
      }
      toolLoopCount += 1;
      console.debug("[MCP] stream assistant tool calls", {
        count: result.toolCalls.length,
        toolCalls: result.toolCalls,
      });

      toolExecutions = toolIntegrationRegistry.upsertStreamingExecutions(
        toolExecutions,
        result.toolCalls,
        "preview",
      );

      // 通知 UI 显示待执行的工具
      onToolCallsUpdate?.(toolExecutions);

      runtimeMessages = [
        ...runtimeMessages,
        buildAssistantToolCallMessage(result.toolCalls),
      ];

      for (const call of result.toolCalls) {
        if (controller.signal.aborted) {
          break;
        }

        // 更新为执行中状态
        const execIndex = toolExecutions.findIndex(
          (t) => t.toolCallId === call.id,
        );
        if (execIndex >= 0) {
          toolExecutions = toolExecutions.map((exec, idx) =>
            idx === execIndex
              ? { ...exec, status: "executing" as const }
              : exec,
          );
          onToolCallsUpdate?.(toolExecutions);
        }

        const startTime = Date.now();
        const shouldSkipTimeout = shouldSkipToolTimeout(call.function.name);
        const maxRetry = shouldSkipTimeout ? 0 : MAX_EXECUTION_RETRY;

        // 内部重试循环：仅用于瞬时故障的自动重试
        let lastError: Error | null = null;
        let executionSucceeded = false;

        for (let attempt = 0; attempt <= maxRetry; attempt++) {
          if (controller.signal.aborted) break;

          try {
            const execution = shouldSkipTimeout
              ? await executeToolCallFn(call, controller.signal)
              : await Promise.race([
                  executeToolCallFn(call, controller.signal),
                  new Promise<never>((_, reject) =>
                    setTimeout(
                      () => reject(new Error("工具执行超时")),
                      TOOL_EXECUTION_TIMEOUT,
                    ),
                  ),
                ]);
            const duration = Date.now() - startTime;
            const content =
              execution?.content ?? "工具没有返回内容，已返回默认提示。";

            // 检查是否为参数错误（由 toolRegistry 统一标记）
            if (execution?.isParameterError) {
              // 参数错误：作为 tool result 正常反馈给模型，让模型自行纠正
              runtimeMessages.push(buildToolResultMessage(call, content));

              if (execIndex >= 0) {
                const currentMetadata = toolExecutions[execIndex]?.metadata;
                toolExecutions = toolExecutions.map((exec, idx) =>
                  idx === execIndex
                    ? {
                        ...exec,
                        status: "failed" as const,
                        error: content,
                        metadata:
                          toolIntegrationRegistry.resolveExecutionMetadata({
                            toolName: call.function.name,
                            currentMetadata,
                            execution,
                          }),
                        errorType: "parameter" as const,
                        duration,
                      }
                    : exec,
                );
                onToolCallsUpdate?.(toolExecutions);
              }

              console.warn(
                `[MCP] Tool "${call.function.name}" parameter error, feedback to model`,
              );
              executionSucceeded = true; // 标记为"已处理"，不进入下方的失败逻辑
              break;
            }

            // 正常成功
            runtimeMessages.push(buildToolResultMessage(call, content));

            if (execIndex >= 0) {
              const currentMetadata = toolExecutions[execIndex]?.metadata;
              toolExecutions = toolExecutions.map((exec, idx) =>
                idx === execIndex
                  ? {
                      ...exec,
                      status: "success" as const,
                      output: content,
                      metadata:
                        toolIntegrationRegistry.resolveExecutionMetadata({
                          toolName: call.function.name,
                          currentMetadata,
                          execution,
                        }),
                      duration,
                    }
                  : exec,
              );
              onToolCallsUpdate?.(toolExecutions);
            }

            executionSucceeded = true;
            break;
          } catch (error) {
            if (controller.signal.aborted) {
              break;
            }

            lastError = error as Error;

            // 判断是否为可自动重试的瞬时故障
            if (
              !shouldSkipTimeout &&
              isTransientError(error as Error) &&
              attempt < maxRetry
            ) {
              // 更新 UI 显示重试状态
              if (execIndex >= 0) {
                toolExecutions = toolExecutions.map((exec, idx) =>
                  idx === execIndex
                    ? {
                        ...exec,
                        status: "retrying" as const,
                        error: (error as Error).message,
                        errorType: "execution" as const,
                        duration: Date.now() - startTime,
                        retryCount: attempt + 1,
                      }
                    : exec,
                );
                onToolCallsUpdate?.(toolExecutions);
              }

              console.debug(
                `[MCP] Tool "${call.function.name}" transient error, retry ${attempt + 1}/${maxRetry}`,
              );

              // 短暂延迟后重试
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));

              // 重试前恢复 executing 状态
              if (execIndex >= 0) {
                toolExecutions = toolExecutions.map((exec, idx) =>
                  idx === execIndex
                    ? { ...exec, status: "executing" as const }
                    : exec,
                );
                onToolCallsUpdate?.(toolExecutions);
              }
              continue;
            }

            // 不可重试的执行错误，跳出重试循环
            break;
          }
        }

        // 所有重试均失败（仅执行错误才会到这里）
        if (!executionSucceeded && lastError) {
          if (controller.signal.aborted) {
            break;
          }
          const errorMsg = `工具执行失败: ${lastError.message}`;
          runtimeMessages.push(buildToolResultMessage(call, errorMsg));

          if (execIndex >= 0) {
            const currentMetadata = toolExecutions[execIndex]?.metadata;
            toolExecutions = toolExecutions.map((exec, idx) =>
              idx === execIndex
                ? {
                    ...exec,
                    status: "failed" as const,
                    error: lastError!.message,
                    metadata: currentMetadata,
                    errorType: "execution" as const,
                    duration: Date.now() - startTime,
                    retryCount: maxRetry,
                  }
                : exec,
            );
            onToolCallsUpdate?.(toolExecutions);
          }

          console.error(
            `[MCP] Tool "${call.function.name}" failed after ${maxRetry} retries`,
          );
        }
      }

      if (controller.signal.aborted) {
        break;
      }
      continue;
    }

    if (result.type === "tool_calls" && !toolModeActive) {
      console.warn("模型请求了工具调用，但当前未启用任何工具");
      onError?.(new Error("模型请求了工具调用，但工具功能已被禁用"));
      break;
    }

    break;
  }
};

/**
 * 原有的 chatStreamInner 函数，内部调用 chatStreamCore
 */
export const chatStreamInner = async (
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  messages: RequestMessage[],
  options: IChatStreamOptions,
) => {
  return chatStreamCore({
    providerConfig,
    modelConfig,
    messages,
    onFinish: (content, reasoning) => {
      // @ts-expect-error - Response 参数在 core 中不再使用
      options.onFinish?.(content, reasoning, null);
    },
    onUpdate: options.onUpdate,
    onReasoning: options.onReasoning,
    onError: options.onError,
    onNotice: options.onNotice,
    onController: options.onController,
    onToolCallsUpdate: options.onToolCallsUpdate,
    reasoningEffort: options.reasoningEffort,
    enableTools: options.enableTools,
    conversationKey: options.conversationKey,
    toolContext: options.toolContext,
    deferAssistantTextUntilFinish: options.deferAssistantTextUntilFinish,
  });
};

const useChatLLM = () => {
  const chatLLM = useMemoizedFn(
    async (
      providerConfig: ProviderConfig,
      modelConfig: ModelConfig,
      messages: RequestMessage[],
      options?: {
        reasoningEffort?: ReasoningEffort;
        enableTools?: boolean;
        onNotice?: (notice: ChatRuntimeNotice) => void;
      },
    ) => {
      return await chatInner(providerConfig, modelConfig, messages, options);
    },
  );

  const chatLLMStream = useMemoizedFn(
    (
      providerConfig: ProviderConfig,
      modelConfig: ModelConfig,
      messages: RequestMessage[],
      options: IChatStreamOptions,
    ) => {
      return chatStreamInner(providerConfig, modelConfig, messages, options);
    },
  );

  return {
    chatLLM,
    chatLLMStream,
  };
};

export const chatLLM = async (
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  messages: RequestMessage[],
  options?: {
    reasoningEffort?: ReasoningEffort;
    enableTools?: boolean;
    onNotice?: (notice: ChatRuntimeNotice) => void;
  },
) => {
  return await chatInner(providerConfig, modelConfig, messages, options);
};

export const chatLLMStream = (
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  messages: RequestMessage[],
  options: IChatStreamOptions,
) => {
  chatStreamInner(providerConfig, modelConfig, messages, options);
};

export default useChatLLM;
