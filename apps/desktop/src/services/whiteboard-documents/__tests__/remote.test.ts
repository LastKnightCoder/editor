import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WhiteboardRemoteStatus } from "@/types/whiteboard-document";
import type { WhiteboardDocumentClient, WhiteboardSaveState } from "../client";
import {
  WhiteboardRemoteSync,
  classifyRemoteError,
  remoteFailureText,
  splitRemoteError,
  type WhiteboardRemoteBackend,
} from "../remote";
import { whiteboardSyncStatus } from "@/features/whiteboards/collaboration";

/** 只实现远端同步用到的客户端表面：耐久保存回执与订阅。 */
function fakeClient() {
  const listeners = new Set<() => void>();
  let state: WhiteboardSaveState = {
    phase: "saved",
    frozen: false,
    pending: 0,
    revision: 1,
    projectedRevision: 1,
  };
  return {
    ready: Promise.resolve(),
    leaseId: "lease",
    needsReopen: false,
    flush: vi.fn(async () => {}),
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    edit() {
      state = { ...state, revision: state.revision + 1, projectedRevision: state.revision + 1 };
      listeners.forEach(listener => listener());
    },
  };
}
const ok = (localRevision: number): WhiteboardRemoteStatus => ({
  requiresRebind: false,
  requiresSync: false,
  localRevision,
  pending: 0,
});
let client: ReturnType<typeof fakeClient>;
let backend: { open: ReturnType<typeof vi.fn>; sync: ReturnType<typeof vi.fn> };
let sync: WhiteboardRemoteSync;
const create = () => {
  sync = new WhiteboardRemoteSync(
    client as unknown as WhiteboardDocumentClient,
    { serverUrl: "https://collab.test", documentId: "room" },
    backend as unknown as WhiteboardRemoteBackend,
    { pollMs: 10_000, debounceMs: 800, maxBackoffMs: 60_000 }
  );
  sync.start();
  return sync;
};
beforeEach(() => {
  vi.useFakeTimers();
  client = fakeClient();
  backend = {
    open: vi.fn(async () => ({ requiresRebind: false, pending: 0 })),
    sync: vi.fn(async () => ok(client.getSnapshot().revision)),
  };
});
afterEach(() => {
  sync?.dispose();
  vi.useRealTimers();
});

it("推送连通后降低补偿轮询，断线立即恢复同步，在线状态只接受本租约", async () => {
  let receive!: Parameters<NonNullable<WhiteboardRemoteBackend["realtime"]>>[0];
  const presence = vi.fn(async () => {});
  Object.assign(backend, {
    presence,
    realtime: (listener: typeof receive) => {
      receive = listener;
      return () => {};
    },
  });
  create();
  await vi.advanceTimersByTimeAsync(0);
  receive({ leaseId: "other", connected: true, peers: [] });
  const count = backend.sync.mock.calls.length;
  receive({ leaseId: "lease", connected: true, peers: [] });
  await vi.advanceTimersByTimeAsync(0);
  expect(backend.sync.mock.calls.length).toBe(count + 1);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(backend.sync.mock.calls.length).toBe(count + 1);
  sync.publishPresence("a", { pageId: "page", cursor: null, moving: false, selection: [] });
  sync.publishPresence("b", null);
  expect(presence).toHaveBeenCalledTimes(1);
  receive({ leaseId: "lease", connected: false, peers: [] });
  await vi.advanceTimersByTimeAsync(0);
  expect(backend.sync.mock.calls.length).toBe(count + 2);
  sync.dispose();
  expect(presence).toHaveBeenLastCalledWith("lease", null);
});

it("远端确认覆盖本机修订才显示已同步；新的本机编辑先回到已保存在本机", async () => {
  create();
  await vi.advanceTimersByTimeAsync(0);
  expect(backend.open).toHaveBeenCalledWith("lease", "https://collab.test");
  expect(sync.getSnapshot()).toMatchObject({ phase: "synced", unsynced: false });
  expect(whiteboardSyncStatus(client.getSnapshot(), sync.getSnapshot()).label).toBe("已同步");
  backend.sync.mockImplementationOnce(async () => ok(1));
  client.edit();
  expect(sync.getSnapshot().unsynced).toBe(true);
  expect(whiteboardSyncStatus(client.getSnapshot(), sync.getSnapshot()).label).not.toBe("已同步");
  await vi.advanceTimersByTimeAsync(800);
  // 返回的确认修订落后于本机，立即再同步一次而不宣称完成。
  expect(sync.getSnapshot().unsynced).toBe(true);
  await vi.waitFor(() => expect(backend.sync).toHaveBeenCalledTimes(3));
  expect(client.flush).toHaveBeenCalledTimes(3);
  expect(sync.getSnapshot()).toMatchObject({ phase: "synced", unsynced: false });
});

it("断网自动退避重试，恢复后继续同步；轮询接收远端更新", async () => {
  backend.sync.mockRejectedValueOnce(new Error("OFFLINE: fetch failed"));
  create();
  await vi.advanceTimersByTimeAsync(0);
  expect(sync.getSnapshot().phase).toBe("offline");
  expect(whiteboardSyncStatus(client.getSnapshot(), sync.getSnapshot()).label).toContain(
    "改动已存本机"
  );
  await vi.advanceTimersByTimeAsync(2_000);
  expect(sync.getSnapshot().phase).toBe("synced");
  await vi.advanceTimersByTimeAsync(10_000);
  expect(backend.sync).toHaveBeenCalledTimes(3);
});
it("持续输入不推迟已安排的同步，断网退避也不被输入绕过", async () => {
  create();
  await vi.advanceTimersByTimeAsync(0);
  for (let i = 0; i < 60; i++) {
    client.edit();
    await vi.advanceTimersByTimeAsync(500);
  }
  expect(backend.sync.mock.calls.length).toBeGreaterThan(20);
  backend.sync.mockRejectedValueOnce(new Error("OFFLINE: offline"));
  client.edit();
  await vi.advanceTimersByTimeAsync(800);
  expect(sync.getSnapshot().phase).toBe("offline");
  const calls = backend.sync.mock.calls.length;
  for (let i = 0; i < 3; i++) {
    client.edit();
    await vi.advanceTimersByTimeAsync(500);
  }
  expect(backend.sync).toHaveBeenCalledTimes(calls);
  await vi.advanceTimersByTimeAsync(500);
  expect(backend.sync).toHaveBeenCalledTimes(calls + 1);
});

it("权限拒绝、版本不兼容与换代不自动重投，只在用户操作后重试", async () => {
  backend.sync.mockRejectedValueOnce(new Error("FORBIDDEN: 没有这段内容的访问权限"));
  create();
  await vi.advanceTimersByTimeAsync(0);
  expect(sync.getSnapshot().phase).toBe("forbidden");
  client.edit();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(backend.sync).toHaveBeenCalledTimes(1);
  sync.retry();
  await vi.advanceTimersByTimeAsync(0);
  expect(sync.getSnapshot().phase).toBe("synced");

  backend.sync.mockResolvedValueOnce({ requiresRebind: true, reason: "epoch", pending: 0 });
  client.edit();
  await vi.advanceTimersByTimeAsync(800);
  expect(sync.getSnapshot().phase).toBe("rebind");
  expect(whiteboardSyncStatus(client.getSnapshot(), sync.getSnapshot()).actions).toEqual([
    "detach",
  ]);
  const calls = backend.sync.mock.calls.length;
  client.edit();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(backend.sync).toHaveBeenCalledTimes(calls);
});

it("打开即发现被拒分支时暂停同步，不发送任何差异", async () => {
  backend.open.mockResolvedValueOnce({ requiresRebind: true, reason: "rejected", pending: 0 });
  create();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(sync.getSnapshot().phase).toBe("rejected");
  expect(backend.sync).not.toHaveBeenCalled();
});

it("释放后不再同步", async () => {
  create();
  await vi.advanceTimersByTimeAsync(0);
  sync.dispose();
  client.edit();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(backend.sync).toHaveBeenCalledTimes(1);
});

it("错误码前缀解析：无前缀或前缀后为空时保留原文", () => {
  expect(splitRemoteError(new Error("OFFLINE: fetch failed"))).toEqual({
    code: "OFFLINE",
    message: "fetch failed",
  });
  expect(splitRemoteError(new Error("OFFLINE: "))).toEqual({
    code: "OFFLINE",
    message: "OFFLINE: ",
  });
  expect(splitRemoteError(new Error("白板已变化"))).toEqual({ message: "白板已变化" });
  expect(classifyRemoteError(new Error("MISSING_DEPENDENCIES: 缺依赖")).phase).toBe("waiting");
  expect(remoteFailureText(new Error("REMOTE_FAILED: 本机视频尚不支持共享发布"))).toBe(
    "本机视频尚不支持共享发布"
  );
  const pending = remoteFailureText(
    new Error("DURABLE_DOCUMENT_UNSAVED: 等待白板保存确认超时，已保留会话")
  );
  expect(pending).toContain("稍后重试");
  expect(pending).toContain("应用未能完成白板保存确认，本次操作已中止");
  expect(pending).not.toContain("窗口");
  expect(pending).not.toContain("再打开");
  expect(pending).toContain("（原因：等待白板保存确认超时，已保留会话）");
  const broken = remoteFailureText(new Error("DURABLE_DOCUMENT_FAILED: 数据库连接代次已变化"));
  expect(broken).toContain("重新打开");
  expect(broken).not.toContain("稍后重试");
  expect(broken).toContain("（原因：数据库连接代次已变化）");
});
