import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { WhiteboardModel } from "@tau/collaboration";
import { WhiteboardDocumentClient } from "@/services/whiteboard-documents/client";
import type { WhiteboardDocumentOpen } from "@/types/whiteboard-document";

const bridge = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Map<string, Set<(event: unknown, payload: unknown) => void>>(),
}));
vi.mock("@/electron", () => ({
  invoke: bridge.invoke,
  on: (channel: string, listener: (event: unknown, payload: unknown) => void) => {
    if (!bridge.listeners.has(channel)) bridge.listeners.set(channel, new Set());
    bridge.listeners.get(channel)?.add(listener);
  },
  off: (channel: string, listener: (event: unknown, payload: unknown) => void) => {
    bridge.listeners.get(channel)?.delete(listener);
  },
}));
vi.mock("../module-init", () => ({
  withModule: (_name: string, run: () => Promise<unknown>) => run(),
}));
import { whiteboardDocumentBackend } from "../whiteboard-document";

function emit(channel: string, payload: unknown) {
  for (const listener of bridge.listeners.get(channel) ?? []) listener({}, payload);
}

beforeEach(() => {
  bridge.invoke.mockReset();
  bridge.listeners.clear();
});

const query = vi.hoisted(() => ({ fetchQuery: vi.fn(), invalidateQueries: vi.fn() }));
vi.mock("@/queryClient", () => ({ queryClient: query }));
vi.mock("@/services/whiteboard-documents/outbox", () => ({
  IndexedWhiteboardOutbox: class {
    async list() {
      return [];
    }
    async put() {
      return undefined;
    }
    async remove() {
      return undefined;
    }
  },
}));
import {
  WhiteboardDocumentEntry,
  whiteboardRemoteSync,
} from "@/services/whiteboard-documents/registry";
function openedFixture(): WhiteboardDocumentOpen {
  const doc = new Y.Doc();
  const model = new WhiteboardModel(doc);
  const pageId = model.submit([{ type: "create_page", title: "页" }], null).createdIds[0];
  const state = Y.encodeStateAsUpdate(doc);
  model.dispose();
  doc.destroy();
  return {
    identity: {
      databaseName: "A",
      documentId: "doc",
      sourceId: "source",
      baselineId: "base",
      epoch: 1,
    },
    leaseId: "lease",
    pageId,
    state,
    revision: 0,
    projectedRevision: 0,
  };
}

afterEach(() => vi.useRealTimers());
it("超时恢复先于初始化完成时，旧 drain 不再冻结或回复", async () => {
  const opened = openedFixture();
  bridge.invoke.mockImplementation(async (channel: string) =>
    channel.endsWith(":open") ? opened : { revision: 0, projectedRevision: 0 }
  );
  let finish!: (rows: []) => void;
  const list = vi.fn(
    () =>
      new Promise<[]>(resolve => {
        finish = resolve;
      })
  );
  const client = new WhiteboardDocumentClient(
    { databaseName: "A", contentId: 1 },
    whiteboardDocumentBackend,
    { list, put: async () => undefined, remove: async () => undefined }
  );
  try {
    await vi.waitFor(() => expect(list).toHaveBeenCalled());
    emit("whiteboard-document:drain", { leaseId: "lease", requestId: "expired", sealed: true });
    emit("whiteboard-document:resume", { leaseId: "lease", requestId: "expired" });
    finish([]);
    await client.ready;
    await Promise.resolve();
    expect(client.getSnapshot().frozen).toBe(false);
    expect(bridge.invoke).not.toHaveBeenCalledWith(
      "whiteboard-document:drained",
      "expired",
      undefined
    );
  } finally {
    client.dispose();
  }
});
it("取消旧请求不解除新保存请求的冻结", async () => {
  bridge.invoke.mockResolvedValue(openedFixture());
  const client = new WhiteboardDocumentClient(
    { databaseName: "A", contentId: 1 },
    whiteboardDocumentBackend,
    { list: async () => [], put: async () => undefined, remove: async () => undefined }
  );
  try {
    await client.ready;
    for (const requestId of ["old", "new"])
      emit("whiteboard-document:drain", { leaseId: "lease", requestId, sealed: true });
    await vi.waitFor(() =>
      expect(bridge.invoke).toHaveBeenCalledWith("whiteboard-document:drained", "new", undefined)
    );
    emit("whiteboard-document:resume", { leaseId: "lease", requestId: "old" });
    expect(client.getSnapshot().frozen).toBe(true);
    emit("whiteboard-document:resume", { leaseId: "lease", requestId: "new" });
    expect(client.getSnapshot().frozen).toBe(false);
  } finally {
    client.dispose();
  }
});
it("共享绑定读取失败会自动重试，同客户端只创建一条同步", async () => {
  vi.useFakeTimers();
  bridge.invoke.mockImplementation(async (channel: string) =>
    channel === "whiteboard-document:open"
      ? openedFixture()
      : channel === "whiteboard-document:flush"
        ? { revision: 0, projectedRevision: 0 }
        : { requiresRebind: false, pending: 0, localRevision: 0 }
  );
  query.fetchQuery
    .mockReset()
    .mockRejectedValueOnce(new Error("temporary read failure"))
    .mockResolvedValue({ binding: { documentId: "room", serverUrl: "https://collab.test" } });
  const entry = new WhiteboardDocumentEntry({ databaseName: "A", contentId: 1 }, "doc");
  const release = entry.retain();
  const client = await entry.open();
  try {
    await vi.advanceTimersByTimeAsync(0);
    const remote = whiteboardRemoteSync(client);
    if (!remote) throw new Error("缺少共享状态控制器");
    expect(remote.getSnapshot()).toMatchObject({
      phase: "waiting",
      message: "共享状态读取失败，正在重试",
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(remote.getSnapshot().phase).toBe("synced");
    expect(await entry.open()).toBe(client);
    await vi.advanceTimersByTimeAsync(0);
    expect(whiteboardRemoteSync(client)).toBe(remote);
    expect(
      bridge.invoke.mock.calls.filter(args => args[0] === "whiteboard-document:remote-open")
    ).toHaveLength(1);
  } finally {
    whiteboardRemoteSync(client)?.dispose();
    client.dispose();
    release();
  }
});
it("失效临时会话释放时保留草稿并销毁，不向旧租约保存", async () => {
  vi.useFakeTimers();
  bridge.invoke.mockResolvedValue(openedFixture());
  query.fetchQuery.mockReset().mockResolvedValue({ binding: null });
  const entry = new WhiteboardDocumentEntry({ databaseName: "A", contentId: 1 }, "doc");
  const release = entry.retain();
  const client = await entry.open();
  emit("whiteboard-document:detached", { leaseId: "lease" });
  bridge.invoke.mockClear().mockRejectedValue(new Error("白板视图不属于此窗口"));
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(client.isDisposed).toBe(true);
  expect(bridge.listeners.get("whiteboard-document:drain")?.size).toBe(0);
  expect(bridge.invoke).not.toHaveBeenCalledWith("whiteboard-document:flush", "lease");
});
