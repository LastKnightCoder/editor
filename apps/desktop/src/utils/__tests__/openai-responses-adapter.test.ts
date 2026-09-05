import { describe, expect, it } from "vitest";
import { Role } from "@/constants/llm";
import { buildResponsesPayload } from "../openai-responses-adapter";

describe("openai-responses-adapter", () => {
  it("透传 OpenAI 的 max 推理强度", () => {
    const payload = buildResponsesPayload({
      model: "gpt-5.6",
      stream: true,
      reasoningEffort: "max",
      messages: [{ role: Role.User, content: "你好" }],
    });

    expect(payload.reasoning).toEqual({ effort: "max" });
  });

  it("透传模型配置的 temperature", () => {
    const payload = buildResponsesPayload({
      model: "kimi-k3",
      stream: true,
      temperature: 1,
      messages: [{ role: Role.User, content: "你好" }],
    });

    expect(payload.temperature).toBe(1);
  });

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

  it("将 tool 图片结果映射为 function_call_output 的 input_image", () => {
    const payload = buildResponsesPayload({
      model: "gpt-5.1",
      stream: false,
      messages: [
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
      ],
    });

    expect(payload.input[1]).toMatchObject({
      type: "function_call_output",
      call_id: "call-1",
      output: [
        { type: "input_text", text: "已读取图片 image.png" },
        { type: "input_image", image_url: "data:image/png;base64,AAAA" },
      ],
    });
  });
});
