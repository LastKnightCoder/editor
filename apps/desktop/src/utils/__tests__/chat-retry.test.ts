import { describe, expect, it } from "vitest";
import { DEFAULT_CHAT_MAX_RETRIES, isContextLengthError } from "../chat-retry";

describe("聊天请求重试判定", () => {
  it("默认最多重试 5 次", () => {
    expect(DEFAULT_CHAT_MAX_RETRIES).toBe(5);
  });

  it.each([
    "maximum context length is 128k tokens",
    "context_length_exceeded",
    "prompt is too long for this model",
    "too many tokens in the request",
    "上下文长度超出模型限制",
  ])("识别上下文超限错误: %s", (errorMessage) => {
    expect(isContextLengthError(new Error(errorMessage))).toBe(true);
  });

  it("普通网络错误允许进入重试流程", () => {
    expect(isContextLengthError(new Error("fetch failed"))).toBe(false);
  });
});
