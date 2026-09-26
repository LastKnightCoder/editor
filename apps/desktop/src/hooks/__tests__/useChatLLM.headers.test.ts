import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Role } from "@/constants";
import type { RequestMessage } from "@/types/llm";
import type { LLMModelSetting, LLMProviderSetting } from "@/types/pi-llm";

const {
  chatMock,
  chatResponsesMock,
  streamMock,
  normalizeRequestMessagesMock,
  getRegisteredToolsMock,
  executeToolCallMock,
} = vi.hoisted(() => ({
  chatMock: vi.fn(),
  chatResponsesMock: vi.fn(),
  streamMock: vi.fn(),
  normalizeRequestMessagesMock: vi.fn(),
  getRegisteredToolsMock: vi.fn(() => []),
  executeToolCallMock: vi.fn(),
}));

vi.mock("@/commands", () => ({
  chat: chatMock,
  chatResponses: chatResponsesMock,
  createResponsesStreamParser: vi.fn(() => ({
    parse: vi.fn(),
  })),
  stream: streamMock,
}));

vi.mock("@/services/chatMessageNormalization", () => ({
  normalizeRequestMessages: normalizeRequestMessagesMock,
}));

vi.mock("@/tools", () => ({
  __esModule: true,
  default: {
    getToolSchemas: vi.fn(() => []),
    getRegisteredTools: getRegisteredToolsMock,
    getScopedTools: vi.fn(() => []),
    executeToolCall: executeToolCallMock,
  },
  ensureToolingReady: vi.fn(),
}));

vi.mock("@/tools/toolIntegrationRegistry", () => ({
  toolIntegrationRegistry: {
    upsertStreamingExecutions: vi.fn(executions => executions),
    resolveExecutionMetadata: vi.fn(
      ({ currentMetadata, execution }) => execution?.metadata || currentMetadata
    ),
    reconcileExecutionState: vi.fn((previous, next) => ({
      ...next,
      metadata: next.metadata || previous?.metadata,
    })),
  },
}));

vi.mock("@/tools/toolRuntimePolicy", () => ({
  filterConflictingToolSchemas: vi.fn(schemas => schemas),
  shouldSkipToolTimeout: vi.fn(() => false),
  getToolExecutionTimeout: vi.fn((toolName: string, defaultTimeout: number) =>
    toolName === "generate_image" ? 300000 : defaultTimeout
  ),
}));

import {
  chatLLM,
  chatStreamCore,
  createDesktopAgentPolicies,
  shouldSkipDesktopToolTimeout,
} from "../useChatLLM";

describe("hooks/useChatLLM headers", () => {
  const providerConfig: LLMProviderSetting = {
    id: "provider-1",
    name: "provider-1",
    apiKey: "test-key",
    baseUrl: "https://example.com/v1",
    api: "openai-completions",
    models: [],
  };

  const messages: RequestMessage[] = [
    {
      role: Role.User,
      content: "你好",
    },
  ];

  beforeEach(() => {
    streamMock.mockReset();
    chatMock.mockReset();
    chatResponsesMock.mockReset();
    normalizeRequestMessagesMock.mockReset();
    getRegisteredToolsMock.mockReset();
    executeToolCallMock.mockReset();
    normalizeRequestMessagesMock.mockResolvedValue(messages);
    getRegisteredToolsMock.mockReturnValue([]);
    streamMock.mockResolvedValue({
      type: "response",
      finishReason: "stop",
      content: "ok",
      reasoning_content: "",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("SubAgent 工具应跳过父 Agent 通用工具超时", () => {
    expect(shouldSkipDesktopToolTimeout("subagent_research")).toBe(true);
    expect(shouldSkipDesktopToolTimeout("query_todos")).toBe(false);
  });

  it("应将工具级超时策略注入 Agent policies", () => {
    const policies = createDesktopAgentPolicies();

    expect(policies.defaultToolTimeoutMs).toBe(30000);
    expect(policies.getToolTimeoutMs?.("generate_image", 30000)).toBe(300000);
    expect(policies.getToolTimeoutMs?.("lookup", 30000)).toBe(30000);
  });

  it("应使用模型配置中的自定义 User-Agent", async () => {
    const onError = vi.fn();
    const modelConfig: LLMModelSetting = {
      id: "custom-model",
      reasoning: true,
      input: ["text"],
      contextWindow: 128_000,
      maxTokens: 8_192,
      samplingParams: { temperature: 1 },
      headers: { "User-Agent": "CustomClient/2.0" },
    };

    await chatStreamCore({
      provider: providerConfig,
      model: modelConfig,
      messages,
      enableTools: true, // 协议细节仍由旧 adapter 承载（M2-f 前有效），走带工具路径避免进入 pi 单发分支
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[2]).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "CustomClient/2.0",
    });
    expect(streamMock.mock.calls[0]?.[1]).toMatchObject({
      temperature: 1,
    });
  });

  it("K3 不使用特殊参数，temperature 和 reasoning_effort 按通用链路发送", async () => {
    const onError = vi.fn();
    const modelConfig: LLMModelSetting = {
      id: "k3",
      reasoning: true,
      input: ["text"],
      contextWindow: 128_000,
      maxTokens: 8_192,
      samplingParams: { temperature: 1 },
    };

    await chatStreamCore({
      provider: providerConfig,
      model: modelConfig,
      messages,
      enableTools: true, // 协议细节仍由旧 adapter 承载（M2-f 前有效），走带工具路径避免进入 pi 单发分支
      reasoningEffort: "high",
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock.mock.calls[0]?.[1]).toMatchObject({
      model: "k3",
      temperature: 1,
      top_p: 1,
      reasoning_effort: "high",
    });
    expect(streamMock.mock.calls[0]?.[1]).not.toHaveProperty("thinking");
  });

  it("未配置 User-Agent 时不应再按模型名称写死请求头", async () => {
    const onError = vi.fn();
    const modelConfig: LLMModelSetting = {
      id: "kimi-for-coding",
      reasoning: true,
      input: ["text"],
      contextWindow: 128_000,
      maxTokens: 8_192,
    };

    await chatStreamCore({
      provider: providerConfig,
      model: modelConfig,
      messages,
      enableTools: true, // 协议细节仍由旧 adapter 承载（M2-f 前有效），走带工具路径避免进入 pi 单发分支
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[2]).not.toHaveProperty("User-Agent");
  });

  it("Responses 模型应请求 /responses 并使用无状态 payload", async () => {
    const onError = vi.fn();
    const modelConfig: LLMModelSetting = {
      id: "gpt-5.1",
      reasoning: true,
      input: ["text"],
      contextWindow: 400_000,
      maxTokens: 128_000,
    };

    await chatStreamCore({
      provider: { ...providerConfig, api: "openai-responses" },
      model: modelConfig,
      messages,
      enableTools: true, // 协议细节仍由旧 adapter 承载（M2-f 前有效），走带工具路径避免进入 pi 单发分支
      reasoningEffort: "medium",
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[0]).toBe("https://example.com/v1/responses");
    expect(streamMock.mock.calls[0]?.[1]).toMatchObject({
      model: "gpt-5.1",
      stream: true,
      store: false,
      input: [
        {
          role: "user",
          content: "你好",
        },
      ],
      reasoning: {
        effort: "medium",
      },
    });
    expect(streamMock.mock.calls[0]?.[1]).not.toHaveProperty("messages");
    expect(streamMock.mock.calls[0]?.[1]).not.toHaveProperty("frequency_penalty");
    expect(streamMock.mock.calls[0]?.[1]).not.toHaveProperty("presence_penalty");
    expect(streamMock.mock.calls[0]?.[1]).not.toHaveProperty("top_p");
  });

  it("Claude native payload 应携带 Anthropic prompt cache 控制字段", async () => {
    const onError = vi.fn();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const modelConfig: LLMModelSetting = {
      id: "claude-opus-4-6-v1",
      reasoning: true,
      input: ["text"],
      contextWindow: 200_000,
      maxTokens: 8_192,
    };
    const requestMessages: RequestMessage[] = [
      {
        role: Role.System,
        content: [
          {
            type: "text",
            text: "system prompt",
          },
        ],
      },
      {
        role: Role.User,
        content: [
          {
            type: "text",
            text: "用户问题",
          },
        ],
      },
    ];
    normalizeRequestMessagesMock.mockImplementation(async incoming => incoming);

    await chatStreamCore({
      provider: { ...providerConfig, api: "anthropic-messages" },
      model: modelConfig,
      messages: requestMessages,
      enableTools: true, // 协议细节仍由旧 adapter 承载（M2-f 前有效），走带工具路径避免进入 pi 单发分支
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[0]).toBe("https://example.com/v1/messages");
    expect(streamMock.mock.calls[0]?.[2]).toMatchObject({
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
    });
    expect(streamMock.mock.calls[0]?.[2]).not.toHaveProperty("anthropic-beta");
    expect(streamMock.mock.calls[0]?.[1]).toMatchObject({
      model: "claude-opus-4-6-v1",
      stream: true,
      system: [
        {
          type: "text",
          text: "system prompt",
          cache_control: {
            type: "ephemeral",
          },
        },
      ],
      messages: [
        {
          role: "user",
          content: "用户问题",
        },
      ],
    });
    expect(streamMock.mock.calls[0]?.[1]).not.toHaveProperty("cache_control");

    const cacheDebugLogs = infoSpy.mock.calls
      .map(([message]) => String(message))
      .filter(message => message.startsWith("[ClaudeCacheDebug] "));
    expect(cacheDebugLogs).toHaveLength(1);
    expect(cacheDebugLogs[0]).toMatch(/^\[ClaudeCacheDebug\] request_summary /);
    const payloadText = cacheDebugLogs[0]?.replace("[ClaudeCacheDebug] request_summary ", "");
    const payload = JSON.parse(payloadText ?? "{}");
    expect(payload).toMatchObject({
      model: "claude-opus-4-6-v1",
      system: {
        textLength: "system prompt".length,
        cacheControlBlockCount: 1,
      },
      messages: {
        messageCount: 1,
        roleCounts: {
          user: 1,
          assistant: 0,
        },
        messageCacheControlBlockCount: 0,
      },
      tools: {
        count: 0,
        cacheControlBlockCount: 0,
      },
    });
    expect(cacheDebugLogs[0]).not.toContain("test-key");
  });

  it("Claude native payload 应使用模型配置的最大输出 token", async () => {
    const onError = vi.fn();
    vi.spyOn(console, "info").mockImplementation(() => {});
    const modelConfig: LLMModelSetting = {
      id: "claude-sonnet-4-6",
      reasoning: true,
      input: ["text"],
      contextWindow: 200_000,
      maxTokens: 32000,
    };
    normalizeRequestMessagesMock.mockImplementation(async incoming => incoming);

    await chatStreamCore({
      provider: { ...providerConfig, api: "anthropic-messages" },
      model: modelConfig,
      messages,
      enableTools: true, // 协议细节仍由旧 adapter 承载（M2-f 前有效），走带工具路径避免进入 pi 单发分支
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[1]).toMatchObject({
      model: "claude-sonnet-4-6",
      max_tokens: 32000,
      stream: true,
    });
  });

  it("Claude native payload 应给最后一段稳定 assistant 历史添加缓存断点", async () => {
    const onError = vi.fn();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const modelConfig: LLMModelSetting = {
      id: "claude-opus-4-6-v1",
      reasoning: true,
      input: ["text"],
      contextWindow: 200_000,
      maxTokens: 8_192,
    };
    const requestMessages: RequestMessage[] = [
      {
        role: Role.System,
        content: "system prompt",
      },
      {
        role: Role.User,
        content: "第一轮问题",
      },
      {
        role: Role.Assistant,
        content: "第一轮回答",
      },
      {
        role: Role.User,
        content: "第二轮问题",
      },
    ];
    normalizeRequestMessagesMock.mockImplementation(async incoming => incoming);

    await chatStreamCore({
      provider: { ...providerConfig, api: "anthropic-messages" },
      model: modelConfig,
      messages: requestMessages,
      enableTools: true, // 协议细节仍由旧 adapter 承载（M2-f 前有效），走带工具路径避免进入 pi 单发分支
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[1]).toMatchObject({
      system: [
        {
          type: "text",
          text: "system prompt",
          cache_control: {
            type: "ephemeral",
          },
        },
      ],
      messages: [
        {
          role: "user",
          content: "第一轮问题",
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "第一轮回答",
              cache_control: {
                type: "ephemeral",
              },
            },
          ],
        },
        {
          role: "user",
          content: "第二轮问题",
        },
      ],
    });

    const cacheDebugLogs = infoSpy.mock.calls
      .map(([message]) => String(message))
      .filter(message => message.startsWith("[ClaudeCacheDebug] "));
    const requestSummaryLog = cacheDebugLogs.find(message =>
      message.startsWith("[ClaudeCacheDebug] request_summary ")
    );
    const payloadText = requestSummaryLog?.replace("[ClaudeCacheDebug] request_summary ", "");
    const payload = JSON.parse(payloadText ?? "{}");
    expect(payload.messages).toMatchObject({
      messageCount: 3,
      messageCacheControlBlockCount: 1,
    });
  });

  it("Claude native payload 应给最新工具结果添加缓存断点", async () => {
    const onError = vi.fn();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const modelConfig: LLMModelSetting = {
      id: "claude-opus-4-6-v1",
      reasoning: true,
      input: ["text"],
      contextWindow: 200_000,
      maxTokens: 8_192,
    };
    const requestMessages: RequestMessage[] = [
      {
        role: Role.System,
        content: "system prompt",
      },
      {
        role: Role.User,
        content: "查一下项目状态",
      },
      {
        role: Role.Assistant,
        content: "我先调用工具。",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "query_project",
              arguments: '{"id":1}',
            },
          },
        ],
      },
      {
        role: Role.Tool,
        tool_call_id: "call-1",
        content: "工具返回的大段结果",
      },
      {
        role: Role.User,
        content: "继续分析",
      },
    ];
    normalizeRequestMessagesMock.mockImplementation(async incoming => incoming);

    await chatStreamCore({
      provider: { ...providerConfig, api: "anthropic-messages" },
      model: modelConfig,
      messages: requestMessages,
      enableTools: true, // 协议细节仍由旧 adapter 承载（M2-f 前有效），走带工具路径避免进入 pi 单发分支
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[1]).toMatchObject({
      messages: [
        {
          role: "user",
          content: "查一下项目状态",
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "我先调用工具。",
            },
            {
              type: "tool_use",
              id: "call-1",
              name: "query_project",
              input: {
                id: 1,
              },
              cache_control: {
                type: "ephemeral",
              },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call-1",
              content: "工具返回的大段结果",
            },
            {
              type: "text",
              text: "继续分析",
              cache_control: {
                type: "ephemeral",
              },
            },
          ],
        },
      ],
    });

    const cacheDebugLogs = infoSpy.mock.calls
      .map(([message]) => String(message))
      .filter(message => message.startsWith("[ClaudeCacheDebug] "));
    const requestSummaryLog = cacheDebugLogs.find(message =>
      message.startsWith("[ClaudeCacheDebug] request_summary ")
    );
    const payloadText = requestSummaryLog?.replace("[ClaudeCacheDebug] request_summary ", "");
    const payload = JSON.parse(payloadText ?? "{}");
    expect(payload.messages).toMatchObject({
      messageCount: 3,
      messageCacheControlBlockCount: 2,
    });
  });

  it("OpenAI Responses payload 当前不携带缓存优化字段", async () => {
    const onError = vi.fn();
    const modelConfig: LLMModelSetting = {
      id: "gpt-5.5",
      reasoning: true,
      input: ["text"],
      contextWindow: 400_000,
      maxTokens: 128_000,
    };

    await chatStreamCore({
      provider: { ...providerConfig, api: "openai-responses" },
      model: modelConfig,
      messages,
      enableTools: true, // 协议细节仍由旧 adapter 承载（M2-f 前有效），走带工具路径避免进入 pi 单发分支
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[0]).toBe("https://example.com/v1/responses");
    expect(streamMock.mock.calls[0]?.[1]).not.toHaveProperty("prompt_cache_key");
    expect(streamMock.mock.calls[0]?.[1]).not.toHaveProperty("prompt_cache_retention");
  });

  it("工具轮次应可直接消费 AgentEvent 并保持旧 callback 语义", async () => {
    const modelConfig: LLMModelSetting = {
      id: "gpt-4.1",
      reasoning: true,
      input: ["text"],
      contextWindow: 128_000,
      maxTokens: 8_192,
    };

    const toolCall = {
      id: "call_1",
      function: {
        name: "lookup",
        arguments: '{"query":"demo"}',
      },
    };

    getRegisteredToolsMock.mockReturnValue([
      {
        name: "lookup",
        description: "lookup",
        source: "builtin",
        enabled: true,
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
          additionalProperties: false,
        },
        executor: executeToolCallMock,
      },
    ] as any);
    executeToolCallMock.mockResolvedValue({
      content: "tool-result",
    });

    streamMock
      .mockImplementationOnce(async (...args) => {
        const callbacks = args[5] as {
          onToolCallsDelta?: (toolCalls: (typeof toolCall)[]) => void;
        };
        callbacks.onToolCallsDelta?.([toolCall]);
        return {
          type: "tool_calls",
          finishReason: "tool_calls",
          toolCalls: [toolCall],
          content: "",
          reasoning_content: "",
        };
      })
      .mockImplementationOnce(async (...args) => {
        const callbacks = args[5] as {
          onUpdate?: (full: string, inc: string, reasoningText?: string) => void;
          onFinish?: (content: string, reasoning: string, res: Response) => void;
        };
        callbacks.onUpdate?.("final answer", "final answer", "");
        callbacks.onFinish?.("final answer", "", {} as Response);
        return {
          type: "response",
          finishReason: "stop",
        };
      });

    const onFinish = vi.fn();
    const onAssistantTurnEnd = vi.fn();
    const onToolCallsUpdate = vi.fn();
    const onError = vi.fn();

    await chatStreamCore({
      provider: providerConfig,
      model: modelConfig,
      messages,
      enableTools: true,
      onFinish,
      onAssistantTurnEnd,
      onToolCallsUpdate,
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(executeToolCallMock).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onAssistantTurnEnd).toHaveBeenCalledTimes(2);
    expect(onAssistantTurnEnd.mock.calls[0]?.[0]).toMatchObject({
      finishReason: "tool_calls",
      resultType: "tool_calls",
    });
    expect(onAssistantTurnEnd.mock.calls[1]?.[0]).toMatchObject({
      finishReason: "stop",
      resultType: "response",
    });

    const lastToolUpdate = onToolCallsUpdate.mock.calls.at(-1)?.[0];
    expect(lastToolUpdate).toHaveLength(1);
    expect(lastToolUpdate?.[0]).toMatchObject({
      toolCallId: "call_1",
      status: "success",
      output: "tool-result",
    });
  });

  it("仅在传入 skills 时注入内置 skill 工具，且不会与旧 registry 重复", async () => {
    const modelConfig: LLMModelSetting = {
      id: "gpt-4.1",
      reasoning: true,
      input: ["text"],
      contextWindow: 128_000,
      maxTokens: 8_192,
    };

    const registeredTool = {
      description: "tool",
      source: "builtin",
      enabled: true,
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      executor: vi.fn(async () => ({ content: "ok" })),
    };

    getRegisteredToolsMock.mockReturnValue([
      {
        ...registeredTool,
        name: "lookup",
      },
      {
        ...registeredTool,
        name: "list_skills",
      },
      {
        ...registeredTool,
        name: "get_skill_readme",
      },
    ] as any);

    await chatStreamCore({
      provider: providerConfig,
      model: modelConfig,
      messages,
      enableTools: true,
    });

    const toolsWithoutSkills =
      streamMock.mock.calls[0]?.[1]?.tools?.map(
        (tool: { function: { name: string } }) => tool.function.name
      ) ?? [];
    expect(toolsWithoutSkills).toEqual(["lookup"]);

    streamMock.mockClear();

    await chatStreamCore({
      provider: providerConfig,
      model: modelConfig,
      messages,
      enableTools: true,
      skills: [
        {
          folderName: "code-review",
          name: "代码评审",
          description: "用于风险导向代码评审",
          path: "internal://code-review",
          readmeContent: "# 代码评审",
        },
      ],
    });

    const toolsWithSkills =
      streamMock.mock.calls[0]?.[1]?.tools?.map(
        (tool: { function: { name: string } }) => tool.function.name
      ) ?? [];
    expect(toolsWithSkills).toContain("lookup");
    expect(toolsWithSkills.filter((name: string) => name === "list_skills")).toHaveLength(1);
    expect(toolsWithSkills.filter((name: string) => name === "get_skill_readme")).toHaveLength(1);
  });

  it("传入 skills 时应将多个 system message 合并为一个并保持顺序", async () => {
    const modelConfig: LLMModelSetting = {
      id: "gpt-4.1",
      reasoning: true,
      input: ["text"],
      contextWindow: 128_000,
      maxTokens: 8_192,
    };

    const requestMessages: RequestMessage[] = [
      {
        role: Role.System,
        content: "base-system",
      },
      {
        role: Role.System,
        content: "extra-policy",
      },
      ...messages,
    ];
    normalizeRequestMessagesMock.mockImplementation(async incoming => incoming);

    await chatStreamCore({
      provider: providerConfig,
      model: modelConfig,
      messages: requestMessages,
      enableTools: true, // 协议细节仍由旧 adapter 承载（M2-f 前有效），走带工具路径避免进入 pi 单发分支
      skills: [
        {
          folderName: "code-review",
          name: "代码评审",
          description: "用于风险导向代码评审",
          path: "internal://code-review",
          readmeContent: "# 代码评审",
        },
      ],
    });

    const payloadMessages =
      (streamMock.mock.calls[0]?.[1]?.messages as Array<{
        role: string;
        content: string;
      }>) ?? [];

    expect(payloadMessages).toHaveLength(2);
    expect(payloadMessages[0]?.role).toBe("system");
    expect(payloadMessages[0]?.content).toContain("base-system");
    expect(payloadMessages[0]?.content).toContain("## 可用 Skills");
    expect(payloadMessages[0]?.content).toContain("code-review");
    expect(payloadMessages[0]?.content).toContain("extra-policy");
    expect(payloadMessages[0]?.content).toBe(
      "base-system\n\n## 可用 Skills\n\n以下是预定义的 Skills，当用户请求匹配相关场景时，请使用 `get_skill_readme` 工具获取详细说明：\n\ncode-review metadata:\n  - Name: 代码评审\n  - Description: 用于风险导向代码评审\n  - Path: internal://code-review\n\nextra-policy"
    );
    expect(payloadMessages[1]?.role).toBe("user");
  });

  it("同步 chatLLM 应复用 Agent 主链路而不是旧 chat 分支", async () => {
    const onNotice = vi.fn();
    const modelConfig: LLMModelSetting = {
      id: "gpt-4.1",
      reasoning: true,
      input: ["text"],
      contextWindow: 128_000,
      maxTokens: 8_192,
    };

    streamMock.mockImplementationOnce(async (...args) => {
      const callbacks = args[5] as {
        onFinish?: (content: string, reasoning: string, res?: Response) => void;
      };
      callbacks.onFinish?.("agent-result", "", {} as Response);
      return {
        type: "response",
        finishReason: "stop",
        content: "agent-result",
        reasoning_content: "",
      };
    });

    const result = await chatLLM(providerConfig, modelConfig, messages, {
      onNotice,
    });

    expect(result).toBe("agent-result");
    expect(onNotice).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledOnce();
    expect(chatMock).not.toHaveBeenCalled();
    expect(chatResponsesMock).not.toHaveBeenCalled();
  });
});
