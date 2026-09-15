import { QueryObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getQueryClient } from "../../../router/query/PageQueryProvider";
import * as tauri from "../../../services/tauri";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
  getQueryClient().clear();
  invoke.mockReset().mockResolvedValue(1);
});

describe("来源域写入失效日历缓存", () => {
  it.each([
    ["修改待办", () => tauri.todoUpdateItem({ id: 1, title: "新标题" })],
    ["删除周期规则", () => tauri.todoDeleteRecurrence(1)],
    ["删除待办", () => tauri.todoDeleteItemCascade(1)],
    ["完成番茄钟", () => tauri.pomodoroStopSession()],
    ["删除番茄记录", () => tauri.pomodoroDeleteSession(1)],
  ] as const)("%s 后已挂载的日历立即刷新", async (_name, mutate) => {
    const client = getQueryClient();
    let revision = 1;
    const observer = new QueryObserver(client, {
      queryKey: ["calendar", "events", 1],
      queryFn: async () => revision,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch();
    client.setQueryData(["calendar", "event", 1], "详情");
    client.setQueryData(["calendar", "calendars"], "列表");
    revision = 2;
    await mutate();
    await vi.waitFor(() => expect(client.getQueryData(["calendar", "events", 1])).toBe(2));
    expect(client.getQueryState(["calendar", "event", 1])?.isInvalidated).toBe(true);
    expect(client.getQueryState(["calendar", "calendars"])?.isInvalidated).toBe(true);
    unsubscribe();
  });

  it("失败的写操作不失效缓存", async () => {
    const client = getQueryClient();
    client.setQueryData(["calendar", "events"], [1]);
    invoke.mockRejectedValue(new Error("写入失败"));
    await expect(tauri.todoDeleteItem(1)).rejects.toThrow("写入失败");
    expect(client.getQueryState(["calendar", "events"])?.isInvalidated).toBe(false);
  });

  it("日期相关命令携带时区身份", async () => {
    await tauri.pomodoroStopSession();
    expect(invoke).toHaveBeenCalledWith("pomodoro_stop_session", {
      payload: { asComplete: true },
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });
});
