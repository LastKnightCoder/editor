import { afterEach, expect, it, vi } from "vitest";
import { memoryDebugFixture } from "@/devtools/__tests__/memoryDebugFixture";
import { MemoryDebugPublisher } from "../debug";
import { MemoryStore } from "../store";
import { MemoryWorker } from "../worker";
import type { MemorySourcesPort } from "../sources";
import type { MemoryDebugEvent } from "@/types/assistant-memory-debug";

afterEach(() => vi.useRealTimers());

it("连续进度合并为一次推送，解除订阅后不再读取或推送快照", () => {
  vi.useFakeTimers();
  const read = vi.fn(stamp => ({ ...memoryDebugFixture(), ...stamp }));
  const publisher = new MemoryDebugPublisher(read);
  const send = vi.fn();
  const dispose = vi.fn();
  publisher.subscribe("window:one", { active: () => true, send, dispose });
  publisher.changed(true);
  publisher.changed(false);
  vi.advanceTimersByTime(100);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0]).toMatchObject({ revision: 2, contentRevision: 1 });
  publisher.unsubscribe("window:one");
  publisher.changed(true);
  vi.advanceTimersByTime(1000);
  expect(read).toHaveBeenCalledTimes(2);
  expect(dispose).toHaveBeenCalledOnce();
  publisher.close();
});

it("连接失效后先通知关闭并回收监听，不读取旧库", () => {
  vi.useFakeTimers();
  let active = true;
  const read = vi.fn(stamp => ({ ...memoryDebugFixture(), ...stamp }));
  const publisher = new MemoryDebugPublisher(read);
  const send = vi.fn();
  const dispose = vi.fn();
  publisher.subscribe("window:one", { active: () => active, send, dispose });
  active = false;
  publisher.changed(true);
  vi.advanceTimersByTime(100);
  expect(read).toHaveBeenCalledOnce();
  expect(send).toHaveBeenLastCalledWith(null);
  expect(dispose).toHaveBeenCalledOnce();
  publisher.close();
});

it("诊断快照只读、有界且总数准确，不运行到期整理或旧卡片任务", () => {
  const store = new MemoryStore(":memory:");
  const now = Date.UTC(2026, 10, 6);
  try {
    store.apply(
      [1, 2].map(id => ({
        kind: "preference" as const,
        topic: "表达方式" + id,
        text: "我偏好实例 " + id,
        profile: true,
        state: "current" as const,
        observedAt: now,
        expiresAt: now - 1,
        evidence: [{ kind: "chat" as const, id: String(id), anchor: "m", quote: "我偏好实例" }],
      })),
      now
    );
    store.apply(
      [
        {
          kind: "fact",
          topic: "知识卡片",
          text: "通用知识",
          state: "current",
          observedAt: now,
          evidence: [{ kind: "content", id: "old", anchor: "b", quote: "通用知识" }],
        },
      ],
      now
    );
    store.mark({ kind: "content", id: "old" }, now);
    const before = store.get(1);
    const snapshot = store.debugData(null, 1);
    expect(snapshot.counts).toMatchObject({ episodes: 2, excluded: 1, profile: 2 });
    expect(snapshot.episodes).toHaveLength(1);
    expect(snapshot.profile).toHaveLength(1);
    expect(store.get(1)).toEqual(before);
    expect(store.getModel(snapshot.profile[0].id)).not.toBeNull();
    expect(store.nextDue()).toBeNull();
    expect(store.counts()).toEqual({ checked: 0, pending: 0, failed: 0 });
  } finally {
    store.close();
  }
});

it("模型等待期间实时报告提炼状态，提交后报告内容变化和空闲", async () => {
  const store = new MemoryStore(":memory:");
  const now = Date.UTC(2026, 10, 6);
  const events: Array<{ event: MemoryDebugEvent; changed: boolean | undefined }> = [];
  let release: ((text: string) => void) | undefined;
  const sources: MemorySourcesPort = {
    list: () => [],
    recent: () => [],
    invalidate: () => undefined,
    head: source => ({
      ...source,
      modifiedAt: now,
      row: { id: source.id, create_time: now, update_time: now, title: "当前对话" },
    }),
    read: head => ({
      parts: [
        {
          kind: "chat",
          id: head.id,
          anchor: "m",
          next: "m",
          quote: "",
          text: "我偏好实例",
          role: "user",
          observedAt: now,
        },
      ],
      validate: ref => ref,
    }),
  };
  const worker = new MemoryWorker({
    store,
    sources,
    now: () => now,
    allowed: () => true,
    busy: () => false,
    complete: async () =>
      new Promise(resolve => {
        release = resolve;
      }),
    progressed: (event, changed) => events.push({ event, changed }),
  });
  try {
    worker.changed({ kind: "chat", id: "one" });
    const running = worker.runBatch(1);
    expect(worker.debugState()).toMatchObject({
      phase: "extracting",
      running: true,
      sources: [{ id: "one", title: "当前对话" }],
    });
    if (!release) throw new Error("模型调用未开始");
    release("[]");
    await running;
    expect(worker.debugState()).toMatchObject({ phase: "idle", running: false });
    expect(store.counts().checked).toBe(1);
    expect(events.some(item => item.changed && item.event.message.includes("已核对来源"))).toBe(
      true
    );
  } finally {
    worker.close();
    store.close();
  }
});
