import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MemoryDebugPush, MemoryDebugSnapshot } from "@/types/assistant-memory-debug";
import { rememberDatabaseConnection } from "@/services/command-context";
import { memoryDebugFixture } from "./memoryDebugFixture";

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  listeners: new Set<(event: unknown, push: MemoryDebugPush) => void>(),
}));
vi.mock("@/commands/assistant-memory", () => ({ assistantMemoryRequest: mocks.request }));
vi.mock("@/hooks/useDatabaseConnected", () => ({ default: () => true }));
vi.mock("@/stores/useSettingStore", () => ({
  default: (select: (state: { setting: { database: { active: string } } }) => unknown) =>
    select({ setting: { database: { active: "data.db" } } }),
}));
vi.mock("@/page/PageProvider", () => ({ useOverlayDismiss: vi.fn() }));
vi.mock("@/electron", () => ({
  on: (_channel: string, callback: (event: unknown, push: MemoryDebugPush) => void) =>
    mocks.listeners.add(callback),
  off: (_channel: string, callback: (event: unknown, push: MemoryDebugPush) => void) =>
    mocks.listeners.delete(callback),
}));
import { MemoryDebugDrawer } from "../MemoryDebugDrawer";

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const pause = () => new Promise(resolve => setTimeout(resolve, 25));
const render = async (open: boolean) => {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryDebugDrawer open={open} onOpenChange={() => undefined} />
      </QueryClientProvider>
    );
    await pause();
  });
};
beforeEach(() => {
  mocks.request.mockReset();
  mocks.listeners.clear();
  rememberDatabaseConnection({ databaseName: "data.db", connectionId: "connection-a" });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  client.clear();
  container.remove();
});

it("初始快照尚未返回也能打开面板，推送的新沉淀无需刷新即显示", async () => {
  let resolveInitial: ((value: MemoryDebugSnapshot) => void) | undefined;
  mocks.request.mockImplementation((channel: string) =>
    channel === "debug-snapshot"
      ? new Promise<MemoryDebugSnapshot>(resolve => {
          resolveInitial = resolve;
        })
      : Promise.resolve()
  );
  await render(true);
  expect(document.body.textContent).toContain("正在读取当前资料库");
  if (!resolveInitial) throw new Error("初始读取未开始");
  await act(async () => {
    resolveInitial?.(memoryDebugFixture());
    await pause();
  });
  expect(document.body.textContent).toContain("个人状态版本 1");
  const subscriptionId = mocks.request.mock.calls.find(
    call => call[0] === "debug-subscribe"
  )?.[1] as string | undefined;
  if (!subscriptionId) throw new Error("未建立推送订阅");
  await act(async () => {
    for (const listener of mocks.listeners)
      listener(undefined, {
        subscriptionId,
        databaseName: "data.db",
        connectionId: "connection-a",
        snapshot: memoryDebugFixture(2),
      });
    await pause();
  });
  expect(document.body.textContent).toContain("个人状态版本 2");
  expect(document.body.textContent).not.toContain("个人状态版本 1");
  expect(mocks.request.mock.calls.filter(call => call[0] === "debug-snapshot")).toHaveLength(1);
  await render(false);
  expect(mocks.request).toHaveBeenCalledWith("debug-unsubscribe", subscriptionId);
  expect(mocks.listeners.size).toBe(0);
});

it("初始读取失败时呈现错误而不是访问未定义的数据", async () => {
  mocks.request.mockRejectedValue(new Error("记忆模块暂不可用"));
  await render(true);
  await act(async () => {
    await pause();
  });
  expect(document.body.textContent).toContain("记忆模块暂不可用");
  expect(mocks.request.mock.calls.some(call => call[0] === "debug-subscribe")).toBe(false);
});
