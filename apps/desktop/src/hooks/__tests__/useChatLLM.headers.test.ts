import { describe, expect, it, vi, beforeEach } from "vitest";
import { Role } from "@/constants";
import type { ProviderConfig, ModelConfig, RequestMessage } from "@/types/llm";

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
    executeToolCall: executeToolCallMock,
  },
  ensureToolingReady: vi.fn(),
}));

vi.mock("@/tools/toolIntegrationRegistry", () => ({
  toolIntegrationRegistry: {
    upsertStreamingExecutions: vi.fn((executions) => executions),
    resolveExecutionMetadata: vi.fn(
      ({ currentMetadata, execution }) =>
        execution?.metadata || currentMetadata,
    ),
    reconcileExecutionState: vi.fn((previous, next) => ({
      ...next,
      metadata: next.metadata || previous?.metadata,
    })),
  },
}));

vi.mock("@/tools/toolRuntimePolicy", () => ({
  filterConflictingToolSchemas: vi.fn((schemas) => schemas),
  shouldSkipToolTimeout: vi.fn(() => false),
}));

import {
  chatLLM,
  chatStreamCore,
  shouldSkipDesktopToolTimeout,
} from "../useChatLLM";

describe("hooks/useChatLLM headers", () => {
  const providerConfig: ProviderConfig = {
    id: "provider-1",
    name: "provider-1",
    apiKey: "test-key",
    baseUrl: "https://example.com/v1",
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

  it("SubAgent 工具应跳过父 Agent 通用工具超时", () => {
    expect(shouldSkipDesktopToolTimeout("subagent_research")).toBe(true);
    expect(shouldSkipDesktopToolTimeout("query_todos")).toBe(false);
  });

  it("kimi-for-coding 应注入 KimiCLI User-Agent", async () => {
    const onError = vi.fn();
    const modelConfig: ModelConfig = {
      name: "kimi-for-coding",
      description: "Kimi",
      features: {
        online: true,
        thinking: true,
        image: false,
        video: false,
        audio: false,
        file: false,
      },
    };

    await chatStreamCore({
      providerConfig,
      modelConfig,
      messages,
      enableTools: false,
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[2]).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "KimiCLI/1.37.0",
    });
  });

  it("其他模型不应额外注入 KimiCLI User-Agent", async () => {
    const onError = vi.fn();
    const modelConfig: ModelConfig = {
      name: "gpt-4.1",
      description: "OpenAI",
      features: {
        online: true,
        thinking: true,
        image: false,
        video: false,
        audio: false,
        file: false,
      },
    };

    await chatStreamCore({
      providerConfig,
      modelConfig,
      messages,
      enableTools: false,
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[2]).not.toHaveProperty("User-Agent");
  });

  it("Responses 模型应请求 /responses 并使用无状态 payload", async () => {
    const onError = vi.fn();
    const modelConfig: ModelConfig = {
      name: "gpt-5.1",
      description: "OpenAI Responses",
      apiProtocol: "responses",
      features: {
        online: true,
        thinking: true,
        image: false,
        video: false,
        audio: false,
        file: false,
      },
    };

    await chatStreamCore({
      providerConfig,
      modelConfig,
      messages,
      enableTools: false,
      reasoningEffort: "medium",
      onError,
    });

    expect(onError).not.toHaveBeenCalled();
    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[0]).toBe(
      "https://example.com/v1/responses",
    );
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
    expect(streamMock.mock.calls[0]?.[1]).not.toHaveProperty(
      "frequency_penalty",
    );
    expect(streamMock.mock.calls[0]?.[1]).not.toHaveProperty(
      "presence_penalty",
    );
    expect(streamMock.mock.calls[0]?.[1]).not.toHaveProperty("top_p");
  });

  it("工具轮次应可直接消费 AgentEvent 并保持旧 callback 语义", async () => {
    const modelConfig: ModelConfig = {
      name: "gpt-4.1",
      description: "OpenAI",
      features: {
        online: true,
        thinking: true,
        image: false,
        video: false,
        audio: false,
        file: false,
      },
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
          onUpdate?: (
            full: string,
            inc: string,
            reasoningText?: string,
          ) => void;
          onFinish?: (
            content: string,
            reasoning: string,
            res: Response,
          ) => void;
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
      providerConfig,
      modelConfig,
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
    const modelConfig: ModelConfig = {
      name: "gpt-4.1",
      description: "OpenAI",
      features: {
        online: true,
        thinking: true,
        image: false,
        video: false,
        audio: false,
        file: false,
      },
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
      providerConfig,
      modelConfig,
      messages,
      enableTools: true,
    });

    const toolsWithoutSkills =
      streamMock.mock.calls[0]?.[1]?.tools?.map(
        (tool: { function: { name: string } }) => tool.function.name,
      ) ?? [];
    expect(toolsWithoutSkills).toEqual(["lookup"]);

    streamMock.mockClear();

    await chatStreamCore({
      providerConfig,
      modelConfig,
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
        (tool: { function: { name: string } }) => tool.function.name,
      ) ?? [];
    expect(toolsWithSkills).toContain("lookup");
    expect(
      toolsWithSkills.filter((name: string) => name === "list_skills"),
    ).toHaveLength(1);
    expect(
      toolsWithSkills.filter((name: string) => name === "get_skill_readme"),
    ).toHaveLength(1);
  });

  it("传入 skills 时应将多个 system message 合并为一个并保持顺序", async () => {
    const modelConfig: ModelConfig = {
      name: "gpt-4.1",
      description: "OpenAI",
      features: {
        online: true,
        thinking: true,
        image: false,
        video: false,
        audio: false,
        file: false,
      },
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
    normalizeRequestMessagesMock.mockImplementation(
      async (incoming) => incoming,
    );

    await chatStreamCore({
      providerConfig,
      modelConfig,
      messages: requestMessages,
      enableTools: false,
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
      "base-system\n\n## 可用 Skills\n\n以下是预定义的 Skills，当用户请求匹配相关场景时，请使用 `get_skill_readme` 工具获取详细说明：\n\ncode-review metadata:\n  - Name: 代码评审\n  - Description: 用于风险导向代码评审\n  - Path: internal://code-review\n\nextra-policy",
    );
    expect(payloadMessages[1]?.role).toBe("user");
  });

  it("同步 chatLLM 应复用 Agent 主链路而不是旧 chat 分支", async () => {
    const onNotice = vi.fn();
    const modelConfig: ModelConfig = {
      name: "gpt-4.1",
      description: "OpenAI",
      features: {
        online: true,
        thinking: true,
        image: false,
        video: false,
        audio: false,
        file: false,
      },
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
