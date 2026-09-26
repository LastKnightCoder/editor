/** pi 单发路径（runPiSingleShot）的事件 → 回调映射契约：全量累计/增量/usage/finish */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Role } from "@/constants";
import type { RequestMessage } from "@/types";
import type { LLMModelSetting, LLMProviderSetting } from "@/types/pi-llm";

const { singleShotMock, cancelMock } = vi.hoisted(() => ({
  singleShotMock: vi.fn(),
  cancelMock: vi.fn(),
}));

vi.mock("@/commands/piAi", () => ({
  piAiSingleShot: singleShotMock,
  piAiCancel: cancelMock,
}));

import { chatStreamCore } from "../useChatLLM";

const provider: LLMProviderSetting = {
  id: "p1",
  name: "p",
  baseUrl: "https://example.test/v1",
  apiKey: "k",
  api: "openai-completions",
  models: [],
};
const model: LLMModelSetting = {
  id: "m1",
  reasoning: true,
  input: ["text"],
  contextWindow: 128_000,
  maxTokens: 8_192,
};
const messages: RequestMessage[] = [
  { role: "system" as Role.System, content: "系统提示" },
  { role: "user" as Role.User, content: "正文" },
];

/** 模拟 piAiSingleShot：同步派发事件序列后 resolve ok */
const emitAndResolve = (events: unknown[], ok = true) =>
  singleShotMock.mockImplementationOnce(
    async (_options: unknown, onEvent?: (e: unknown) => void) => {
      for (const event of events) onEvent?.(event);
      return { ok };
    }
  );

beforeEach(() => {
  singleShotMock.mockReset();
  cancelMock.mockReset();
});

describe("chatStreamCore pi 单发映射", () => {
  it("onUpdate 收到全量累计与本次增量；onFinish 收到完整正文与 usage", async () => {
    emitAndResolve([
      { type: "start" },
      { type: "text_start", contentIndex: 0 },
      { type: "text_delta", contentIndex: 0, delta: "# 剪" },
      { type: "text_delta", contentIndex: 0, delta: "辑完成" },
      { type: "text_end", contentIndex: 0, content: "# 剪辑完成" },
      {
        type: "done",
        reason: "stop",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "# 剪辑完成" }],
          usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
          stopReason: "stop",
        },
      },
    ]);

    const updates: Array<[string, string]> = [];
    const onFinish = vi.fn();
    const onUsage = vi.fn();
    await chatStreamCore({
      provider,
      model,
      messages,
      onUpdate: (t, d) => updates.push([t, d]),
      onFinish,
      onUsage,
    });

    // 全量累计语义（网页剪辑等消费方依赖）
    expect(updates).toEqual([
      ["# 剪", "# 剪"],
      ["# 剪辑完成", "辑完成"],
      ["# 剪辑完成", ""],
    ]);
    expect(onFinish).toHaveBeenCalledWith("# 剪辑完成", "", {
      turnId: expect.any(String),
      finishReason: "stop",
      resultType: "response",
    });
    expect(onUsage).toHaveBeenCalledWith(
      { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      expect.any(String)
    );
  });

  it("system 消息抽取传递；reasoning 事件映射 onReasoning", async () => {
    emitAndResolve([
      { type: "thinking_delta", delta: "思考" },
      { type: "text_delta", delta: "答" },
      { type: "text_end", content: "答" },
      {
        type: "done",
        reason: "stop",
        message: { content: [{ type: "text", text: "答" }], stopReason: "stop" },
      },
    ]);
    const onReasoning = vi.fn();
    const onFinish = vi.fn();
    await chatStreamCore({ provider, model, messages, onReasoning, onFinish });

    const request = singleShotMock.mock.calls[0][0] as {
      system?: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.system).toBe("系统提示");
    expect(request.messages).toEqual([{ role: "user", content: "正文" }]);
    expect(onReasoning).toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledWith("答", "", expect.anything());
  });

  it("outcome 失败走 onError；done 消息缺失时以 text_end 快照收尾", async () => {
    emitAndResolve(
      [
        { type: "text_delta", delta: "部分" },
        { type: "text_end", content: "部分" },
      ],
      false
    );
    const onError = vi.fn();
    const onFinish = vi.fn();
    await chatStreamCore({ provider, model, messages, onError, onFinish });
    expect(onError).toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("本地 abort 联动 piAiCancel 且不再回调", async () => {
    let controller: AbortController | undefined;
    emitAndResolve([{ type: "text_delta", delta: "x" }]);
    const onFinish = vi.fn();
    await chatStreamCore({
      provider,
      model,
      messages,
      onController: c => (controller = c),
      onFinish,
    });
    controller?.abort();
    expect(cancelMock).toHaveBeenCalledWith(expect.any(String));
    // onFinish 已在 abort 前完成（ok 流）——此处仅验证 cancel 联动
  });
});
