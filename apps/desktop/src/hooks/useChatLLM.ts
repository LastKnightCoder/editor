import {
  RequestMessage,
  ReasoningEffort,
  Skill,
  ToolCallPayload,
  ToolCallExecutionState,
  ToolExecutionMetadata,
  ToolExecutionResult,
} from "@/types";
import { Agent, composeAgentModel, type AgentEvent } from "@tau/agent";
import { useMemoizedFn } from "ahooks";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import { ensureToolingReady } from "@/tools";
import { toolIntegrationRegistry } from "@/tools/toolIntegrationRegistry";
import { DesktopModelProtocolAdapter } from "@/agent/DesktopModelProtocolAdapter";
import { DesktopModelTransport } from "@/agent/DesktopModelTransport";
import { toAgentSkills } from "@/agent/desktopSkillAdapter";
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
    },
  ) => void;
  onUpdate?: (
    responseText: string,
    fetchText: string,
    reasoningText?: string,
    turnId?: string,
  ) => void;
  onReasoning?: (
    responseText: string,
    fetchText: string,
    turnId?: string,
  ) => void;
  onError?: (e: Error) => void;
  onNotice?: (notice: ChatRuntimeNotice) => void;
  onController?: (controller: AbortController) => void;
  reasoningEffort?: ReasoningEffort;
  onToolCallsUpdate?: (
    executions: ToolCallExecutionState[],
    turnId?: string,
    toolCalls?: ToolCallPayload[],
  ) => void;
  onAssistantTurnEnd?: (params: {
    turnId: string;
    finishReason: string | null;
    resultType: "response" | "tool_calls";
  }) => void;
  enableTools?: boolean;
  /** 会话键，用于工具跨页面/重启恢复 */
  conversationKey?: string;
  /** 当前轮次工具执行附加上下文 */
  toolContext?: ToolExecutionMetadata;
  /** 当前 Agent 可见的 Skills，传入后才会注入 skill 内置工具 */
  skills?: Skill[];
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
  onFinish?: (
    content: string,
    reasoning_content: string,
    meta?: {
      turnId?: string;
      finishReason?: string | null;
      resultType?: "response" | "tool_calls";
    },
  ) => void;
  onUpdate?: (
    responseText: string,
    fetchText: string,
    reasoningText?: string,
    turnId?: string,
  ) => void;
  onReasoning?: (
    responseText: string,
    fetchText: string,
    turnId?: string,
  ) => void;
  onError?: (e: Error) => void;
  onNotice?: (notice: ChatRuntimeNotice) => void;
  onController?: (controller: AbortController) => void;
  onToolCallsUpdate?: (
    executions: ToolCallExecutionState[],
    turnId?: string,
    toolCalls?: ToolCallPayload[],
  ) => void;
  onAssistantTurnEnd?: (params: {
    turnId: string;
    finishReason: string | null;
    resultType: "response" | "tool_calls";
  }) => void;
  // 配置选项
  reasoningEffort?: ReasoningEffort;
  enableTools?: boolean;
  conversationKey?: string;
  toolContext?: ToolExecutionMetadata;
  skills?: Skill[];
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

export const shouldSkipDesktopToolTimeout = (toolName: string): boolean =>
  toolName === SUBAGENT_RESEARCH_TOOL_NAME;

export const createDesktopAgentPolicies = () => ({
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
  return transientPatterns.some((p) => msg.includes(p));
};

const mapAgentExecutionToToolState = (
  execution: Extract<
    AgentEvent,
    | { type: "tool-call-started" }
    | { type: "tool-call-updated" }
    | { type: "tool-call-finished" }
  >["execution"],
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
    | { type: "tool-call-started" }
    | { type: "tool-call-updated" }
    | { type: "tool-call-finished" }
  >["executions"],
  previousExecutions: ToolCallExecutionState[] = [],
): ToolCallExecutionState[] =>
  executions.map((execution) => {
    const previous = previousExecutions.find(
      (item) => item.toolCallId === execution.toolCallId,
    );
    const mapped = mapAgentExecutionToToolState(execution);
    return toolIntegrationRegistry.reconcileExecutionState(previous, mapped);
  });

const createDesktopToolSource = (options?: {
  additionalTools?: ChatStreamCoreOptions["additionalTools"];
  executeToolCall?: ChatStreamCoreOptions["executeToolCall"];
}) => ({
  getTools: () => {
    const baseTools = getToolRegistryAgentTools();
    const externalTools = options?.additionalTools || [];
    if (externalTools.length === 0 || !options?.executeToolCall) {
      return baseTools;
    }

    return [
      ...baseTools,
      ...toExternalAgentTools(externalTools, options.executeToolCall),
    ];
  },
});

const createDesktopAgent = (options: {
  providerConfig: ProviderConfig;
  modelConfig: ModelConfig;
  skills?: Skill[];
  additionalTools?: ChatStreamCoreOptions["additionalTools"];
  executeToolCall?: ChatStreamCoreOptions["executeToolCall"];
}) =>
  new Agent({
    model: composeAgentModel({
      protocol: new DesktopModelProtocolAdapter(
        options.providerConfig,
        options.modelConfig,
      ),
      transport: new DesktopModelTransport(),
    }),
    tools: createDesktopToolSource({
      additionalTools: options.additionalTools,
      executeToolCall: options.executeToolCall,
    }),
    skills: toAgentSkills(options.skills || []),
    policies: createDesktopAgentPolicies(),
  });

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
    onAssistantTurnEnd,
    reasoningEffort,
    enableTools,
    conversationKey,
    toolContext,
    skills = [],
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
  const controller = new AbortController();
  onController?.(controller);
  const agent = createDesktopAgent({
    providerConfig,
    modelConfig,
    skills,
    additionalTools,
    executeToolCall: customExecuteToolCall,
  });
  const runtimeToolContext = {
    ...(toolContext || {}),
    agentRuntime: {
      providerConfig,
      modelConfig,
      skills,
    },
  };

  try {
    let toolExecutions: ToolCallExecutionState[] = [];
    let currentTurnToolCalls: ToolCallPayload[] = [];

    const getCurrentTurnExecutions = () => {
      const currentToolCallIds = new Set(
        currentTurnToolCalls.map((call) => call.id),
      );
      if (currentToolCallIds.size === 0) {
        return toolExecutions;
      }
      return toolExecutions.filter((execution) =>
        currentToolCallIds.has(execution.toolCallId),
      );
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
    })) {
      if (event.type === "text-delta") {
        onUpdate?.(
          event.text,
          event.delta,
          event.reasoningContent,
          event.turnId,
        );
        continue;
      }

      if (event.type === "reasoning-delta") {
        onReasoning?.(event.reasoningContent, event.delta, event.turnId);
        continue;
      }

      if (event.type === "tool-call-planned") {
        currentTurnToolCalls = event.toolCalls as ToolCallPayload[];
        toolExecutions = toolIntegrationRegistry.upsertStreamingExecutions(
          toolExecutions,
          currentTurnToolCalls,
          event.phase === "streaming" ? "streaming" : "preview",
        );
        onToolCallsUpdate?.(
          getCurrentTurnExecutions(),
          event.turnId,
          currentTurnToolCalls,
        );
        continue;
      }

      if (
        event.type === "tool-call-started" ||
        event.type === "tool-call-updated" ||
        event.type === "tool-call-finished"
      ) {
        currentTurnToolCalls = event.toolCalls as ToolCallPayload[];
        toolExecutions = mapAgentExecutionsToToolStates(
          event.executions,
          toolExecutions,
        );
        onToolCallsUpdate?.(
          getCurrentTurnExecutions(),
          event.turnId,
          currentTurnToolCalls,
        );
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
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  messages: RequestMessage[],
  options: IChatStreamOptions,
) => {
  return chatStreamCore({
    providerConfig,
    modelConfig,
    messages,
    onFinish: (content, reasoning, meta) => {
      options.onFinish?.(content, reasoning, null, meta);
    },
    onUpdate: options.onUpdate,
    onReasoning: options.onReasoning,
    onError: options.onError,
    onNotice: options.onNotice,
    onController: options.onController,
    onToolCallsUpdate: options.onToolCallsUpdate,
    onAssistantTurnEnd: options.onAssistantTurnEnd,
    reasoningEffort: options.reasoningEffort,
    enableTools: options.enableTools,
    conversationKey: options.conversationKey,
    toolContext: options.toolContext,
    skills: options.skills,
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
