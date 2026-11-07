import { expect, it, vi } from "vitest";
import type { MemoryDebugPush } from "@/types/assistant-memory-debug";
import { newerMemorySnapshot, startMemoryDebugStream } from "../memory-debug-live";
import { memoryDebugFixture } from "./memoryDebugFixture";

it("较迟到达的初始快照不能覆盖较新的推送，状态更新复用内容缓存", () => {
  const current = memoryDebugFixture(3);
  expect(newerMemorySnapshot(current, memoryDebugFixture(1))).toBe(current);
  const status = { ...memoryDebugFixture(4), contentRevision: current.contentRevision };
  status.data.progress.pending = 7;
  const updated = newerMemorySnapshot(current, status);
  expect(updated.data.recent).toBe(current.data.recent);
  expect(updated.data.progress).toBe(status.data.progress);
  expect(updated.data.progress.pending).toBe(7);
});

it("订阅窗口关闭早于确认时，仍会解除迟到订阅且忽略后续数据", async () => {
  let acknowledge: (() => void) | undefined;
  let listener: ((push: MemoryDebugPush) => void) | undefined;
  const receive = vi.fn();
  const unsubscribe = vi.fn(async () => undefined);
  const detach = vi.fn();
  const dispose = startMemoryDebugStream({
    databaseName: "data.db",
    connectionId: "connection-a",
    subscriptionId: "s1",
    listen: callback => {
      listener = callback;
      return detach;
    },
    subscribe: () =>
      new Promise<void>(resolve => {
        acknowledge = resolve;
      }),
    unsubscribe,
    receive,
    closed: vi.fn(),
    failed: vi.fn(),
  });
  dispose();
  if (!acknowledge || !listener) throw new Error("订阅未开始");
  acknowledge();
  await Promise.resolve();
  listener({
    subscriptionId: "s1",
    databaseName: "data.db",
    connectionId: "connection-a",
    snapshot: memoryDebugFixture(),
  });
  expect(unsubscribe).toHaveBeenCalledExactlyOnceWith("s1");
  expect(detach).toHaveBeenCalledOnce();
  expect(receive).not.toHaveBeenCalled();
});

it("其他库、旧连接和其他订阅的推送不会进入当前面板", async () => {
  let listener: ((push: MemoryDebugPush) => void) | undefined;
  const receive = vi.fn();
  const closed = vi.fn();
  const dispose = startMemoryDebugStream({
    databaseName: "data.db",
    connectionId: "connection-a",
    subscriptionId: "s1",
    listen: callback => {
      listener = callback;
      return () => undefined;
    },
    subscribe: async () => undefined,
    unsubscribe: async () => undefined,
    receive,
    closed,
    failed: vi.fn(),
  });
  await Promise.resolve();
  if (!listener) throw new Error("订阅未开始");
  const push: MemoryDebugPush = {
    subscriptionId: "s1",
    databaseName: "data.db",
    connectionId: "connection-a",
    snapshot: memoryDebugFixture(),
  };
  listener({ ...push, databaseName: "other.db" });
  listener({ ...push, connectionId: "old-connection" });
  listener({ ...push, subscriptionId: "old-subscription" });
  expect(receive).not.toHaveBeenCalled();
  listener(push);
  listener({ ...push, snapshot: null });
  expect(receive).toHaveBeenCalledOnce();
  expect(closed).toHaveBeenCalledOnce();
  dispose();
});
