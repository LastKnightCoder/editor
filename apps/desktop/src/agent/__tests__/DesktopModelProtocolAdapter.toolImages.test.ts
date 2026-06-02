import { describe, expect, it, vi } from "vitest";
import { Role } from "@/constants";
import type { RequestMessage } from "@/types";

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
  mapToStreamPayload,
} from "../DesktopModelProtocolAdapter";

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
