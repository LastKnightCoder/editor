import { describe, expect, it, vi } from "vitest";
import { Role } from "@/constants";
import type {
  ModelConfig,
  ProviderConfig,
  ReasoningEffort,
  RequestMessage,
} from "@/types";

vi.mock("@/commands", () => ({
  createResponsesStreamParser: () => ({ parse: () => undefined }),
}));

vi.mock("@/services/chatMessageNormalization", () => ({
  normalizeRequestMessages: async (messages: RequestMessage[]) => messages,
}));

vi.mock("@/services/assistantMessageBlocks", () => ({
  sanitizeToolMessages: (messages: RequestMessage[]) => messages,
}));

vi.mock("@/utils/model-overrides", () => ({
  getModelRequestOverrides: () => ({}),
}));

vi.mock("@/utils/openai-responses-adapter", () => ({
  buildResponsesPayload: () => ({}),
}));

vi.mock("@/utils/thinkTagNormalizer", () => ({
  createThinkTagNormalizer: () => ({
    push: (content: string) => ({ content, reasoning_content: "" }),
    flush: () => ({ content: "", reasoning_content: "" }),
  }),
}));

import {
  buildClaudeMessages,
  DesktopModelProtocolAdapter,
  mapToStreamPayload,
} from "../DesktopModelProtocolAdapter";

const providerConfig: ProviderConfig = {
  id: "claude-provider",
  name: "Claude",
  apiKey: "test-key",
  baseUrl: "https://api.anthropic.com",
  models: [],
};

const prepareClaudeTurn = async (
  modelName: string,
  reasoningEffort?: ReasoningEffort,
  maxOutputTokens = 8192,
) => {
  const modelConfig: ModelConfig = {
    name: modelName,
    description: "Claude",
    messageFormat: "claude",
    maxOutputTokens,
    features: {
      online: false,
      thinking: true,
      image: false,
      video: false,
      audio: false,
      file: false,
    },
  };
  const controller = new AbortController();
  return new DesktopModelProtocolAdapter(
    providerConfig,
    modelConfig,
  ).prepareTurn({
    messages: [{ role: Role.User, content: "测试" }],
    controller,
    signal: controller.signal,
    traceId: "trace-1",
    runId: "run-1",
    turnId: "turn-1",
    reasoningEffort,
  });
};

const toolImageMessages: RequestMessage[] = [
  {
    role: Role.Assistant,
    content: "",
    tool_calls: [
      {
        id: "call-1",
        type: "function",
        function: {
          name: "read_image",
          arguments: '{"path":"image.png"}',
        },
      },
    ],
  },
  {
    role: Role.Tool,
    name: "read_image",
    tool_call_id: "call-1",
    content: [
      { type: "text", text: "已读取图片 image.png" },
      { type: "image", image: "data:image/png;base64,AAAA" },
    ],
  },
];

describe("DesktopModelProtocolAdapter tool image bridging", () => {
  it("Chat Completions 保留 tool 文本，并追加 synthetic user 图片消息", () => {
    const payload = mapToStreamPayload(toolImageMessages) as any[];

    expect(payload[0]).toMatchObject({
      role: Role.Assistant,
      tool_calls: toolImageMessages[0].tool_calls,
    });
    expect(payload[1]).toMatchObject({
      role: "tool",
      content: "已读取图片 image.png",
      tool_call_id: "call-1",
    });
    expect(payload[2]).toMatchObject({
      role: "user",
      content: [
        expect.objectContaining({ type: "text" }),
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,AAAA" },
        },
      ],
    });
  });

  it("Claude 将图片放入 tool_result.content", () => {
    const { messages } = buildClaudeMessages(toolImageMessages);
    const assistantMessage = messages.find(
      (message) => message.role === "assistant",
    );
    const toolResultMessage = messages.find(
      (message) =>
        message.role === "user" &&
        Array.isArray(message.content) &&
        message.content.some((block) => block.type === "tool_result"),
    );

    expect(assistantMessage).toMatchObject({
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "call-1",
          name: "read_image",
        },
      ],
    });
    expect(toolResultMessage).toMatchObject({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "call-1",
          content: [
            { type: "text", text: "已读取图片 image.png" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "AAAA",
              },
            },
          ],
        },
      ],
    });
  });
});

describe("DesktopModelProtocolAdapter Claude thinking", () => {
  it("Claude 4.6 使用 adaptive thinking 和 output_config.effort", async () => {
    const prepared = await prepareClaudeTurn("claude-sonnet-4-6", "high");

    expect(prepared.payload).toMatchObject({
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "high" },
    });
  });

  it("旧版 Claude 按推理强度设置 thinking budget", async () => {
    const prepared = await prepareClaudeTurn("claude-sonnet-4-5", "medium");

    expect(prepared.payload).toMatchObject({
      thinking: { type: "enabled", budget_tokens: 4096 },
    });
    expect(prepared.payload).not.toHaveProperty("output_config");
  });

  it("可关闭思考的新模型显式发送 disabled", async () => {
    const prepared = await prepareClaudeTurn("claude-sonnet-5", "none");

    expect(prepared.payload).toMatchObject({
      thinking: { type: "disabled" },
    });
  });

  it("始终开启思考的模型不会发送不支持的 disabled", async () => {
    const prepared = await prepareClaudeTurn("claude-fable-5", "none");

    expect(prepared.payload).not.toHaveProperty("thinking");
  });

  it("流式思考块连同签名和脱敏块原样回传", async () => {
    const prepared = await prepareClaudeTurn("claude-opus-4-6", "high");
    const parse = (event: unknown) =>
      prepared.parser.parse(JSON.stringify(event));

    parse({
      type: "content_block_start",
      index: 0,
      content_block: { type: "thinking", thinking: "", signature: "" },
    });
    parse({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "先分析" },
    });
    parse({
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "signed-thinking" },
    });
    parse({
      type: "content_block_start",
      index: 1,
      content_block: { type: "redacted_thinking", data: "encrypted" },
    });
    parse({
      type: "content_block_start",
      index: 2,
      content_block: {
        type: "tool_use",
        id: "toolu-1",
        name: "lookup",
        input: {},
      },
    });
    parse({
      type: "content_block_delta",
      index: 2,
      delta: { type: "input_json_delta", partial_json: '{"q":"docs"}' },
    });

    const providerMetadata = prepared.parser.getProviderMetadata?.();
    expect(providerMetadata).toEqual({
      claude: {
        model: "claude-opus-4-6",
        content: [
          {
            type: "thinking",
            thinking: "先分析",
            signature: "signed-thinking",
          },
          { type: "redacted_thinking", data: "encrypted" },
          {
            type: "tool_use",
            id: "toolu-1",
            name: "lookup",
            input: { q: "docs" },
          },
        ],
      },
    });

    const { messages } = buildClaudeMessages([
      {
        role: Role.Assistant,
        content: "",
        reasoning_content: "先分析",
        provider_metadata: providerMetadata,
        tool_calls: [
          {
            id: "toolu-1",
            type: "function",
            function: { name: "lookup", arguments: '{"q":"docs"}' },
          },
        ],
      },
      {
        role: Role.Tool,
        tool_call_id: "toolu-1",
        name: "lookup",
        content: "结果",
      },
    ]);
    const assistant = messages.find((message) => message.role === "assistant");

    expect(assistant?.content).toMatchObject(
      (providerMetadata?.claude as { content: unknown[] }).content,
    );
  });
});
