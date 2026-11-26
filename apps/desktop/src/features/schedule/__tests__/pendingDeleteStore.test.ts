import { afterEach, expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import type { CalendarEvent } from "@/types";
const notices = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock("@tau/ui", () => ({ toast: notices }));
import { flushEventDeletes, scheduleEventDelete, usePendingDeletes } from "../pendingDeleteStore";

const event = (id: number): CalendarEvent => ({
  id,
  title: "系统日历",
  calendarId: 4,
  startDate: new Date(2026, 10, 27).getTime(),
  endDate: null,
  startTime: 540,
  endTime: 600,
  allDay: false,
  color: null,
  detailContentId: 88,
  createTime: 0,
  updateTime: 0,
});
const original = desktopLocaleSource.getSnapshot();
afterEach(async () => {
  flushEventDeletes();
  await Promise.resolve();
  desktopLocaleSource.setLocale(original);
  vi.clearAllMocks();
});

it("语言切换不提前执行删除；撤销后旧回调与离开页面均不能再次删除", () => {
  const commit = vi.fn().mockResolvedValue(undefined);
  scheduleEventDelete(event(41), commit);
  const receipt = notices.info.mock.calls[0];
  const { action, onClose } = receipt[1];
  for (const locale of ["zh-TW", "en-US"]) {
    desktopLocaleSource.setLocale(locale);
    expect(usePendingDeletes.getState().ids.has(41)).toBe(true);
    expect(notices.info).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  }
  action.onClick();
  expect(usePendingDeletes.getState().ids.has(41)).toBe(false);
  onClose();
  flushEventDeletes();
  expect(commit).not.toHaveBeenCalled();
});

it("待删除任务跨语言保留原实例，关闭回执与离开页面只落库一次", async () => {
  let finish: (() => void) | undefined;
  const commit = vi.fn(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  scheduleEventDelete(event(42), commit);
  scheduleEventDelete(event(42), commit);
  const { onClose } = notices.info.mock.calls[0][1];
  desktopLocaleSource.setLocale("zh-TW");
  onClose();
  desktopLocaleSource.setLocale("en-US");
  flushEventDeletes();
  onClose();
  expect(commit).toHaveBeenCalledTimes(1);
  expect(usePendingDeletes.getState().ids.has(42)).toBe(true);
  if (!finish) throw new Error("删除命令未执行");
  finish();
  await vi.waitFor(() => expect(usePendingDeletes.getState().ids.has(42)).toBe(false));
});
