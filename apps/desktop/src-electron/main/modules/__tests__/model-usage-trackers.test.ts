import { describe, expect, it } from "vitest";
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";
import {
  createSessionUsageTracker,
  createStreamUsageTracker,
  featureOfScope,
  parseSessionScope,
  type LlmUsageContext,
} from "../model-usage/trackers";
import type { UsageRecordInput } from "../model-usage/recorder";

const context: LlmUsageContext = {
  providerId: "p1",
  modelId: "m1",
  feature: "webClip",
  scope: null,
  sessionId: null,
  entityId: null,
  library: "data",
};

const message = (overrides: Partial<AssistantMessage> = {}): AssistantMessage =>
  ({
    role: "assistant",
    content: [{ type: "text", text: "hi" }],
    api: "openai-completions",
    provider: "p1",
    model: "m1",
    usage: {
      input: 100,
      output: 40,
      cacheRead: 10,
      cacheWrite: 0,
      reasoning: 5,
      totalTokens: 150,
      cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
    },
    stopReason: "stop",
    timestamp: 0,
    ...overrides,
  }) as AssistantMessage;

const clock = (times: number[]) => {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)];
};

describe("createStreamUsageTracker", () => {
  it("成功：记录 token、费用、延迟与首 token", () => {
    const records: UsageRecordInput[] = [];
    // 调用顺序：start、首个 delta、finish
    const tracker = createStreamUsageTracker(context, r => records.push(r), clock([0, 120, 500]));
    const partial = message();
    tracker.observe({ type: "start", partial } as AssistantMessageEvent);
    tracker.observe({ type: "text_delta", contentIndex: 0, delta: "h", partial });
    tracker.observe({ type: "text_delta", contentIndex: 0, delta: "i", partial });
    tracker.observe({ type: "done", reason: "stop", message: message() });
    tracker.finish({ aborted: false });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      status: "ok",
      feature: "webClip",
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      reasoningTokens: 5,
      totalTokens: 150,
      cost: 0.003,
      costSource: "catalog",
      latencyMs: 500,
      ttftMs: 120,
      errorMessage: null,
    });
  });

  it("中途取消：用最后的 partial 快照、标记 aborted", () => {
    const records: UsageRecordInput[] = [];
    const tracker = createStreamUsageTracker(context, r => records.push(r), clock([0, 50, 80]));
    const partial = message({
      stopReason: "pending" as never,
      usage: {
        ...message().usage,
        output: 7,
        totalTokens: 7,
        cost: { ...message().usage.cost, total: 0 },
      },
    });
    tracker.observe({ type: "text_delta", contentIndex: 0, delta: "x", partial });
    tracker.finish({ aborted: true });
    expect(records[0]).toMatchObject({ status: "aborted", outputTokens: 7, costSource: "none" });
  });

  it("模型有自定义单价时费用来源记为 custom", () => {
    const records: UsageRecordInput[] = [];
    const tracker = createStreamUsageTracker(
      { ...context, customCost: true },
      r => records.push(r),
      clock([0, 10])
    );
    tracker.observe({ type: "done", reason: "stop", message: message() });
    tracker.finish({ aborted: false });
    expect(records[0].costSource).toBe("custom");
  });

  it("流内 error 事件：取错误消息", () => {
    const records: UsageRecordInput[] = [];
    const tracker = createStreamUsageTracker(context, r => records.push(r), clock([0, 10]));
    tracker.observe({
      type: "error",
      reason: "error",
      error: message({ stopReason: "error", errorMessage: "401 unauthorized" }),
    });
    tracker.finish({ aborted: false, error: "401 unauthorized" });
    expect(records[0]).toMatchObject({
      status: "error",
      errorMessage: "401 unauthorized",
      ttftMs: null,
    });
  });

  it("没有任何事件就抛错：零 token 记为 error", () => {
    const records: UsageRecordInput[] = [];
    const tracker = createStreamUsageTracker(context, r => records.push(r), clock([0, 5]));
    tracker.finish({ aborted: false, error: "network down" });
    tracker.finish({ aborted: false, error: "again" });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      status: "error",
      errorMessage: "network down",
      totalTokens: 0,
    });
  });
});

describe("createSessionUsageTracker", () => {
  it("多轮工具调用每轮一条，忽略非 assistant 消息", () => {
    const records: UsageRecordInput[] = [];
    const track = createSessionUsageTracker(
      () => ({ ...context, feature: "chat", scope: "main-chat", sessionId: "s1" }),
      r => records.push(r),
      clock([0, 10, 30, 100, 200, 210, 260, 400])
    );
    const round = (usage: Partial<AssistantMessage["usage"]>) => {
      track({ type: "turn_start" });
      track({ type: "message_start", message: { role: "assistant" } });
      track({
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: "a",
          partial: message(),
        },
      });
      track({ type: "message_end", message: message({ usage: { ...message().usage, ...usage } }) });
    };
    track({ type: "message_start", message: { role: "user" } });
    track({ type: "message_end", message: { role: "user" } });
    round({ input: 100 });
    track({ type: "tool_execution_start" });
    round({ input: 300 });

    expect(records).toHaveLength(2);
    expect(records.map(r => r.inputTokens)).toEqual([100, 300]);
    expect(records[0]).toMatchObject({
      scope: "main-chat",
      sessionId: "s1",
      latencyMs: 100,
      ttftMs: 30,
    });
    expect(records[1]).toMatchObject({ latencyMs: 200, ttftMs: 60 });
  });

  it("assistant 以 aborted 结束记为 aborted", () => {
    const records: UsageRecordInput[] = [];
    const track = createSessionUsageTracker(
      () => context,
      r => records.push(r),
      clock([0, 1])
    );
    track({ type: "message_end", message: message({ stopReason: "aborted" }) });
    expect(records[0].status).toBe("aborted");
  });
});

describe("parseSessionScope", () => {
  it.each([
    ["data\u0000main-chat:abc", { scope: "main-chat", library: "data" }],
    ["work\u0000pdf-chat:12", { scope: "pdf-chat", library: "work" }],
    ["data\u0000main-chat:abc:subagent:t1", { scope: "subagent", library: "data" }],
    ["browser:xyz", { scope: "browser", library: null }],
    ["inline-content-edit:42", { scope: "inline-content-edit", library: null }],
    ["one-shot:uuid", { scope: "one-shot", library: null }],
  ])("%s", (key, expected) => {
    expect(parseSessionScope(key)).toEqual(expected);
  });

  it("scope 映射功能", () => {
    expect(featureOfScope("main-chat")).toBe("chat");
    expect(featureOfScope("one-shot")).toBe("unknown");
  });
});
