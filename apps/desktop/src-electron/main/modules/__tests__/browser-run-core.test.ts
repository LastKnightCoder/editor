/**
 * 扩展运行编排（M5，协议 v2）：事件带递增 seq、最后一条一定是 settled；停止（含会话还没建好时就停）；
 * 同一扩展对话同时只跑一轮（两个标签页并发）；报错与重试转发；交互快照转成 v2 形状并能作答。
 */
import { describe, expect, it, vi } from "vitest";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AiRunEventNotification, AiRunStartParams } from "@tau/shared";
import type { PiSessionInteractionSnapshot } from "@/types/pi-session";
import {
  BrowserRunRegistry,
  resolveChatModel,
  type BrowserRunDriver,
  type BrowserRunHandle,
} from "../browser-run-core";

vi.mock("@/constants", () => ({ Role: { Assistant: "assistant", User: "user" } }));

const params = (runId: string, sessionId = "s1"): AiRunStartParams => ({
  runId,
  messages: [{ role: "user", content: "你好" }],
  session: { id: sessionId, pageUrl: "https://a.com/p" },
});

/** 可手动推进的假 driver：测试里逐个喂 pi 事件、交互快照，最后结束 */
const fakeDriver = () => {
  let hooks!: Parameters<BrowserRunDriver["start"]>[1];
  let finish!: (outcome: { ok: boolean; aborted: boolean; error?: string }) => void;
  let startResolve!: () => void;
  const started = new Promise<void>(resolve => {
    startResolve = resolve;
  });
  const abort = vi.fn(async () => finish({ ok: true, aborted: true }));
  const answer = vi.fn(() => undefined);
  const gate = { hold: false, release: () => {} };
  const baseMessages = [{ role: "user", content: "上一轮" }] as never[];
  const driver: BrowserRunDriver = {
    start: async (_params, runHooks) => {
      if (gate.hold) await new Promise<void>(resolve => (gate.release = resolve));
      hooks = runHooks;
      const done = new Promise<{ ok: boolean; aborted: boolean; error?: string }>(resolve => {
        finish = resolve;
      });
      const handle: BrowserRunHandle = {
        baseMessages,
        done,
        abort,
        approve: () => true,
        answer,
      };
      startResolve();
      return handle;
    },
  };
  return {
    driver,
    started,
    gate,
    abort,
    answer,
    baseMessages,
    emit: (event: Partial<AgentSessionEvent> & { type: string }) =>
      hooks.onEvent(event as AgentSessionEvent),
    interactions: (snapshot: PiSessionInteractionSnapshot) => hooks.onInteractions(snapshot),
    finish: (outcome: { ok: boolean; aborted: boolean; error?: string }) => finish(outcome),
  };
};

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

/** 归约器按 message_start 开 turn、message_end 收 turn */
const assistantStart = { type: "message_start", message: { role: "assistant", content: [] } };

const assistantEnd = (text: string, extra: Record<string, unknown> = {}) => ({
  type: "message_end",
  message: {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "stop",
    ...extra,
  },
});

describe("BrowserRunRegistry", () => {
  it("相同页面不同锚点共用运行互斥与接回身份", () => {
    const fake = fakeDriver();
    const registry = new BrowserRunRegistry(fake.driver, () => {});
    registry.start({ ...params("a"), session: { id: "s", pageUrl: "https://a.com/p#a" } });
    expect(
      registry.start({ ...params("b"), session: { id: "s", pageUrl: "https://a.com/p#b" } }).ok
    ).toBe(false);
    expect(registry.snapshotFor({ id: "s", pageUrl: "https://a.com/p#b" }, () => [])?.runId).toBe(
      "a"
    );
  });
  it("事件按 runId 推送、seq 递增，最后一条是 settled（带最后一段正文）", async () => {
    const fake = fakeDriver();
    const published: AiRunEventNotification[] = [];
    const registry = new BrowserRunRegistry(fake.driver, item => published.push(item));

    expect(registry.start(params("r1"))).toEqual({ ok: true });
    await fake.started;
    fake.emit({ type: "agent_start" });
    fake.emit(assistantStart as never);
    fake.emit(assistantEnd("回答完了") as never);
    fake.finish({ ok: true, aborted: false });
    await flush();

    expect(published.every(item => item.runId === "r1")).toBe(true);
    expect(published.map(item => item.seq)).toEqual(published.map((_, index) => index));
    const last = published.at(-1)!.event;
    expect(last).toMatchObject({ type: "settled", ok: true, aborted: false, lastText: "回答完了" });
    expect(published.some(item => item.event.type === "text")).toBe(true);
    // 结束后同一对话可以再跑
    expect(registry.start(params("r2"))).toEqual({ ok: true });
  });

  it("同一扩展对话已经在跑：第二个标签页的请求被拒；不同对话互不影响", async () => {
    const fake = fakeDriver();
    const registry = new BrowserRunRegistry(fake.driver, () => {});
    expect(registry.start(params("r1", "same"))).toEqual({ ok: true });
    expect(registry.start(params("r2", "same"))).toMatchObject({ ok: false });
    const readBase = () => [];
    expect(registry.snapshotFor({ id: "same", pageUrl: "https://a.com/p" }, readBase)?.runId).toBe(
      "r1"
    );
    expect(
      registry.snapshotFor({ id: "other", pageUrl: "https://a.com/p" }, readBase)
    ).toBeUndefined();
  });

  it("接回快照：回答按同一套归约、交互与重试状态跟到此刻、lastSeq 与已推送的最后一条对齐", async () => {
    const fake = fakeDriver();
    const published: AiRunEventNotification[] = [];
    const registry = new BrowserRunRegistry(fake.driver, item => published.push(item));
    const session = { id: "s1", pageUrl: "https://a.com/p" };
    const fileBase = [{ role: "user", content: "文件里的" }] as never;

    registry.start(params("r1"));
    // 会话还在建（没有句柄）：底取会话文件的投影
    expect(registry.snapshotFor(session, () => fileBase)).toMatchObject({
      runId: "r1",
      lastSeq: -1,
      baseMessages: fileBase,
      request: { role: "user", content: "你好" },
    });

    await fake.started;
    fake.emit({ type: "agent_start" });
    fake.emit(assistantStart as never);
    fake.emit({
      type: "message_update",
      message: { role: "assistant", content: [{ type: "text", text: "写到一半" }] },
      assistantMessageEvent: { type: "text_delta", delta: "写到一半" },
    } as never);
    fake.emit({ type: "auto_retry_start", attempt: 2, maxAttempts: 5, delayMs: 10 } as never);
    fake.interactions({
      sessionId: "host",
      revision: 1,
      approvals: [
        {
          requestId: "a1",
          sessionId: "host",
          toolCallId: "c1",
          toolName: "bash",
          risk: "execute",
          input: "ls",
          requestedAt: 1,
        } as never,
      ],
      questions: [],
    });
    await new Promise(resolve => setTimeout(resolve, 80)); // 归约器 50ms 节流

    const snapshot = registry.snapshotFor(session, () => {
      throw new Error("有句柄时不读文件");
    })!;
    expect(snapshot.baseMessages).toEqual(fake.baseMessages);
    expect(snapshot.lastSeq).toBe(published.at(-1)!.seq);
    expect(snapshot.response.content).toBe("写到一半");
    expect(snapshot.retry).toMatchObject({ attempt: 2, maxAttempts: 5 });
    expect(snapshot.interactions.approvals.map(item => item.requestId)).toEqual(["a1"]);

    // 快照是拷贝：之后的事件不改已交出去的快照
    fake.emit(assistantEnd("写完了") as never);
    expect(snapshot.response.content).toBe("写到一半");
    fake.finish({ ok: true, aborted: false });
    await flush();
    expect(registry.snapshotFor(session, () => [])).toBeUndefined();
  });

  it("停止：settled 标记 aborted，不报错；会话还没建好时按停止，建好后立刻停", async () => {
    const fake = fakeDriver();
    fake.gate.hold = true;
    const published: AiRunEventNotification[] = [];
    const registry = new BrowserRunRegistry(fake.driver, item => published.push(item));
    registry.start(params("r1"));
    await registry.abort("r1");
    fake.gate.release();
    await fake.started;
    await flush();
    expect(fake.abort).toHaveBeenCalled();
    expect(published.at(-1)!.event).toMatchObject({ type: "settled", ok: false, aborted: true });
    expect(published.at(-1)!.event).not.toHaveProperty("error");
  });

  it("模型报错转发为 error 事件，settled 按失败收尾；重试开始后再成功则不算失败", async () => {
    const fake = fakeDriver();
    const published: AiRunEventNotification[] = [];
    const registry = new BrowserRunRegistry(fake.driver, item => published.push(item));
    registry.start(params("r1"));
    await fake.started;
    fake.emit({ type: "agent_start" });
    fake.emit(assistantStart as never);
    fake.emit(assistantEnd("", { stopReason: "error", errorMessage: "额度不足" }) as never);
    fake.finish({ ok: true, aborted: false });
    await flush();
    const events = published.map(item => item.event);
    expect(events).toContainEqual({ type: "error", message: "额度不足" });
    expect(events.at(-1)).toMatchObject({ type: "settled", ok: false, error: "额度不足" });

    const retryFake = fakeDriver();
    const retried: AiRunEventNotification[] = [];
    const retryRegistry = new BrowserRunRegistry(retryFake.driver, item => retried.push(item));
    retryRegistry.start(params("r2"));
    await retryFake.started;
    retryFake.emit({ type: "agent_start" });
    retryFake.emit(assistantStart as never);
    retryFake.emit(assistantEnd("", { stopReason: "error", errorMessage: "网络抖动" }) as never);
    retryFake.emit({
      type: "auto_retry_start",
      attempt: 1,
      maxAttempts: 5,
      delayMs: 1000,
    } as never);
    retryFake.emit(assistantStart as never);
    retryFake.emit(assistantEnd("重试后成功") as never);
    retryFake.finish({ ok: true, aborted: false });
    await flush();
    const retryEvents = retried.map(item => item.event);
    expect(retryEvents.some(event => event.type === "retry" && event.status)).toBe(true);
    expect(retryEvents.at(-1)).toMatchObject({ type: "settled", ok: true, lastText: "重试后成功" });
  });

  it("交互快照转成 v2 形状推给扩展，作答转交会话", async () => {
    const fake = fakeDriver();
    const published: AiRunEventNotification[] = [];
    const registry = new BrowserRunRegistry(fake.driver, item => published.push(item));
    registry.start(params("r1"));
    await fake.started;
    fake.interactions({
      sessionId: "host",
      revision: 1,
      approvals: [],
      questions: [
        {
          requestId: "q1",
          sessionId: "host",
          toolCallId: "call-1",
          payload: { questions: [] } as never,
          askedAt: 5,
        },
      ],
    });
    expect(published.at(-1)!.event).toEqual({
      type: "interactions",
      approvals: [],
      questions: [
        { requestId: "q1", toolCallId: "call-1", payload: { questions: [] }, askedAt: 5 },
      ],
    });
    expect(registry.answer("r1", "q1", { answers: [] })).toBeUndefined();
    expect(fake.answer).toHaveBeenCalledWith("q1", { answers: [] });
    expect(registry.answer("nope", "q1", {})).toBeTruthy();
  });
});

describe("resolveChatModel", () => {
  const setting = {
    llmProviders: [{ id: "p1", models: [{ id: "m1" }, { id: "m2" }] }],
    llmUsageSettings: { chat: { providerId: "p1", modelId: "m2" } },
  };

  it("按用途取服务商与模型（与渲染端同一口径）", () => {
    expect(resolveChatModel(setting, "chat")).toEqual({ providerId: "p1", modelId: "m2" });
  });

  it("没配置或配置指向不存在的模型：给出可读的错误", () => {
    expect(() => resolveChatModel(setting, "webClip")).toThrow("未配置 LLM");
    expect(() =>
      resolveChatModel(
        { ...setting, llmUsageSettings: { chat: { providerId: "p1", modelId: "gone" } } },
        "chat"
      )
    ).toThrow("未配置 LLM");
  });
});
