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
import type { LLMProviderSetting, LLMModelSetting } from "@/types/pi-llm";
import type { ProviderConfig, ModelConfig } from "@/types/llm";
import { downgradeModel, downgradeProvider } from "@/services/llmSettingsDowngrade";
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

  // M2-e：无工具单发路径已由 services/piLLM（pi 原生事件直消费）承接，本函数只剩带工具路径；
  // 主聊天（M2-f）/生成编排/aiServer 切 pi 会话后随旧 adapter 一起退役
  if (enableTools !== true) {
    onError?.(new Error("chatStreamCore 仅承载带工具路径，单发请使用 services/piLLM"));
    return;
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
    chatLLMStream,
  };
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
