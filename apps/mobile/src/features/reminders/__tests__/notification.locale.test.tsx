import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SettingCompat } from "../../../types";
import type { UpcomingReminder } from "../../../services/tauri";
import { mobileLocaleSource } from "../../../services/i18n";
import { NotificationsSection } from "../NotificationsSection";
import { ReminderHost } from "../ReminderHost";
import { resyncReminders } from "../scheduler";
import { useNotifyPermission } from "../useNotifyPermission";
import { notificationTranslator } from "../notification.i18n";
import type { NotifyEntry, NotifyState } from "../native";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  upcoming: vi.fn(),
  pomodoro: vi.fn(),
  complete: vi.fn(),
  permission: vi.fn(),
  presentError: vi.fn(),
  update: vi.fn(),
  push: vi.fn(),
  listeners: new Map<string, (payload: unknown) => void>(),
  setting: {
    reminders: {
      todo: [300000],
      event: [900000],
      allDay: [-32400000],
      snoozeMinutes: 10,
      foregroundBanner: true,
    },
  } as SettingCompat,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  addPluginListener: (...args: unknown[]) => mocks.register(...args),
}));
vi.mock("../../../services/tauri", () => ({
  reminderUpcoming: mocks.upcoming,
  pomodoroGetActiveSession: mocks.pomodoro,
}));
vi.mock("../../../services/mobileSettingsBridge", () => ({
  getMobileSettingSnapshot: () => mocks.setting,
  subscribeMobileSettingSnapshot: () => () => undefined,
}));
vi.mock("../../../app/AppContext", () => ({
  useAppContext: () => ({
    presentError: mocks.presentError,
    syncSettings: { safeSetting: mocks.setting, updateSetting: mocks.update },
  }),
}));
vi.mock("../../../router", () => ({
  getNavigator: () => ({ push: mocks.push }),
  useRouterContext: () => ({ state: { screens: { entries: [{ key: "home" }] } } }),
}));
vi.mock("../../todo/store/useTodoStore", () => ({
  useTodoStore: { getState: () => ({ toggleCompleteCascade: mocks.complete }) },
}));

let host: HTMLDivElement;
let root: Root;
const state: NotifyState = { notifications: "prompt", exactAlarm: "granted", pending: 0 };
const now = new Date(2026, 10, 27, 10).getTime();
const locales = ["zh-TW", "en-US"] as const;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
const byText = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button,[role="button"]')].find(
    node => node.textContent?.trim() === text
  );
const nativeCalls = (name: string) =>
  mocks.invoke.mock.calls.filter(([command]) => command === `plugin:local-notify|${name}`);
const render = (node: React.ReactNode) => act(async () => root.render(node));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  mocks.listeners.clear();
  vi.stubGlobal("__TAURI_INTERNALS__", {});
  mobileLocaleSource.setLocale("zh-CN");
  mocks.upcoming.mockResolvedValue({ items: [], owners: [] });
  mocks.pomodoro.mockResolvedValue(null);
  mocks.complete.mockResolvedValue(undefined);
  mocks.permission.mockResolvedValue(state);
  mocks.register.mockImplementation(async (_plugin, event, handler) => {
    mocks.listeners.set(event, handler);
    return { unregister: mocks.unregister };
  });
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command.endsWith("|permission_state")) return state;
    if (command.endsWith("|request_permission")) return mocks.permission();
    if (command.endsWith("|schedule")) return state;
    if (command.endsWith("|take_actions")) return { actions: [] };
    return undefined;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  mobileLocaleSource.setLocale("zh-CN");
  vi.unstubAllGlobals();
});

it("设置面板跨语言保留稍后选项和权限失败，不重排、请求权限或写设置", async () => {
  await render(<NotificationsSection />);
  await act(async () => Promise.resolve());
  const row = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(node =>
    node.textContent?.startsWith(notificationTranslator.t("snooze.title"))
  );
  if (!row) throw new Error("snooze settings missing");
  await act(async () => row.click());
  const choice = byText(notificationTranslator.t("minutes", { count: 5 }));
  if (!choice) throw new Error("snooze choice missing");
  const schedules = nativeCalls("schedule").length;
  const reads = nativeCalls("permission_state").length;
  for (const locale of locales) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(byText(notificationTranslator.t("minutes", { count: 5 }))).toBe(choice);
    expect(nativeCalls("schedule")).toHaveLength(schedules);
    expect(nativeCalls("permission_state")).toHaveLength(reads);
    expect(mocks.permission).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  }
  const cause = new Error("native permission diagnostic");
  mocks.permission.mockRejectedValue(cause);
  const permission = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(node =>
    node.textContent?.includes(notificationTranslator.t("notifications.title"))
  );
  if (!permission) throw new Error("permission settings missing");
  await act(async () => permission.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(cause.message);
  for (const locale of locales) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(cause.message);
    expect(mocks.permission).toHaveBeenCalledOnce();
    expect(nativeCalls("schedule")).toHaveLength(schedules);
    expect(nativeCalls("permission_state")).toHaveLength(reads);
    expect(mocks.update).not.toHaveBeenCalled();
  }
});

it("权限Hook保留原生拒绝对象，不伪造授权状态或触发排期", async () => {
  let permission: ReturnType<typeof useNotifyPermission> | undefined;
  function Probe() {
    permission = useNotifyPermission(false);
    return null;
  }
  await render(<Probe />);
  const cause = new Error("request rejected unchanged");
  mocks.permission.mockRejectedValue(cause);
  await act(async () => {
    await expect(permission?.request()).rejects.toBe(cause);
  });
  expect(permission?.state).toBeNull();
  expect(permission?.issue).toEqual({ kind: "request", cause });
  expect(nativeCalls("schedule")).toHaveLength(0);
});

it("通知载荷以排期开始时语言快照创建，换语不重排且原身份日期与用户标题保持", async () => {
  const item: UpcomingReminder = {
    key: "todo:41:300000",
    owner: "todo:41",
    kind: "todo",
    ownerId: 41,
    taskId: null,
    title: "用户标题原文",
    anchor: now + 900000,
    remindAt: now + 600000,
    allDay: false,
    endAt: null,
    recurring: false,
  };
  const pending = deferred<{ items: UpcomingReminder[]; owners: string[] }>();
  mocks.upcoming
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue({ items: [item], owners: [item.owner] });
  mocks.pomodoro.mockResolvedValue({
    id: 7,
    status: "running",
    expectedMs: 1500000,
    startTime: now,
    pauses: [],
    pauseTotalMs: 0,
  });
  const firstRun = resyncReminders();
  mobileLocaleSource.setLocale("en-US");
  expect(nativeCalls("schedule")).toHaveLength(0);
  pending.resolve({ items: [item], owners: [item.owner] });
  await firstRun;
  const first = nativeCalls("schedule")[0][1];
  expect(first).toMatchObject({ owners: [item.owner], snoozeMinutes: 10 });
  expect(first.items[1]).toMatchObject({
    key: item.key,
    owner: item.owner,
    kind: item.kind,
    ownerId: item.ownerId,
    title: item.title,
    actions: "complete",
    at: item.remindAt,
  });
  expect(nativeCalls("schedule")).toHaveLength(1);
  // A later genuine reschedule uses the new language; the old request remains a snapshot.
  await resyncReminders();
  const second = nativeCalls("schedule")[1][1];
  expect(first.items[1].body).not.toBe(second.items[1].body);
  expect(first.items[0].title).not.toBe(second.items[0].title);
  expect(second.items[1]).toMatchObject({
    key: item.key,
    owner: item.owner,
    title: item.title,
    at: item.remindAt,
  });
  expect(first.items[0]).toMatchObject({
    key: "pomodoro:7",
    owner: "pomodoro:7",
    at: now + 1500000,
    actions: "none",
  });
});

it("AppContext随语言变动不重订阅或重排，旧横幅原载荷用于稍后与完成动作", async () => {
  await render(<ReminderHost />);
  await act(async () => vi.advanceTimersByTimeAsync(1500));
  const registrations = mocks.register.mock.calls.length;
  const schedules = nativeCalls("schedule").length;
  const drains = nativeCalls("take_actions").length;
  const entry: NotifyEntry = Object.freeze({
    key: "todo:41:300000",
    owner: "todo:41",
    kind: "todo",
    ownerId: 41,
    title: "delivered original title",
    body: "delivered original body",
    detail: "original time detail",
    actions: "complete",
    at: now + 600000,
  });
  await act(async () => mocks.listeners.get("delivered")?.(entry));
  const banner = document.querySelector('[role="alert"]');
  if (!banner) throw new Error("reminder banner missing");
  for (const locale of locales) {
    await act(async () => mobileLocaleSource.setLocale(locale));
    expect(document.querySelector('[role="alert"]')).toBe(banner);
    expect(banner.textContent).toContain(entry.title);
    expect(banner.textContent).toContain(entry.body);
    expect(mocks.register).toHaveBeenCalledTimes(registrations);
    expect(mocks.unregister).not.toHaveBeenCalled();
    expect(nativeCalls("schedule")).toHaveLength(schedules);
    expect(nativeCalls("take_actions")).toHaveLength(drains);
    expect(mocks.complete).not.toHaveBeenCalled();
  }
  await act(async () => byText(notificationTranslator.t("snooze.action", { count: 10 }))?.click());
  expect(nativeCalls("snooze")[0][1].item).toBe(entry);
  const order: string[] = [];
  mocks.complete.mockImplementation(async () => {
    order.push("complete");
  });
  const originalInvoke = mocks.invoke.getMockImplementation();
  mocks.invoke.mockImplementation(async (...args) => {
    if (args[0].endsWith("|cancel_owner")) order.push("cancel");
    return originalInvoke?.(...args);
  });
  await act(async () => mocks.listeners.get("delivered")?.(entry));
  await act(async () => byText(notificationTranslator.t("complete"))?.click());
  expect(mocks.complete).toHaveBeenCalledExactlyOnceWith({ id: 41, isCompleted: true });
  expect(nativeCalls("cancel_owner")[0][1]).toEqual({ owner: entry.owner });
  expect(order).toEqual(["complete", "cancel"]);
});
