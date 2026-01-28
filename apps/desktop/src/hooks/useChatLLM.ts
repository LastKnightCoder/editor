import {
  RequestMessage,
  KnowledgeOptions,
  MessageContent,
  ReasoningEffort,
  ToolCallPayload,
  ToolCallExecutionState,
} from "@/types";
import { useMemoizedFn } from "ahooks";
import { message } from "antd";
import {
  chat,
  stream,
  getResourceById,
  readBinaryFile,
  getHomeDir,
} from "@/commands";
import { performRAGEnhancement } from "@/utils/rag-helper";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import { remoteResourceToLocal } from "@/utils";
import { Role } from "@/constants";
import toolRegistry, { ensureToolingReady } from "@/tools";

ensureToolingReady();

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
  onController?: (controller: AbortController) => void;
  reasoningEffort?: ReasoningEffort;
  onToolCallsUpdate?: (executions: ToolCallExecutionState[]) => void;
  enableTools?: boolean;
}

const MAX_TOOL_CALL_LOOPS = 5;
const MAX_TOOL_RETRY_PER_CALL = 2; // 每个工具最多重试 2 次

// 判断错误是否应该重试
const shouldRetryToolCall = (error: Error, retryCount: number): boolean => {
  if (retryCount >= MAX_TOOL_RETRY_PER_CALL) {
    return false;
  }

  const errorMsg = error.message.toLowerCase();
  // 参数错误、格式错误等应该重试
  const retryableErrors = [
    "invalid arguments",
    "invalid parameter",
    "missing required",
    "unexpected argument",
    "argument type",
    "parse error",
    "json",
    "format error",
  ];

  return retryableErrors.some((pattern) => errorMsg.includes(pattern));
};

// 构建详细的错误提示给模型
const buildDetailedErrorMessage = (
  call: ToolCallPayload,
  error: Error,
  retryCount: number,
): string => {
  return `工具 "${call.function.name}" 执行失败（第 ${retryCount + 1} 次尝试）。

错误信息：${error.message}

请根据错误信息检查并修正参数，然后重新调用该工具。
- 工具名称：${call.function.name}
- 您提供的参数：${call.function.arguments || "{}"}

请确保：
1. 参数格式正确（有效的 JSON）
2. 所有必需参数都已提供
3. 参数类型符合工具定义
4. 参数值在有效范围内`;
};

const FILE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
  jfif: "image/jpeg",
  ico: "image/x-icon",
};

const guessMimeTypeFromPath = (path: string) => {
  if (!path) {
    return "application/octet-stream";
  }
  const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(path);
  if (match) {
    const ext = match[1].toLowerCase();
    return FILE_MIME_TYPES[ext] || "application/octet-stream";
  }
  return "application/octet-stream";
};

const readBlobAsDataURL = (blob: Blob) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const binaryToDataURL = async (binary: BlobPart, mimeType: string) => {
  const blob = new Blob([binary], { type: mimeType });
  return await readBlobAsDataURL(blob);
};

const fetchUrlAsBase64 = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`获取资源失败: ${response.status}`);
  }
  const blob = await response.blob();
  return await readBlobAsDataURL(blob);
};

const tryConvertUrlToBase64 = async (url?: string | null) => {
  if (!url) {
    return null;
  }
  if (url.startsWith("data:")) {
    return url;
  }
  try {
    return await fetchUrlAsBase64(url);
  } catch (error) {
    console.error("转换图片为 Base64 失败:", error);
    return url;
  }
};

const resolveResourceAbsolutePath = async (resourcePath: string) => {
  if (!resourcePath) {
    return null;
  }

  if (/^https?:/i.test(resourcePath)) {
    try {
      return await remoteResourceToLocal(resourcePath);
    } catch (error) {
      console.error("下载远程资源失败:", error);
      return null;
    }
  }

  if (resourcePath.startsWith("~")) {
    const homeDir = await getHomeDir();
    return `${homeDir}${resourcePath.slice(1)}`;
  }

  return resourcePath;
};

const buildResourceDataUrl = async (
  resourceId?: number,
  fallbackPath?: string,
  fallbackName?: string,
): Promise<string | null> => {
  const convertFromPath = async (
    path: string,
    nameHint?: string,
    forcedMime?: string,
  ) => {
    try {
      const absolutePath = await resolveResourceAbsolutePath(path);
      if (absolutePath) {
        const binary = await readBinaryFile(absolutePath);
        let mimeType =
          forcedMime ||
          guessMimeTypeFromPath(path) ||
          "application/octet-stream";
        if (mimeType === "application/octet-stream" && nameHint) {
          const guessedFromName = guessMimeTypeFromPath(nameHint);
          if (
            guessedFromName &&
            guessedFromName !== "application/octet-stream"
          ) {
            mimeType = guessedFromName;
          }
        }
        return await binaryToDataURL(binary as BlobPart, mimeType);
      }
      return await tryConvertUrlToBase64(path);
    } catch (error) {
      console.error("读取资源失败:", error);
      return await tryConvertUrlToBase64(path);
    }
  };

  if (resourceId) {
    try {
      const resource = await getResourceById(resourceId);
      if (resource) {
        const forcedMime =
          resource.type === "pdf" ? "application/pdf" : undefined;
        const result = await convertFromPath(
          resource.path,
          resource.name,
          forcedMime,
        );
        if (result) {
          return result;
        }
      }
    } catch (error) {
      console.error("获取资源失败:", error);
    }
  }

  if (fallbackPath) {
    const fallbackMime =
      fallbackName && fallbackName.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : undefined;
    return await convertFromPath(fallbackPath, fallbackName, fallbackMime);
  }

  return null;
};

const buildImageBase64 = async (
  resourceId?: number,
  fallbackUrl?: string,
): Promise<string | null> => {
  return await buildResourceDataUrl(resourceId, fallbackUrl);
};

const buildFileBase64 = async (
  resourceId?: number,
  fallbackPath?: string,
  fallbackName?: string,
): Promise<string | null> => {
  return await buildResourceDataUrl(resourceId, fallbackPath, fallbackName);
};

const normalizeMessageContent = async (
  message: RequestMessage,
): Promise<RequestMessage> => {
  if (!Array.isArray(message.content)) {
    return message;
  }

  const normalized: MessageContent[] = [];
  for (const item of message.content) {
    if (item.type === "image") {
      const imageData = await buildImageBase64(item.resourceId, item.image);
      normalized.push(
        imageData
          ? {
              ...item,
              image: imageData,
            }
          : item,
      );
    } else if (item.type === "file") {
      const fileData = await buildFileBase64(
        item.resourceId,
        item.file,
        item.fileName,
      );
      normalized.push(
        fileData
          ? {
              ...item,
              file: fileData,
            }
          : item,
      );
    } else {
      normalized.push(item);
    }
  }

  return {
    ...message,
    content: normalized,
  };
};

const normalizeMessages = async (
  messages: RequestMessage[],
): Promise<RequestMessage[]> => {
  const normalized: RequestMessage[] = [];
  for (const message of messages) {
    normalized.push(await normalizeMessageContent(message));
  }
  return normalized;
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
  knowledgeOptions?: KnowledgeOptions,
  options?: {
    reasoningEffort?: ReasoningEffort;
    enableTools?: boolean;
  },
) => {
  if (!providerConfig) {
    message.error("未提供大模型配置");
    return null;
  }

  if (!modelConfig) {
    message.error("未提供具体模型配置");
    return null;
  }

  const { apiKey, baseUrl } = providerConfig;
  const { name: modelName } = modelConfig;

  let finalMessages = [...messages];

  // 如果启用了知识库功能，进行 RAG 处理
  if (knowledgeOptions?.enable && messages.length > 0) {
    try {
      finalMessages = await performRAGEnhancement(messages, knowledgeOptions);
    } catch (error) {
      console.error("RAG 搜索失败:", error);
      // 如果搜索失败，继续正常的聊天流程
    }
  }

  const preparedMessages = await normalizeMessages(finalMessages);
  const availableTools = toolRegistry.getToolSchemas();
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
          message.error("工具调用次数过多，已停止此次请求");
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
          try {
            const execution = await toolRegistry.executeToolCall(call);
            const content =
              execution?.content ?? "工具没有返回内容，已返回默认提示。";
            runtimeMessages.push(buildToolResultMessage(call, content));
          } catch (error) {
            runtimeMessages.push(
              buildToolResultMessage(
                call,
                `工具执行异常: ${(error as Error).message}`,
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
          message.warning("当前模型不支持工具调用，已自动关闭 MCP 功能");
        }
        continue;
      }
      console.error("Chat 调用失败", error);
      message.error("请求失败，请稍后重试");
      return null;
    }
  }
};

export const chatStreamInner = async (
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  messages: RequestMessage[],
  options: IChatStreamOptions,
  knowledgeOptions?: KnowledgeOptions,
) => {
  if (!providerConfig) {
    options.onError?.(new Error("无法获取到当前 LLM 配置"));
    return;
  }

  if (!modelConfig) {
    options.onError?.(new Error("无法获取到当前模型配置"));
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

  let finalMessages = [...messages];

  // 如果启用了知识库功能，进行 RAG 处理
  if (knowledgeOptions?.enable && messages.length > 0) {
    try {
      finalMessages = await performRAGEnhancement(messages, knowledgeOptions);
    } catch (error) {
      console.error("RAG 搜索失败:", error);
      // 如果搜索失败，继续正常的流式请求
    }
  }

  // 转换消息格式用于流式请求
  const preparedMessages = await normalizeMessages(finalMessages);

  const isKimiModel = modelName.startsWith("kimi");
  const notSupportTemperature = ["o1", "o3", "o4", "gpt-5"].some((model) =>
    modelName.startsWith(model),
  );
  const notSupportFrequencyPenalty = ["gemini"].some((model) =>
    modelName.startsWith(model),
  );

  const normalizedReasoningEffort =
    options.reasoningEffort && options.reasoningEffort !== "none"
      ? options.reasoningEffort
      : undefined;

  const basePayload = {
    stream: true,
    model: modelName,
    temperature: isKimiModel ? 0.6 : notSupportTemperature ? undefined : 0.3,
    presence_penalty: 0,
    frequency_penalty: notSupportFrequencyPenalty ? undefined : 0,
    top_p: isKimiModel ? 0.95 : 1,
    reasoning_effort: isKimiModel ? undefined : normalizedReasoningEffort,
    thinking: isKimiModel
      ? { type: normalizedReasoningEffort ? "enabled" : "disabled" }
      : undefined,
  };

  const controller = new AbortController();
  options.onController?.(controller);

  const availableTools = toolRegistry.getToolSchemas();
  const supportsTools = availableTools.length > 0;
  let runtimeMessages = [...preparedMessages];
  let toolLoopCount = 0;
  let toolModeActive = (options.enableTools ?? false) && supportsTools;
  let toolFallbackNotified = false;
  let toolExecutions: ToolCallExecutionState[] = [];
  const originalOnError = options.onError;
  let lastStreamError: Error | null = null;
  const streamCallbacks: IChatStreamOptions = {
    ...options,
    onError: (err: Error) => {
      lastStreamError = err;
    },
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
      payload.tools = availableTools;
    } else {
      console.debug("[MCP] stream tool mode disabled, sending without tools");
      delete payload.tools;
    }

    let result;
    lastStreamError = null;
    try {
      console.debug("[MCP] stream request", {
        toolModeActive,
        toolCount: toolModeActive ? availableTools.length : 0,
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
          message.warning("当前模型不支持工具调用，已自动关闭 MCP 功能");
        }
        continue;
      }
      originalOnError?.(lastStreamError ?? (error as Error));
      break;
    }

    if (result.type === "tool_calls" && toolModeActive) {
      if (toolLoopCount >= MAX_TOOL_CALL_LOOPS) {
        originalOnError?.(new Error("工具调用次数过多"));
        break;
      }
      toolLoopCount += 1;
      console.debug("[MCP] stream assistant tool calls", {
        count: result.toolCalls.length,
        toolCalls: result.toolCalls,
      });

      // 初始化 pending 状态
      const newExecutions = result.toolCalls.map((call) => ({
        toolCallId: call.id,
        toolName: call.function.name,
        status: "pending" as const,
        input: call.function.arguments || "",
        timestamp: Date.now(),
      }));
      toolExecutions = [...toolExecutions, ...newExecutions];

      // 通知 UI 显示待执行的工具
      options.onToolCallsUpdate?.(toolExecutions);

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
          options.onToolCallsUpdate?.(toolExecutions);
        }

        try {
          const startTime = Date.now();
          const execution = await toolRegistry.executeToolCall(call);
          const duration = Date.now() - startTime;
          const content =
            execution?.content ?? "工具没有返回内容，已返回默认提示。";
          runtimeMessages.push(buildToolResultMessage(call, content));

          // 更新为成功状态
          if (execIndex >= 0) {
            toolExecutions = toolExecutions.map((exec, idx) =>
              idx === execIndex
                ? {
                    ...exec,
                    status: "success" as const,
                    output: content,
                    duration,
                  }
                : exec,
            );
            options.onToolCallsUpdate?.(toolExecutions);
          }
        } catch (error) {
          const currentRetryCount =
            execIndex >= 0 ? toolExecutions[execIndex].retryCount || 0 : 0;
          const shouldRetry = shouldRetryToolCall(
            error as Error,
            currentRetryCount,
          );

          if (shouldRetry) {
            // 可以重试：给模型详细的错误信息，让其自我修正
            const detailedErrorMsg = buildDetailedErrorMessage(
              call,
              error as Error,
              currentRetryCount,
            );
            runtimeMessages.push(
              buildToolResultMessage(call, detailedErrorMsg),
            );

            // 更新为重试状态
            if (execIndex >= 0) {
              toolExecutions = toolExecutions.map((exec, idx) =>
                idx === execIndex
                  ? {
                      ...exec,
                      status: "retrying" as const,
                      error: (error as Error).message,
                      duration: Date.now() - exec.timestamp,
                      retryCount: currentRetryCount + 1,
                      isRetrying: true,
                    }
                  : exec,
              );
              options.onToolCallsUpdate?.(toolExecutions);
            }

            console.debug(
              `[MCP] Tool "${call.function.name}" will retry (${currentRetryCount + 1}/${MAX_TOOL_RETRY_PER_CALL})`,
            );
          } else {
            // 不重试：最终失败
            const errorMsg = `工具执行异常: ${(error as Error).message}`;
            runtimeMessages.push(buildToolResultMessage(call, errorMsg));

            // 更新为失败状态
            if (execIndex >= 0) {
              toolExecutions = toolExecutions.map((exec, idx) =>
                idx === execIndex
                  ? {
                      ...exec,
                      status: "failed" as const,
                      error: (error as Error).message,
                      duration: Date.now() - exec.timestamp,
                      retryCount: currentRetryCount,
                    }
                  : exec,
              );
              options.onToolCallsUpdate?.(toolExecutions);
            }

            console.error(
              `[MCP] Tool "${call.function.name}" failed after ${currentRetryCount} retries`,
            );
          }
        }
      }

      if (controller.signal.aborted) {
        break;
      }
      continue;
    }

    if (result.type === "tool_calls" && !toolModeActive) {
      console.warn("模型请求了工具调用，但当前未启用任何工具");
      break;
    }

    break;
  }
};

const useChatLLM = () => {
  const chatLLM = useMemoizedFn(
    async (
      providerConfig: ProviderConfig,
      modelConfig: ModelConfig,
      messages: RequestMessage[],
      knowledgeOptions?: KnowledgeOptions,
    ) => {
      return await chatInner(
        providerConfig,
        modelConfig,
        messages,
        knowledgeOptions,
      );
    },
  );

  const chatLLMStream = useMemoizedFn(
    (
      providerConfig: ProviderConfig,
      modelConfig: ModelConfig,
      messages: RequestMessage[],
      options: IChatStreamOptions,
      knowledgeOptions?: KnowledgeOptions,
    ) => {
      return chatStreamInner(
        providerConfig,
        modelConfig,
        messages,
        options,
        knowledgeOptions,
      );
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
  knowledgeOptions?: KnowledgeOptions,
) => {
  return await chatInner(
    providerConfig,
    modelConfig,
    messages,
    knowledgeOptions,
  );
};

export const chatLLMStream = (
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  messages: RequestMessage[],
  options: IChatStreamOptions,
  knowledgeOptions?: KnowledgeOptions,
) => {
  chatStreamInner(
    providerConfig,
    modelConfig,
    messages,
    options,
    knowledgeOptions,
  );
};

export default useChatLLM;
