import { describe, expect, it } from "vitest";
import type { ChatSessionMessage, ResponseMessage } from "@/types";
import { latestContextUsage } from "../chatContextUsage";
import { piEntriesToDesktopMessages } from "../../../src-electron/main/modules/pi-session-transcript";

const model = { id: "gpt-6-sol", name: "GPT-6 Sol" };
const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 };
const assistant = (identity: object): ChatSessionMessage =>
  ({ role: "assistant", content: "回答", usage: { ...usage, ...identity } }) as ResponseMessage;

describe("上下文用量身份与会话投影", () => {
  it("模型 ID 与显示名不同、显示名修改均不丢失实际用量", () => {
    const messages = [assistant({ providerId: "p", modelId: model.id })];
    expect(latestContextUsage(messages, "p", model)?.inputTokens).toBe(100);
    expect(latestContextUsage(messages, "p", { ...model, name: "自定义名称" })).not.toBeNull();
  });

  it.each([model.id, model.name])("兼容旧 modelName：%s", modelName => {
    expect(latestContextUsage([assistant({ modelName })], "p", model)).not.toBeNull();
  });

  it("切换服务商或模型不展示旧模型的用量，也不向前寻找过期用量", () => {
    const messages = [assistant({ providerId: "p", modelId: model.id })];
    expect(latestContextUsage(messages, "other", model)).toBeNull();
    expect(latestContextUsage(messages, "p", { id: "other", name: model.name })).toBeNull();
    messages.push(assistant({ modelId: "other" }));
    expect(latestContextUsage(messages, "p", model)).toBeNull();
  });

  it("重读工具循环后保留最后一轮占用，缓存计入输入，身份使用 ID", () => {
    const messages = piEntriesToDesktopMessages([
      {
        id: "a",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "第一轮" }],
          provider: "p",
          model: model.id,
          usage: { input: 100, output: 10 },
        },
      },
      {
        id: "b",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "最终回答" }],
          provider: "p",
          model: model.id,
          usage: { input: 20, output: 30, cacheRead: 100, cacheWrite: 5 },
        },
      },
    ]);
    expect(latestContextUsage(messages, "p", model)).toEqual({
      providerId: "p",
      modelId: model.id,
      inputTokens: 125,
      outputTokens: 30,
      cacheReadTokens: 100,
      cacheWriteTokens: 5,
    });
  });

  it("没有返回 usage 时不制造零用量", () => {
    const messages = piEntriesToDesktopMessages([
      { id: "a", message: { role: "assistant", content: [{ type: "text", text: "回答" }] } },
    ]);
    expect(latestContextUsage(messages, "p", model)).toBeNull();
  });
});
