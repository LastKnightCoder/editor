import {
  RequestMessage,
  ReasoningEffort,
  Skill,
  ToolCallPayload,
  ToolCallExecutionState,
  ToolExecutionMetadata,
  ToolExecutionResult,
} from "@/types";
import { Agent, composeAgentModel, type AgentEvent, type AgentModelUsage } from "@tau/agent";
import { useMemoizedFn } from "ahooks";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import type { LLMModelSetting, LLMProviderSetting } from "@/types/pi-llm";
import { downgradeModel, downgradeProvider } from "@/services/llmSettingsDowngrade";
import { piAiCancel, piAiSingleShot } from "@/commands/piAi";
import { Role } from "@/constants";
import type { PiThinkingLevel } from "@/types/pi-llm";
import { ensureToolingReady } from "@/tools";
import { toolIntegrationRegistry } from "@/tools/toolIntegrationRegistry";
import { DesktopModelProtocolAdapter } from "@/agent/DesktopModelProtocolAdapter";
import { DesktopModelTransport } from "@/agent/DesktopModelTransport";
import { resolveAgentSkills, toAgentSkills } from "@/agent/desktopSkillAdapter";
import { createToolPermissionPolicies } from "@/services/tool-permission/policy";
import { toExternalAgentTools } from "@/agent/externalAgentTools";
import { getToolRegistryAgentTools } from "@/agent/toolRegistryAgentTools";
import { SUBAGENT_RESEARCH_TOOL_NAME } from "@/agent/subagentResearch";
import { getToolExecutionTimeout } from "@/tools/toolRuntimePolicy";

ensureToolingReady();

export interface ChatRuntimeNotice {
  level: "warning" | "error";
  code: string;
  message: string;
}

interface IChatStreamOptions {
  onFinish?: (
    content: string,
    reasoning_content: string,
    res?: Response | null,
    meta?: {
      turnId?: string;
      finishReason?: string | null;
      resultType?: "response" | "tool_calls";
    }
  ) => void;
  onUpdate?: (
    responseText: string,
    fetchText: string,
    reasoningText?: string,
    turnId?: string
  ) => void;
  onReasoning?: (responseText: string, fetchText: string, turnId?: string) => void;
  onUsage?: (usage: AgentModelUsage, turnId?: string) => void;
  onError?: (e: Error) => void;
  onNotice?: (notice: ChatRuntimeNotice) => void;
  onController?: (controller: AbortController) => void;
  reasoningEffort?: ReasoningEffort;
  onToolCallsUpdate?: (
    executions: ToolCallExecutionState[],
    turnId?: string,
    toolCalls?: ToolCallPayload[]
  ) => void;
  onAssistantTurnEnd?: (params: {
    turnId: string;
    finishReason: string | null;
    resultType: "response" | "tool_calls";
    providerMetadata?: Record<string, unknown>;
  }) => void;
  enableTools?: boolean;
  /** 会话键，用于工具跨页面/重启恢复 */
  conversationKey?: string;
  /** 当前轮次工具执行附加上下文 */
  toolContext?: ToolExecutionMetadata;
  /** 工具作用域：带上该作用域的页面专属工具（见 toolRegistry.registerScopedTools） */
  toolScope?: string;
  /** 当前 Agent 可见的 Skills，传入后才会注入 skill 内置工具 */
  skills?: Skill[];
  /** 本条消息里 `$` 点名的 Skill（folderName）：注入全文，仅手动的 Skill 也因此可用 */
  forcedSkills?: string[];
  /** 调用方能在对话里渲染工具确认条（否则需要确认的工具直接拒绝） */
  interactiveApproval?: boolean;
  /** 延迟 assistant 正文到 onFinish 才提交，避免工具审阅前出现正文 */
  deferAssistantTextUntilFinish?: boolean;
  /** 禁用 requestAnimationFrame 动画缓冲，SSE 数据直接透传回调 */
  disableAnimation?: boolean;
}

export interface ChatStreamCoreOptions {
  provider: LLMProviderSetting;
  model: LLMModelSetting;
  messages: RequestMessage[];
  // 流式回调
  onFinish?: (
    content: string,
    reasoning_content: string,
    meta?: {
      turnId?: string;
      finishReason?: string | null;
      resultType?: "response" | "tool_calls";
    }
  ) => void;
  onUpdate?: (
    responseText: string,
    fetchText: string,
    reasoningText?: string,
    turnId?: string
  ) => void;
  onReasoning?: (responseText: string, fetchText: string, turnId?: string) => void;
  onUsage?: (usage: AgentModelUsage, turnId?: string) => void;
  onError?: (e: Error) => void;
  onNotice?: (notice: ChatRuntimeNotice) => void;
  onController?: (controller: AbortController) => void;
  onToolCallsUpdate?: (
    executions: ToolCallExecutionState[],
    turnId?: string,
    toolCalls?: ToolCallPayload[]
  ) => void;
  onAssistantTurnEnd?: (params: {
    turnId: string;
    finishReason: string | null;
    resultType: "response" | "tool_calls";
    providerMetadata?: Record<string, unknown>;
  }) => void;
  // 配置选项
  reasoningEffort?: ReasoningEffort;
  enableTools?: boolean;
  conversationKey?: string;
  toolContext?: ToolExecutionMetadata;
  /** 工具作用域：带上该作用域的页面专属工具 */
  toolScope?: string;
  skills?: Skill[];
  forcedSkills?: string[];
  interactiveApproval?: boolean;
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
    }
  ) => Promise<ToolExecutionResult | null>;
  /** 禁用 requestAnimationFrame 动画缓冲，SSE 数据直接透传回调（用于 WebSocket 转发场景） */
  disableAnimation?: boolean;
}

const MAX_TOOL_CALL_LOOPS = 15; // 最大工具调用循环次数
const MAX_EXECUTION_RETRY = 2; // 执行失败（瞬时故障）最多自动重试次数
const TOOL_EXECUTION_TIMEOUT = 30000; // 单个工具执行超时时间 30 秒

export const shouldSkipDesktopToolTimeout = (toolName: string): boolean =>
  toolName === SUBAGENT_RESEARCH_TOOL_NAME;

export const createDesktopAgentPolicies = (options?: { interactiveApproval?: boolean }) => ({
  ...createToolPermissionPolicies({ interactive: Boolean(options?.interactiveApproval) }),
  maxToolCallLoops: MAX_TOOL_CALL_LOOPS,
  maxToolRetries: MAX_EXECUTION_RETRY,
  defaultToolTimeoutMs: TOOL_EXECUTION_TIMEOUT,
  shouldSkipToolTimeout: shouldSkipDesktopToolTimeout,
  getToolTimeoutMs: getToolExecutionTimeout,
  isTransientToolError: isTransientError,
});

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
  return transientPatterns.some(p => msg.includes(p));
};

const buildToolCallPlaceholders = (toolCalls: ToolCallPayload[]): ToolCallPayload[] =>
  toolCalls.map(call => ({
    ...call,
    function: {
      ...call.function,
      arguments: "",
    },
  }));

const upsertPendingToolExecutions = (
  currentExecutions: ToolCallExecutionState[],
  toolCalls: ToolCallPayload[]
): ToolCallExecutionState[] => {
  const nextExecutions = [...currentExecutions];
  for (const call of toolCalls) {
    const existingIndex = nextExecutions.findIndex(execution => execution.toolCallId === call.id);
    const nextExecution: ToolCallExecutionState = {
      toolCallId: call.id,
      toolName: call.function.name,
      status: "pending",
      input: call.function.arguments || "",
      timestamp: Date.now(),
    };

    if (existingIndex >= 0) {
      nextExecutions[existingIndex] = {
        ...nextExecutions[existingIndex],
        toolName: nextExecution.toolName,
        input: nextExecution.input,
      };
      continue;
    }

    nextExecutions.push(nextExecution);
  }
  return nextExecutions;
};

const mapAgentExecutionToToolState = (
  execution: Extract<
    AgentEvent,
    { type: "tool-call-started" } | { type: "tool-call-updated" } | { type: "tool-call-finished" }
  >["execution"]
): ToolCallExecutionState => ({
  toolCallId: execution.toolCallId,
  toolName: execution.toolName,
  status: execution.status,
  input: execution.input,
  output: execution.output,
  error: execution.error,
  metadata: execution.metadata,
  errorType: execution.errorType,
  timestamp: execution.timestamp,
  duration: execution.duration,
  retryCount: execution.retryCount,
});

const mapAgentExecutionsToToolStates = (
  executions: Extract<
    AgentEvent,
    { type: "tool-call-started" } | { type: "tool-call-updated" } | { type: "tool-call-finished" }
  >["executions"],
  previousExecutions: ToolCallExecutionState[] = []
): ToolCallExecutionState[] =>
  executions.map(execution => {
    const previous = previousExecutions.find(item => item.toolCallId === execution.toolCallId);
    const mapped = mapAgentExecutionToToolState(execution);
    return toolIntegrationRegistry.reconcileExecutionState(previous, mapped);
  });

const createDesktopToolSource = (options?: {
  toolScope?: string;
  additionalTools?: ChatStreamCoreOptions["additionalTools"];
  executeToolCall?: ChatStreamCoreOptions["executeToolCall"];
}) => ({
  getTools: () => {
    const baseTools = getToolRegistryAgentTools({ toolScope: options?.toolScope });
    const externalTools = options?.additionalTools || [];
    if (externalTools.length === 0 || !options?.executeToolCall) {
      return baseTools;
    }

    // 本次调用传入的工具覆盖全局注册表里的同名工具（如按项目绑定的资料检索）
    const externalNames = new Set(externalTools.map(tool => tool.function.name));
    return [
      ...baseTools.filter(tool => !externalNames.has(tool.name)),
      ...toExternalAgentTools(externalTools, options.executeToolCall),
    ];
  },
});

const createDesktopAgent = (options: {
  providerConfig: ProviderConfig;
  modelConfig: ModelConfig;
  skills?: Skill[];
  forcedSkills?: string[];
  interactiveApproval?: boolean;
  conversationKey?: string;
  toolScope?: string;
  additionalTools?: ChatStreamCoreOptions["additionalTools"];
  executeToolCall?: ChatStreamCoreOptions["executeToolCall"];
}) =>
  new Agent({
    model: composeAgentModel({
      protocol: new DesktopModelProtocolAdapter(options.providerConfig, options.modelConfig),
      transport: new DesktopModelTransport(),
    }),
    tools: createDesktopToolSource({
      toolScope: options.toolScope,
      additionalTools: options.additionalTools,
      executeToolCall: options.executeToolCall,
    }),
    skills: toAgentSkills(options.skills || [], {
      forced: options.forcedSkills,
      conversationKey: options.conversationKey,
    }),
    policies: createDesktopAgentPolicies({ interactiveApproval: options.interactiveApproval }),
  });

const chatInner = async (
  provider: LLMProviderSetting,
  model: LLMModelSetting,
  messages: RequestMessage[],
  options?: {
    reasoningEffort?: ReasoningEffort;
    enableTools?: boolean;
    onNotice?: (notice: ChatRuntimeNotice) => void;
  }
) => {
  if (!provider) {
    options?.onNotice?.({
      level: "error",
      code: "missing_provider_config",
      message: "未提供大模型配置",
    });
    return null;
  }

  if (!model) {
    options?.onNotice?.({
      level: "error",
      code: "missing_model_config",
      message: "未提供具体模型配置",
    });
    return null;
  }

  // M2-d 临时桥：旧 adapter 消费 v1 形状，M2-e 切 pi 路径后随 llmSettingsDowngrade 删除
  const providerConfig = downgradeProvider(provider);
  const modelConfig = downgradeModel(model, provider);

  const agent = createDesktopAgent({
    providerConfig,
    modelConfig,
  });

  try {
    let result: string | null = null;
    for await (const event of agent.run({
      messages,
      enableTools: options?.enableTools,
      reasoningEffort: options?.reasoningEffort,
    })) {
      if (event.type === "notice") {
        options?.onNotice?.(event.notice);
        continue;
      }

      if (event.type === "run-finished") {
        result = event.content;
        continue;
      }

      if (event.type === "run-error") {
        if (event.error.message === "工具调用次数过多") {
          options?.onNotice?.({
            level: "error",
            code: "tool_calls_exceeded",
            message: "工具调用次数过多，已停止此次请求",
          });
          return null;
        }
        throw new Error(event.error.message);
      }
    }
    return result;
  } catch (error) {
    console.error("Chat 调用失败", error);
    options?.onNotice?.({
      level: "error",
      code: "chat_request_failed",
      message: "请求失败，请稍后重试",
    });
    return null;
  }
};

/** ReasoningEffort（旧枚举）→ PiThinkingLevel：none→off，其余同名对齐 */
const toPiThinking = (effort: ReasoningEffort | undefined): PiThinkingLevel | undefined =>
  effort ? (effort === "none" ? "off" : (effort as PiThinkingLevel)) : undefined;

/** chat-core RequestMessage → pi 单发消息：system 抽出拼接，正文块文本化（图片/文件降级为占位） */
const toPiSingleShotMessages = (messages: RequestMessage[]) => {
  const systemParts: string[] = [];
  const chat: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of messages) {
    if (message.role === Role.System) {
      if (typeof message.content === "string") systemParts.push(message.content);
      else if (Array.isArray(message.content)) {
        systemParts.push(
          message.content.map(block => (block.type === "text" ? block.text : "")).join("")
        );
      }
      continue;
    }
    if (message.role === Role.User) {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content
              .map(block =>
                block.type === "text"
                  ? block.text
                  : block.type === "image"
                    ? "[图片]"
                    : `[文件：${block.fileName ?? ""}]`
              )
              .join("\n");
      chat.push({ role: "user", content: text });
      continue;
    }
    if (message.role === Role.Assistant) {
      chat.push({
        role: "assistant",
        content: typeof message.content === "string" ? message.content : "",
      });
    }
    // Tool 角色消息不出现在无工具单发的对话历史里，忽略
  }
  return { system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined, messages: chat };
};

/** pi Usage → AgentModelUsage（旧回调形状，消费方不改） */
const toAgentModelUsage = (usage: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}): AgentModelUsage => ({
  inputTokens: usage.input,
  outputTokens: usage.output,
  cacheReadTokens: usage.cacheRead,
  cacheWriteTokens: usage.cacheWrite,
});

/** 无工具单发的 pi 路径：piAiSingleShot 事件 → chatStreamCore 回调形状映射 */
const runPiSingleShot = async (options: ChatStreamCoreOptions): Promise<void> => {
  const {
    provider,
    model,
    messages,
    onFinish,
    onUpdate,
    onReasoning,
    onUsage,
    onError,
    onController,
    reasoningEffort,
  } = options;
  const requestId = crypto.randomUUID();
  const controller = new AbortController();
  controller.signal.addEventListener("abort", () => {
    void piAiCancel(requestId);
  });
  onController?.(controller);

  const { system, messages: chatMessages } = toPiSingleShotMessages(messages);
  let text = "";
  let reasoning = "";
  type PiFinalMessage = {
    content: Array<{ type: string; text?: string; thinking?: string }>;
    usage?: { input: number; output: number; cacheRead: number; cacheWrite: number };
    stopReason?: string;
    errorMessage?: string;
  } | null;
  const captured: { done: PiFinalMessage } = { done: null };

  try {
    const outcome = await piAiSingleShot(
      {
        providerId: provider.id,
        modelId: model.id,
        ...(system !== undefined ? { system } : {}),
        messages: chatMessages,
        ...(toPiThinking(reasoningEffort) !== undefined
          ? { thinking: toPiThinking(reasoningEffort)! }
          : {}),
        ...(typeof model.samplingParams?.temperature === "number"
          ? { temperature: model.samplingParams.temperature }
          : {}),
      },
      event => {
        const e = event as unknown as Record<string, unknown>;
        if (event.type === "text_end") {
          text = e.content as string;
          onUpdate?.(text, text, reasoning || undefined, requestId);
        } else if (event.type === "text_delta") {
          const delta = e.delta as string;
          onUpdate?.(text + delta, text + delta, reasoning || undefined, requestId);
        } else if (event.type === "thinking_delta") {
          reasoning += e.delta as string;
          onReasoning?.(text, text, requestId);
        } else if (event.type === "thinking_end") {
          reasoning = e.content as string;
          onReasoning?.(text, text, requestId);
        } else if (event.type === "done") {
          captured.done = e.message as typeof captured.done;
        }
      },
      requestId
    );

    if (controller.signal.aborted) return;
    if (!outcome.ok) {
      onError?.(new Error(outcome.error ?? "模型请求失败"));
      return;
    }
    // pi 的 text_end/thinking_end 快照为准（done 事件在 invoke resolve 前已到）
    const finalMessage = captured.done;
    if (finalMessage) {
      text = finalMessage.content
        .filter(block => block.type === "text")
        .map(block => block.text ?? "")
        .join("");
      reasoning = finalMessage.content
        .filter(block => block.type === "thinking")
        .map(block => block.thinking ?? "")
        .join("");
      if (finalMessage.usage) {
        onUsage?.(toAgentModelUsage(finalMessage.usage), requestId);
      }
    }
    onFinish?.(text, reasoning, {
      turnId: requestId,
      finishReason: finalMessage?.stopReason ?? "stop",
      resultType: "response",
    });
    options.onAssistantTurnEnd?.({
      turnId: requestId,
      finishReason: finalMessage?.stopReason ?? "stop",
      resultType: "response",
    });
  } catch (error) {
    if (!controller.signal.aborted) onError?.(error as Error);
  }
};

export const chatStreamCore = async (options: ChatStreamCoreOptions): Promise<void> => {
  const {
    provider,
    model,
    messages,
    onFinish,
    onUpdate,
    onReasoning,
    onUsage,
    onError,
    onNotice,
    onController,
    onToolCallsUpdate,
    onAssistantTurnEnd,
    reasoningEffort,
    enableTools,
    conversationKey,
    toolContext,
    toolScope,
    skills: allSkills = [],
    forcedSkills = [],
    interactiveApproval,
    deferAssistantTextUntilFinish,
    additionalTools,
    executeToolCall: customExecuteToolCall,
    disableAnimation,
  } = options;

  if (!provider) {
    onError?.(new Error("无法获取到当前 LLM 配置"));
    return;
  }

  if (!model) {
    onError?.(new Error("无法获取到当前模型配置"));
    return;
  }

  // M2-e：无工具单发路径走 pi（主进程 pi-ai 模块）——标题摘要/网页剪辑/播客/闪卡/判定/
  // 视频摘要等业务调用方全部经此；带工具路径（主聊天/生成编排）待 M2-f 接 session 后退役旧 adapter
  if (enableTools !== true) {
    return runPiSingleShot(options);
  }

  // M2-d 临时桥：旧 adapter 消费 v1 形状，M2-f 切 session 后随 llmSettingsDowngrade 删除
  const providerConfig = downgradeProvider(provider);
  const modelConfig = downgradeModel(model, provider);
  const controller = new AbortController();
  onController?.(controller);
  // 停用的不给；仅手动的只在本条消息点名时给
  const skills = resolveAgentSkills(allSkills, forcedSkills);
  const agent = createDesktopAgent({
    providerConfig,
    modelConfig,
    skills,
    forcedSkills,
    interactiveApproval,
    conversationKey,
    toolScope,
    additionalTools,
    executeToolCall: customExecuteToolCall,
  });
  const runtimeToolContext = {
    ...(toolContext || {}),
    agentRuntime: {
      providerConfig,
      modelConfig,
      skills,
      toolScope,
    },
  };

  try {
    let toolExecutions: ToolCallExecutionState[] = [];
    let currentTurnToolCalls: ToolCallPayload[] = [];
    const publishedStreamingToolCallIds = new Set<string>();

    const getCurrentTurnExecutions = () => {
      const currentToolCallIds = new Set(currentTurnToolCalls.map(call => call.id));
      if (currentToolCallIds.size === 0) {
        return toolExecutions;
      }
      return toolExecutions.filter(execution => currentToolCallIds.has(execution.toolCallId));
    };

    for await (const event of agent.run({
      messages,
      enableTools,
      conversationKey,
      toolContext: runtimeToolContext as Record<string, unknown>,
      reasoningEffort,
      deferAssistantTextUntilFinish,
      disableAnimation,
      controller,
      metadata: forcedSkills.length > 0 ? { forcedSkillIds: forcedSkills } : undefined,
    })) {
      if (event.type === "text-delta") {
        onUpdate?.(event.text, event.delta, event.reasoningContent, event.turnId);
        continue;
      }

      if (event.type === "reasoning-delta") {
        onReasoning?.(event.reasoningContent, event.delta, event.turnId);
        continue;
      }

      if (event.type === "model-usage") {
        onUsage?.(event.usage, event.turnId);
        continue;
      }

      if (event.type === "tool-call-planned") {
        const streamingPhase = event.phase === "streaming";
        const eventToolCalls = event.toolCalls as ToolCallPayload[];
        const shouldPublishStreamingPlaceholder =
          streamingPhase &&
          eventToolCalls.some(call => !publishedStreamingToolCallIds.has(call.id));
        const shouldPublishStreamingPlan = !streamingPhase || shouldPublishStreamingPlaceholder;
        if (!shouldPublishStreamingPlan) {
          continue;
        }
        currentTurnToolCalls = shouldPublishStreamingPlaceholder
          ? buildToolCallPlaceholders(eventToolCalls)
          : eventToolCalls;
        if (shouldPublishStreamingPlaceholder) {
          eventToolCalls.forEach(call => publishedStreamingToolCallIds.add(call.id));
        }
        const integratedExecutions = toolIntegrationRegistry.upsertStreamingExecutions(
          toolExecutions,
          currentTurnToolCalls,
          streamingPhase ? "streaming" : "preview"
        );
        toolExecutions = shouldPublishStreamingPlaceholder
          ? upsertPendingToolExecutions(integratedExecutions, currentTurnToolCalls)
          : integratedExecutions;
        onToolCallsUpdate?.(getCurrentTurnExecutions(), event.turnId, currentTurnToolCalls);
        continue;
      }

      if (
        event.type === "tool-call-started" ||
        event.type === "tool-call-updated" ||
        event.type === "tool-call-finished"
      ) {
        currentTurnToolCalls = event.toolCalls as ToolCallPayload[];
        toolExecutions = mapAgentExecutionsToToolStates(event.executions, toolExecutions);
        onToolCallsUpdate?.(getCurrentTurnExecutions(), event.turnId, currentTurnToolCalls);
        continue;
      }

      if (event.type === "notice") {
        onNotice?.(event.notice);
        continue;
      }

      if (event.type === "turn-finished") {
        if (event.resultType === "response") {
          onFinish?.(event.content, event.reasoningContent, {
            turnId: event.turnId,
            finishReason: event.finishReason,
            resultType: event.resultType,
          });
        }
        onAssistantTurnEnd?.({
          turnId: event.turnId,
          finishReason: event.finishReason,
          resultType: event.resultType,
          providerMetadata: event.providerMetadata,
        });
        continue;
      }

      if (event.type === "run-error") {
        const nextError = new Error(event.error.message);
        nextError.name = event.error.name;
        onError?.(nextError);
      }
    }
  } catch (error) {
    onError?.(error as Error);
  }
};

/**
 * 原有的 chatStreamInner 函数，内部调用 chatStreamCore
 */
export const chatStreamInner = async (
  provider: LLMProviderSetting,
  model: LLMModelSetting,
  messages: RequestMessage[],
  options: IChatStreamOptions
) => {
  return chatStreamCore({
    provider,
    model,
    messages,
    onFinish: (content, reasoning, meta) => {
      options.onFinish?.(content, reasoning, null, meta);
    },
    onUpdate: options.onUpdate,
    onReasoning: options.onReasoning,
    onUsage: options.onUsage,
    onError: options.onError,
    onNotice: options.onNotice,
    onController: options.onController,
    onToolCallsUpdate: options.onToolCallsUpdate,
    onAssistantTurnEnd: options.onAssistantTurnEnd,
    reasoningEffort: options.reasoningEffort,
    enableTools: options.enableTools,
    conversationKey: options.conversationKey,
    toolContext: options.toolContext,
    toolScope: options.toolScope,
    skills: options.skills,
    forcedSkills: options.forcedSkills,
    interactiveApproval: options.interactiveApproval,
    deferAssistantTextUntilFinish: options.deferAssistantTextUntilFinish,
  });
};

const useChatLLM = () => {
  const chatLLM = useMemoizedFn(
    async (
      provider: LLMProviderSetting,
      model: LLMModelSetting,
      messages: RequestMessage[],
      options?: {
        reasoningEffort?: ReasoningEffort;
        enableTools?: boolean;
        onNotice?: (notice: ChatRuntimeNotice) => void;
      }
    ) => {
      return await chatInner(provider, model, messages, options);
    }
  );

  const chatLLMStream = useMemoizedFn(
    (
      provider: LLMProviderSetting,
      model: LLMModelSetting,
      messages: RequestMessage[],
      options: IChatStreamOptions
    ) => {
      return chatStreamInner(provider, model, messages, options);
    }
  );

  return {
    chatLLM,
    chatLLMStream,
  };
};

export const chatLLM = async (
  provider: LLMProviderSetting,
  model: LLMModelSetting,
  messages: RequestMessage[],
  options?: {
    reasoningEffort?: ReasoningEffort;
    enableTools?: boolean;
    onNotice?: (notice: ChatRuntimeNotice) => void;
  }
) => {
  return await chatInner(provider, model, messages, options);
};

export const chatLLMStream = (
  provider: LLMProviderSetting,
  model: LLMModelSetting,
  messages: RequestMessage[],
  options: IChatStreamOptions
) => {
  chatStreamInner(provider, model, messages, options);
};

export default useChatLLM;
