import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { settleLibraryRequests } from "../ipc-requests";
import { resourceSyncRefresh, syncCheckVersions, todoCreateGroup } from "../tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../utils/perf", () => ({ logPerf: vi.fn() }));
vi.mock("../../features/calendar/cache", () => ({ invalidateCalendarAfterMutation: vi.fn() }));
vi.mock("../../features/reminders/changes", () => ({ notifyReminderSourceChanged: vi.fn() }));

const cleanups: Array<() => void> = [];
function deferred() {
  let resolve!: (value?: unknown) => void;
  const promise = new Promise<unknown>(done => {
    resolve = done;
  });
  cleanups.push(() => resolve());
  return { promise, resolve };
}
async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
afterEach(async () => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  await flush();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.useRealTimers();
});

it("云端版本检查与资源账本刷新未完成时，不阻止主库替换", async () => {
  const remote = deferred();
  vi.mocked(invoke).mockImplementation(() => remote.promise);
  void syncCheckVersions();
  void resourceSyncRefresh();
  let ready = false;
  const drain = settleLibraryRequests().then(() => {
    ready = true;
  });
  await flush();
  expect(ready).toBe(true);
  await drain;
});

it("真正的本机写入完成后才放行，不继续等待后台网络读取", async () => {
  const remote = deferred();
  const local = deferred();
  vi.mocked(invoke).mockImplementation(command =>
    command === "todo_create_group" ? local.promise : remote.promise
  );
  void resourceSyncRefresh();
  const write = todoCreateGroup({ title: "任务分组" });
  let ready = false;
  const drain = settleLibraryRequests().then(() => {
    ready = true;
  });
  await flush();
  expect(ready).toBe(false);
  local.resolve();
  await write;
  await drain;
  expect(ready).toBe(true);
});

it("本机写入失败后释放等待，不留下永久忙态", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("写入失败"));
  await expect(todoCreateGroup({ title: "任务分组" })).rejects.toThrow("写入失败");
  await expect(settleLibraryRequests()).resolves.toBeUndefined();
});

it("等待真实写入超时时只记录命令与耗时，不记录内容", async () => {
  vi.useFakeTimers();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const local = deferred();
  vi.mocked(invoke).mockImplementation(() => local.promise);
  void todoCreateGroup({ title: "不应记录的私人内容" });
  const failure = expect(settleLibraryRequests()).rejects.toThrow("DATABASE_BUSY");
  await vi.advanceTimersByTimeAsync(8000);
  await failure;
  expect(warn).toHaveBeenCalledWith("[sync] 等待本机数据请求超时", [
    { command: "todo_create_group", elapsedMs: 8000 },
  ]);
  expect(JSON.stringify(warn.mock.calls)).not.toContain("不应记录的私人内容");
});
