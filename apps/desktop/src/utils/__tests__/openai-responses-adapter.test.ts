import { describe, expect, it } from "vitest";
import { Role } from "@/constants/llm";
import { buildResponsesPayload } from "../openai-responses-adapter";

describe("openai-responses-adapter", () => {
  it("将 system 消息合并到 instructions，不放入 input", () => {
    const payload = buildResponsesPayload({
      model: "gpt-5.1",
      stream: false,
      messages: [
        {
          role: Role.System,
          content: "你是一个中文助手。",
        },
        {
          role: Role.User,
          content: "你好",
        },
      ],
    });

    expect(payload).toMatchObject({
      instructions: "你是一个中文助手。",
      input: [
        {
          type: "message",
          role: "user",
          content: "你好",
        },
      ],
    });
  });
});
