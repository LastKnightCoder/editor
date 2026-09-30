import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Calendar, CalendarEvent } from "@/types";

vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ setting: { database: { active: "a" } } })) };
});
vi.mock("@/hooks/useDatabaseConnected", () => ({ default: () => true }));

const invoke = vi.fn();
const listeners = new Map<string, (...args: unknown[]) => void>();
let api: typeof import("../queries");
let settings: typeof import("@/stores/useSettingStore").default;
let ui: typeof import("../uiStore").useScheduleStore;
let sharedClient: QueryClient;
let client: QueryClient;
let root: Root | undefined;
let host: HTMLDivElement;
let mutations: ReturnType<typeof import("../queries").useScheduleMutations>;
const calendar = (title: string, visible = true): Calendar => ({
  id: 1,
  title,
  color: "blue",
  visible,
  archived: false,
  pinned: false,
  description: [],
  descriptionContentId: 0,
  orderIndex: 0,
  createTime: 0,
  updateTime: 0,
});
const event = (title: string): CalendarEvent => ({
  id: 1,
  title,
  calendarId: 1,
  startDate: 0,
  endDate: null,
  startTime: null,
  endTime: null,
  allDay: true,
  color: null,
  detailContentId: 0,
  createTime: 0,
  updateTime: 0,
});
const switchDatabase = (active: string) =>
  settings.setState(state => ({
    setting: { ...state.setting, database: { ...state.setting.database, active } },
  }));

beforeAll(async () => {
  window.electron = {
    platform: "darwin",
    invoke,
    on: (channel: string, handler: (...args: unknown[]) => void) => listeners.set(channel, handler),
  } as unknown as ElectronAPI;
  api = await import("../queries");
  ui = (await import("../uiStore")).useScheduleStore;
  settings = (await import("@/stores/useSettingStore")).default;
  sharedClient = (await import("@/queryClient")).queryClient;
});
beforeEach(() => {
  switchDatabase("a");
  ui.setState({ currentView: "month", currentDate: new Date(2026, 8, 30).getTime() });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invoke.mockReset();
  invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
    const scope = args.at(-1) as { toolDatabaseName?: string };
    if (!scope.toolDatabaseName) throw new Error("未指定数据库");
    if (channel === "calendar:get-all") return [calendar(scope.toolDatabaseName)];
    if (channel === "calendar-group:get-all") return [];
    if (channel === "calendar-event:get-by-date-range") return [event(scope.toolDatabaseName)];
    return calendar("修改成功", false);
  });
});
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  host?.remove();
  client.clear();
  sharedClient.clear();
});
async function mount(component: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(<QueryClientProvider client={client}>{component}</QueryClientProvider>)
  );
}
async function waitFor(check: () => void) {
  await act(async () => {
    await vi.waitFor(check);
  });
}
function CatalogProbe() {
  const { calendars } = api.useCalendarCatalog();
  return <output>{calendars.map(item => item.title).join(",")}</output>;
}
function EventsProbe() {
  const { events } = api.useCalendarEvents();
  return <output>{events.map(item => item.title).join(",")}</output>;
}
function MutationProbe() {
  mutations = api.useScheduleMutations();
  return null;
}

describe("日程数据隔离", () => {
  it("轻量日历入口不加载日程；切库迟到列表不进入当前库", async () => {
    let finish!: (rows: Calendar[]) => void;
    invoke.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    await mount(<CatalogProbe />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("calendar:get-all", { toolDatabaseName: "a" })
    );
    await act(async () => switchDatabase("b"));
    await waitFor(() => expect(host.textContent).toBe("b"));
    await act(async () => finish([calendar("a-late")]));
    expect(host.textContent).toBe("b");
    expect(client.getQueryData(api.scheduleKeys.catalog("a"))).toMatchObject({
      calendars: [{ title: "a-late" }],
    });
    expect(invoke.mock.calls.some(call => call[0] === "calendar-event:get-by-date-range")).toBe(
      false
    );
  });

  it("月份切换的迟到结果不覆盖新日期窗口，查询包含完整月网格", async () => {
    let finish!: (rows: CalendarEvent[]) => void;
    invoke.mockImplementation(async (channel: string, ...args: unknown[]) => {
      if (channel === "calendar:get-all") return [calendar("a")];
      if (channel === "calendar-group:get-all") return [];
      if (channel === "calendar-event:get-by-date-range") {
        if (args[0] === new Date(2026, 7, 31).getTime()) {
          return new Promise(resolve => {
            finish = resolve;
          });
        }
        return [event("十月")];
      }
    });
    await mount(<EventsProbe />);
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(invoke).toHaveBeenCalledWith(
      "calendar-event:get-by-date-range",
      new Date(2026, 7, 31).getTime(),
      new Date(2026, 9, 4, 23, 59, 59, 999).getTime(),
      [1],
      { toolDatabaseName: "a" }
    );
    await act(async () => ui.getState().setCurrentDate(new Date(2026, 9, 10).getTime()));
    await waitFor(() => expect(host.textContent).toBe("十月"));
    await act(async () => finish([event("九月迟到")]));
    expect(host.textContent).toBe("十月");
  });

  it("全部日历隐藏时不发送空筛选的全量查询", async () => {
    invoke.mockImplementation(async (channel: string) =>
      channel === "calendar:get-all" ? [calendar("a", false)] : []
    );
    await mount(<EventsProbe />);
    await waitFor(() => expect(client.getQueryData(api.scheduleKeys.catalog("a"))).toBeDefined());
    expect(host.textContent).toBe("");
    expect(invoke.mock.calls.some(call => call[0] === "calendar-event:get-by-date-range")).toBe(
      false
    );
  });

  it("在途显隐写入只回写原库；切库后的旧操作拒绝再写", async () => {
    await mount(<MutationProbe />);
    client.setQueryData(api.scheduleKeys.catalog("a"), {
      calendars: [calendar("a")],
      calendarGroups: [],
    });
    client.setQueryData(api.scheduleKeys.catalog("b"), {
      calendars: [calendar("b")],
      calendarGroups: [],
    });
    const previous = mutations;
    let finish!: (row: Calendar) => void;
    invoke.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const saving = previous.toggleCalendarVisibility(1);
    expect(invoke).toHaveBeenCalledWith(
      "calendar:update",
      expect.objectContaining({ id: 1, visible: false }),
      { toolDatabaseName: "a" }
    );
    await act(async () => switchDatabase("b"));
    await act(async () => {
      finish(calendar("a-updated", false));
      await saving;
    });
    expect(client.getQueryData(api.scheduleKeys.catalog("a"))).toMatchObject({
      calendars: [{ visible: false }],
    });
    expect(client.getQueryData(api.scheduleKeys.catalog("b"))).toMatchObject({
      calendars: [{ title: "b", visible: true }],
    });
    const calls = invoke.mock.calls.length;
    await expect(previous.deleteEvent(1)).rejects.toThrow("数据库已切换");
    expect(invoke).toHaveBeenCalledTimes(calls);
  });

  it("写入失败保留显隐与原缓存，不发布成功失效", async () => {
    await mount(<MutationProbe />);
    client.setQueryData(api.scheduleKeys.catalog("a"), {
      calendars: [calendar("a")],
      calendarGroups: [],
    });
    invoke.mockRejectedValueOnce(new Error("写入失败"));
    await expect(mutations.toggleCalendarVisibility(1)).rejects.toThrow("写入失败");
    expect(client.getQueryData(api.scheduleKeys.catalog("a"))).toMatchObject({
      calendars: [{ visible: true }],
    });
    expect(client.getQueryState(api.scheduleKeys.catalog("a"))?.isInvalidated).toBe(false);
  });

  it("跨窗口通知只失效对应库的日程查询", () => {
    sharedClient.setQueryData(api.scheduleKeys.catalog("a"), {
      calendars: [calendar("a")],
      calendarGroups: [],
    });
    sharedClient.setQueryData(api.scheduleKeys.catalog("b"), {
      calendars: [calendar("b")],
      calendarGroups: [],
    });
    sharedClient.setQueryData(api.scheduleKeys.content("a", 1), { content: [] });
    const listener = listeners.get("schedule:changed");
    if (!listener) throw new Error("日程通知未注册");
    listener(null, { databaseName: "a.db" });
    expect(sharedClient.getQueryState(api.scheduleKeys.catalog("a"))?.isInvalidated).toBe(true);
    expect(sharedClient.getQueryState(api.scheduleKeys.catalog("b"))?.isInvalidated).toBe(false);
    expect(sharedClient.getQueryState(api.scheduleKeys.content("a", 1))?.isInvalidated).toBe(false);
  });
});
