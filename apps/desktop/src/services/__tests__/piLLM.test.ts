/** pi 单发封装（services/piLLM）契约：pi 原生事件直通（partial 全量快照/delta 增量），result 汇总最终消息 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AssistantMessageEvent } from "@earendil-works/pi-ai";
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

import { piStreamChat, piStreamText, toPiChatMessages } from "../piLLM";

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
  samplingParams: { temperature: 0.7 },
};
const messages: RequestMessage[] = [
  { role: "system" as Role.System, content: "系统提示" },
  { role: "user" as Role.User, content: "正文" },
];

const partialOf = (text: string, thinking = "") =>
  ({
    role: "assistant",
    content: [...(thinking ? [{ type: "thinking", thinking }] : []), { type: "text", text }],
  }) as any;

/** 模拟 piAiSingleShot：同步派发事件序列后 resolve ok */
const emitAndResolve = (events: unknown[], ok = true) =>
  singleShotMock.mockImplementationOnce(
    async (_options: unknown, onEvent?: (e: AssistantMessageEvent) => void) => {
      for (const event of events) onEvent?.(event as AssistantMessageEvent);
      return { ok };
    }
  );

beforeEach(() => {
  singleShotMock.mockReset();
  cancelMock.mockReset();
  cancelMock.mockResolvedValue(true);
});

describe("pi 系统消息兼容", () => {
  it("仅系统消息剥离退役代理片段，用户原文保持完整", () => {
    const text = "自定义规则\n<TAU_CODEX_CONTEXT>旧代理指令</TAU_CODEX_CONTEXT>\n后续规则";
    const input: RequestMessage[] = [
      { role: "system" as Role.System, content: text },
      { role: "system" as Role.System, content: [{ type: "text", text }] },
      { role: "user" as Role.User, content: text },
    ];
    expect(toPiChatMessages(input)).toEqual({
      system: "自定义规则\n后续规则\n\n自定义规则\n后续规则",
      messages: [{ role: "user", content: text }],
    });
    expect(input[0].content).toBe(text);
  });

  it("普通系统提示保留原有空白，不改写缓存前缀", () => {
    expect(toPiChatMessages([{ role: "system" as Role.System, content: "规则\n\n" }]).system).toBe(
      "规则\n\n"
    );
  });
});

describe("piStreamChat", () => {
  it("onEvent 收到 pi 原生事件（partial 全量快照）；result 汇总最终正文与消息", async () => {
    emitAndResolve([
      { type: "start" },
      { type: "text_start", contentIndex: 0 },
      { type: "text_delta", contentIndex: 0, delta: "# 剪", partial: partialOf("# 剪") },
      {
        type: "text_delta",
        contentIndex: 0,
        delta: "辑完成",
        partial: partialOf("# 剪辑完成"),
      },
      {
        type: "text_end",
        contentIndex: 0,
        content: "# 剪辑完成",
        partial: partialOf("# 剪辑完成"),
      },
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

    const deltas: string[] = [];
    const snapshots: string[] = [];
    const handle = piStreamChat({ provider, model, messages }, event => {
      if (event.type === "text_delta" && "partial" in event && event.partial) {
        deltas.push(event.delta);
        snapshots.push(
          event.partial.content
            .filter(block => block.type === "text")
            .map(block => (block as { text: string }).text)
            .join("")
        );
      }
    });

    const result = await handle.result;
    // pi 原生语义：delta 是增量，partial 是全量快照——无需桥层累计
    expect(deltas).toEqual(["# 剪", "辑完成"]);
    expect(snapshots).toEqual(["# 剪", "# 剪辑完成"]);
    expect(result.ok).toBe(true);
    expect(result.aborted).toBe(false);
    expect(result.text).toBe("# 剪辑完成");
    expect(result.message).toMatchObject({ stopReason: "stop" });
  });

  it("system 消息抽取传递；模型采样参数随请求下发", async () => {
    emitAndResolve([
      {
        type: "done",
        reason: "stop",
        message: { content: [{ type: "text", text: "答" }], stopReason: "stop" },
      },
    ]);
    await piStreamChat({ provider, model, messages }).result;

    const request = singleShotMock.mock.calls[0][0] as {
      system?: string;
      providerId: string;
      modelId: string;
      temperature?: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.system).toBe("系统提示");
    expect(request.providerId).toBe("p1");
    expect(request.modelId).toBe("m1");
    expect(request.temperature).toBe(0.7);
    expect(request.messages).toEqual([{ role: "user", content: "正文" }]);
  });

  it("outcome 失败时 result.ok=false 且带错误信息", async () => {
    emitAndResolve([{ type: "text_delta", delta: "部分", partial: partialOf("部分") }], false);
    const result = await piStreamChat({ provider, model, messages }).result;
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("流内 error 事件转为失败；reason=aborted 标记中止且不算失败完成", async () => {
    emitAndResolve([
      {
        type: "error",
        reason: "aborted",
        error: { role: "assistant", content: [], errorMessage: "User aborted" },
      },
    ]);
    const result = await piStreamChat({ provider, model, messages }).result;
    // 中止语义：ok=true + aborted=true，消费方按 aborted 跳过完成态处理
    expect(result.ok).toBe(true);
    expect(result.aborted).toBe(true);
  });

  it("cancel 联动 piAiCancel；中止后 result 带 aborted 标记", async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    singleShotMock.mockImplementationOnce(
      async (_options: unknown, onEvent?: (e: AssistantMessageEvent) => void) => {
        onEvent?.({ type: "text_delta", delta: "x", partial: partialOf("x") } as any);
        await pending;
        return { ok: true };
      }
    );
    const handle = piStreamChat({ provider, model, messages });
    handle.cancel();
    release();
    const result = await handle.result;
    expect(cancelMock).toHaveBeenCalledWith(expect.any(String));
    expect(result.aborted).toBe(true);
  });
});

describe("piStreamText", () => {
  it("文本快照流在内容变化时回调全量（partial 语义）", async () => {
    emitAndResolve([
      { type: "thinking_delta", delta: "思", partial: partialOf("", "思") },
      { type: "text_delta", delta: "# 剪", partial: partialOf("# 剪", "思") },
      {
        type: "done",
        reason: "stop",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "思" },
            { type: "text", text: "# 剪辑完成" },
          ],
          stopReason: "stop",
        },
      },
    ]);

    const snapshots: Array<{ text: string; reasoning: string }> = [];
    const result = await piStreamText({ provider, model, messages }, snapshot =>
      snapshots.push(snapshot)
    ).result;

    expect(snapshots).toEqual([
      { text: "", reasoning: "思" },
      { text: "# 剪", reasoning: "思" },
      { text: "# 剪辑完成", reasoning: "思" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.text).toBe("# 剪辑完成");
    expect(result.reasoning).toBe("思");
  });
});
