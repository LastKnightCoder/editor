import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("白板文档 Electron 通知", () => {
  it.each([
    ["events", "update", { documentId: "document", revision: 1 }],
    ["drains", "drain", { leaseId: "lease", requestId: "request", sealed: true }],
    ["resumes", "resume", { leaseId: "lease", requestId: "request" }],
    ["detached", "detached", { leaseId: "lease" }],
  ] as const)("%s 读取业务载荷并只注销自己的监听", (method, event, payload) => {
    const listener = vi.fn();
    const other = vi.fn();
    const subscribe = whiteboardDocumentBackend[method];
    if (!subscribe) throw new Error(`缺少白板通知订阅：${method}`);
    const unsubscribe = subscribe(listener);
    const unsubscribeOther = subscribe(other);
    const channel = `whiteboard-document:${event}`;
    const expected = method === "detached" ? "lease" : payload;

    emit(channel, payload);
    expect(listener).toHaveBeenCalledExactlyOnceWith(expected);
    unsubscribe();
    emit(channel, payload);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(2);
    unsubscribeOther();
    expect(bridge.listeners.get(channel)?.size).toBe(0);
  });

  it("没有画布的后台会话收到保存请求后，等待落盘再回复主进程", async () => {
    const doc = new Y.Doc();
    const model = new WhiteboardModel(doc);
    const pageId = model.submit([{ type: "create_page", title: "白板" }], null).createdIds[0];
    const opened: WhiteboardDocumentOpen = {
      identity: {
        databaseName: "library",
        documentId: "document",
        sourceId: "source",
        baselineId: "baseline",
        epoch: 1,
      },
      leaseId: "lease",
      pageId,
      state: Y.encodeStateAsUpdate(doc),
      revision: 0,
      projectedRevision: 0,
    };
    let finishFlush!: () => void;
    const flushed = new Promise<void>(resolve => {
      finishFlush = resolve;
    });
    bridge.invoke.mockImplementation(async (channel: string) => {
      if (channel === "whiteboard-document:open") return opened;
      if (channel === "whiteboard-document:flush") {
        await flushed;
        return { revision: 0, projectedRevision: 0 };
      }
    });
    const client = new WhiteboardDocumentClient(
      { databaseName: "library", contentId: 1 },
      whiteboardDocumentBackend,
      { list: async () => [], put: async () => undefined, remove: async () => undefined }
    );
    try {
      await client.ready;
      emit("whiteboard-document:drain", {
        leaseId: "lease",
        requestId: "request",
        sealed: true,
      });
      await vi.waitFor(() =>
        expect(bridge.invoke).toHaveBeenCalledWith("whiteboard-document:flush", "lease")
      );
      expect(client.getSnapshot().frozen).toBe(true);
      expect(bridge.invoke).not.toHaveBeenCalledWith(
        "whiteboard-document:drained",
        "request",
        undefined
      );
      finishFlush();
      await vi.waitFor(() =>
        expect(bridge.invoke).toHaveBeenCalledWith(
          "whiteboard-document:drained",
          "request",
          undefined
        )
      );
      emit("whiteboard-document:resume", { leaseId: "lease", requestId: "request" });
      expect(client.getSnapshot().frozen).toBe(false);
      emit("whiteboard-document:detached", { leaseId: "lease" });
      expect(client.needsReopen).toBe(true);
    } finally {
      finishFlush();
      client.dispose();
      model.dispose();
      doc.destroy();
    }
  });
});
