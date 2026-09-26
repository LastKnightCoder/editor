import { describe, expect, it } from "vitest";
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";
import { createThinkTagRewriter } from "../think-stream-rewriter";

/** 手造 pi 流事件（partial 用占位，重写器不读它） */
const ev = {
  start: () => ({ type: "start", partial: {} }) as unknown as AssistantMessageEvent,
  textStart: (i: number) =>
    ({ type: "text_start", contentIndex: i, partial: {} }) as unknown as AssistantMessageEvent,
  textDelta: (i: number, delta: string) =>
    ({
      type: "text_delta",
      contentIndex: i,
      delta,
      partial: {},
    }) as unknown as AssistantMessageEvent,
  textEnd: (i: number) =>
    ({
      type: "text_end",
      contentIndex: i,
      content: "",
      partial: {},
    }) as unknown as AssistantMessageEvent,
  toolcallStart: (i: number) =>
    ({ type: "toolcall_start", contentIndex: i, partial: {} }) as unknown as AssistantMessageEvent,
  toolcallEnd: (i: number) =>
    ({
      type: "toolcall_end",
      contentIndex: i,
      toolCall: { type: "toolCall", id: "c1", name: "echo", arguments: {} },
      partial: {},
    }) as unknown as AssistantMessageEvent,
  done: (content: AssistantMessage["content"]) =>
    ({
      type: "done",
      reason: "stop",
      message: {
        role: "assistant",
        content,
        api: "openai-completions",
        provider: "p",
        model: "m",
        usage: {
          input: 1,
          output: 1,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 2,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 0,
      },
    }) as AssistantMessageEvent,
};

const run = (events: AssistantMessageEvent[]) => {
  const rewriter = createThinkTagRewriter();
  return events.flatMap(e => rewriter.process(e));
};

const summary = (events: ReturnType<typeof run>) =>
  events
    .map(e =>
      e.type === "text_delta" || e.type === "thinking_delta" ? `${e.type}(${e.delta})` : e.type
    )
    .join(" → ");

describe("createThinkTagRewriter", () => {
  it("纯文本流：事件等价直通（contentIndex 重排自洽）", () => {
    const out = run([
      ev.start(),
      ev.textStart(0),
      ev.textDelta(0, "你好"),
      ev.textDelta(0, "世界"),
      ev.textEnd(0),
      ev.done([{ type: "text", text: "你好世界" }]),
    ]);
    expect(summary(out)).toBe(
      "start → text_start → text_delta(你好) → text_delta(世界) → text_end → done"
    );
  });

  it("半标签跨 chunk：标签被正确拼接切分", () => {
    const out = run([
      ev.textStart(0),
      ev.textDelta(0, "<thi"),
      ev.textDelta(0, "nk>推理中</th"),
      ev.textDelta(0, "ink>正"),
      ev.textDelta(0, "文"),
      ev.textEnd(0),
      ev.done([{ type: "text", text: "<think>推理中</think>正文" }]),
    ]);
    expect(summary(out)).toBe(
      "thinking_start → thinking_delta(推理中) → thinking_end → text_start → text_delta(正) → text_delta(文) → text_end → done"
    );
  });

  it("未闭合标签：flush 后剩余全部归 thinking", () => {
    const out = run([
      ev.textStart(0),
      ev.textDelta(0, "<think>一路推理到底没有闭合"),
      ev.textEnd(0),
      ev.done([{ type: "text", text: "<think>一路推理到底没有闭合" }]),
    ]);
    expect(summary(out)).toBe(
      "thinking_start → thinking_delta(一路推理到底没有闭合) → thinking_end → done"
    );
  });

  it("标签前正文保留，多段交错正确收发", () => {
    const out = run([
      ev.textStart(0),
      ev.textDelta(0, "前文<think>思考"),
      ev.textDelta(0, "片段</think>后文"),
      ev.textEnd(0),
      ev.done([{ type: "text", text: "前文<think>思考片段</think>后文" }]),
    ]);
    expect(summary(out)).toBe(
      "text_start → text_delta(前文) → text_end → thinking_start → thinking_delta(思考) → thinking_delta(片段) → thinking_end → text_start → text_delta(后文) → text_end → done"
    );
  });

  it("toolcall 混排 + done.message 重建：thinking/text/toolCall 按序展开且与事件 contentIndex 一致", () => {
    const out = run([
      ev.start(),
      ev.textStart(0),
      ev.textDelta(0, "<think>要调工具</think>好的"),
      ev.textEnd(0),
      ev.toolcallStart(1),
      ev.toolcallEnd(1),
      ev.done([
        { type: "text", text: "<think>要调工具</think>好的" },
        { type: "toolCall", id: "c1", name: "echo", arguments: {} },
      ]),
    ]);
    const done = out.find(e => e.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type !== "done") throw new Error("unreachable");
    expect(done.message.content).toEqual([
      { type: "thinking", thinking: "要调工具" },
      { type: "text", text: "好的" },
      { type: "toolCall", id: "c1", name: "echo", arguments: {} },
    ]);
    // 事件层 contentIndex：thinking=0、text=1、toolcall=2（与重建后的 content 下标一致）
    const indexed = out.filter(e => e.type !== "start" && e.type !== "done");
    expect(indexed.map(e => (e as { contentIndex: number }).contentIndex)).toEqual([
      0, 0, 0, 1, 1, 1, 2, 2,
    ]);
  });

  it("start/error 等其余事件去 partial 透传", () => {
    const out = run([
      { type: "error", reason: "error", error: { role: "assistant" } } as AssistantMessageEvent,
    ]);
    expect(out).toEqual([{ type: "error", reason: "error", error: { role: "assistant" } }]);
  });
});
