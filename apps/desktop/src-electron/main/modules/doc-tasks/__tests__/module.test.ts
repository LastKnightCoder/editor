import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  connected: undefined as ((name: string) => void) | undefined,
  written: undefined as ((event: { dbName: string; contentId: number }) => void) | undefined,
  main: new Map<string, any>(),
  index: new Map<string, any>(),
  windows: new Map<number, string>(),
  ensure: vi.fn(async (..._args: unknown[]) => undefined),
  reindex: vi.fn((_main: unknown, _index: unknown, _ids: number[]) => ({
    processed: 1,
    changed: 1,
  })),
  reconcile: vi.fn(async (_main: unknown, _index: unknown, _isStale: () => boolean) => ({
    processed: 0,
    changed: 0,
    aborted: false,
  })),
  promote: vi.fn(() => ({ ok: true, todoId: 1 })),
  broadcast: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => any) => state.handlers.set(name, handler),
  },
  BrowserWindow: {
    fromWebContents: (sender: { id: number }) => ({ id: sender.id }),
    getAllWindows: () => [],
  },
}));
vi.mock("../../database", () => ({
  default: {
    databases: state.main,
    windowToDatabase: state.windows,
    getDatabase: (name: string) => state.main.get(name),
    getIndexDatabase: (name: string) => state.index.get(name),
    ensureIndexDatabaseReady: (...args: unknown[]) => state.ensure(...args),
    formatDatabaseName: (name: string) => name.replace(/\.db$/, ""),
    onDatabaseConnected: (callback: (name: string) => void) => {
      state.connected = callback;
    },
    onDatabaseWrite: () => {},
  },
}));
vi.mock("../../content-events", () => ({
  onContentWritten: (callback: typeof state.written) => {
    state.written = callback;
  },
}));
vi.mock("../../database-notifications", () => ({ broadcastDatabaseChange: state.broadcast }));
vi.mock("../../schedule-changes", () => ({ broadcastScheduleChange: state.schedule }));
vi.mock("../indexer", () => ({
  reindexDocTasks: state.reindex,
  reconcileDocTasks: state.reconcile,
  regroupDocTasks: () => 0,
}));
vi.mock("../group-names", () => ({ listTaskGroups: () => [] }));
vi.mock("../query", () => ({
  getDocTaskSnapshot: () => ({ sources: [], open: [] }),
  getDocTasksOf: () => [],
  getDocTaskContentStatus: () => ({}),
  toggleDocTask: () => "ok",
}));
vi.mock("../settings", () => ({
  detectGroupRenames: () => [],
  renameGroupTokens: () => 0,
  setContentExcluded: () => {},
  promoteDocTask: state.promote,
}));

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  state.handlers.clear();
  state.main.clear();
  state.index.clear();
  state.windows.clear();
  vi.clearAllMocks();
  state.ensure.mockResolvedValue(undefined);
  state.reindex.mockReturnValue({ processed: 1, changed: 1 });
  for (const name of ["a", "b"]) {
    state.main.set(name, { open: true, prepare: () => ({ all: () => [] }) });
    state.index.set(name, {});
  }
  state.windows.set(1, "a");
  await (await import("..")).default.init();
  await vi.waitFor(() => expect(state.reconcile).toHaveBeenCalledTimes(2));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe("文档待办模块生命周期", () => {
  it("初始化补对账已连接的库，不同库不会取消彼此", () => {
    const guards = state.reconcile.mock.calls.map(call => call[2] as () => boolean);
    expect(guards.every(guard => !guard())).toBe(true);
    state.connected?.("b");
    expect(guards[0]()).toBe(false);
    expect(guards[1]()).toBe(true);
  });
  it("持续写入不会不断延后第一批索引", async () => {
    state.written?.({ dbName: "a", contentId: 1 });
    await vi.advanceTimersByTimeAsync(500);
    state.written?.({ dbName: "a", contentId: 2 });
    await vi.advanceTimersByTimeAsync(500);
    expect(state.reindex.mock.calls.map(call => call[2])).toEqual([[1], [2]]);
  });
  it("一个文档失败不影响另一个，失败项稍后重试", async () => {
    let failed = false;
    state.reindex.mockImplementation((_main, _index, ids) => {
      if (ids[0] === 1 && !failed) {
        failed = true;
        throw new Error("索引失败");
      }
      return { processed: 1, changed: 1 };
    });
    state.written?.({ dbName: "a", contentId: 1 });
    state.written?.({ dbName: "a", contentId: 2 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.reindex).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.reindex).toHaveBeenCalledTimes(3);
  });
  it("主进程拒绝错误库身份，转出成功按原库通知日程", async () => {
    const handler = state.handlers.get("doc-tasks:promote")!;
    await expect(
      handler({ sender: { id: 1 } }, 7, "task", 1, { databaseName: "b" })
    ).rejects.toThrow("数据库已切换");
    expect(state.promote).not.toHaveBeenCalled();
    await handler({ sender: { id: 1 } }, 7, "task", 1, { databaseName: "a" });
    expect(state.schedule).toHaveBeenCalledWith("a");
  });
});
