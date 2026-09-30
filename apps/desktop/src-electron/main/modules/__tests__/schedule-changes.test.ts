import { beforeEach, describe, expect, it, vi } from "vitest";

const { windows, warn } = vi.hoisted(() => ({ windows: vi.fn(), warn: vi.fn() }));
vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: windows } }));
vi.mock("electron-log", () => ({ default: { warn } }));
import { broadcastScheduleChange, isScheduleWrite } from "../schedule-changes";

beforeEach(() => {
  windows.mockReset();
  warn.mockReset();
});

describe("日程变更通知", () => {
  it("直接写入与待办/番茄同步均刷新，读取与无关领域不刷新", () => {
    for (const channel of [
      "calendar:update",
      "calendar:merge",
      "calendar-group:delete",
      "calendar-event:transfer-between-calendars",
      "todo:toggle-complete-cascade",
      "todo:skip-recurrence",
      "todo-calendar:sync-item",
      "pomodoro:delete-session",
    ]) {
      expect(isScheduleWrite(channel), channel).toBe(true);
    }
    for (const channel of [
      "calendar:get-all",
      "calendar-event:get-by-date-range",
      "calendar-event:count-by-calendar-ids",
      "todo:list-items",
      "todo:get-recurrence",
      "pomodoro:summary-today",
      "flashcard:create-card",
    ]) {
      expect(isScheduleWrite(channel), channel).toBe(false);
    }
  });

  it("携带库身份通知所有存活窗口，个别窗口发送失败不影响已提交写入", () => {
    const receive = vi.fn();
    const destroyed = vi.fn();
    windows.mockReturnValue([
      {
        isDestroyed: () => false,
        webContents: {
          send: () => {
            throw new Error("窗口已关闭");
          },
        },
      },
      { isDestroyed: () => false, webContents: { send: receive } },
      { isDestroyed: () => true, webContents: { send: destroyed } },
    ]);
    expect(() => broadcastScheduleChange("a.db")).not.toThrow();
    expect(receive).toHaveBeenCalledWith("schedule:changed", { databaseName: "a.db" });
    expect(destroyed).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
