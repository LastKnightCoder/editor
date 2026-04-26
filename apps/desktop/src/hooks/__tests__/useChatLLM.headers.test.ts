import { describe, expect, it, vi, beforeEach } from "vitest";
import { Role } from "@/constants";
import type { ProviderConfig, ModelConfig, RequestMessage } from "@/types/llm";

const { streamMock, normalizeRequestMessagesMock } = vi.hoisted(() => ({
  streamMock: vi.fn(),
  normalizeRequestMessagesMock: vi.fn(),
}));

vi.mock("@/commands", () => ({
  chat: vi.fn(),
  chatResponses: vi.fn(),
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
    executeToolCall: vi.fn(),
  },
  ensureToolingReady: vi.fn(),
}));

vi.mock("@/tools/toolIntegrationRegistry", () => ({
  toolIntegrationRegistry: {
    upsertStreamingExecutions: vi.fn((executions) => executions),
  },
}));

vi.mock("@/tools/toolRuntimePolicy", () => ({
  filterConflictingToolSchemas: vi.fn((schemas) => schemas),
  shouldSkipToolTimeout: vi.fn(() => false),
}));

import { chatStreamCore } from "../useChatLLM";

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
    normalizeRequestMessagesMock.mockReset();
    normalizeRequestMessagesMock.mockResolvedValue(messages);
    streamMock.mockResolvedValue({
      type: "response",
      finishReason: "stop",
      content: "ok",
      reasoning_content: "",
    });
  });

  it("kimi-for-coding 应注入 KimiCLI User-Agent", async () => {
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
    });

    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[2]).toMatchObject({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "KimiCLI/1.37.0",
    });
  });

  it("其他模型不应额外注入 KimiCLI User-Agent", async () => {
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
    });

    expect(streamMock).toHaveBeenCalledOnce();
    expect(streamMock.mock.calls[0]?.[2]).not.toHaveProperty("User-Agent");
  });

  it("Responses 模型应请求 /responses 并使用无状态 payload", async () => {
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
    });

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
});
