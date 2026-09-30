import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/stores/useSettingStore", async () => {
  const { create } = await import("zustand");
  return { default: create(() => ({ setting: { database: { active: "a" } } })) };
});

import useSettingStore from "@/stores/useSettingStore";
import { usePeekStore } from "../peekStore";
import { migrateSchedulePreferences, useScheduleStore } from "../uiStore";
import type { CalendarEvent } from "@/types";

beforeEach(() => {
  useScheduleStore.getState().resetSession();
  localStorage.clear();
});

describe("日程偏好迁移", () => {
  it("保留合法偏好、旧日视图转月视图，不搬运跨库日历 ID 和会话", () => {
    localStorage.setItem(
      "calendar-store",
      JSON.stringify({
        state: {
          currentView: "day",
          selectedCalendarIds: [1],
          calendars: [{ id: 1 }],
          showDayPanel: true,
          showArchived: true,
          editingEvent: { id: 1 },
        },
      })
    );
    migrateSchedulePreferences(localStorage);
    expect(localStorage.getItem("calendar-store")).toBeNull();
    expect(JSON.parse(localStorage.getItem("tau-schedule-preferences") ?? "null")?.state).toEqual({
      currentView: "month",
      showDayPanel: true,
      showSystemSection: true,
      showMyCalendarSection: true,
      showArchivedSection: false,
    });
  });

  it("已有新偏好不被旧键覆盖；写入失败时保留旧键用于重试", () => {
    localStorage.setItem("tau-schedule-preferences", "已保存的新偏好");
    localStorage.setItem("calendar-store", "旧偏好");
    migrateSchedulePreferences(localStorage);
    expect(localStorage.getItem("tau-schedule-preferences")).toBe("已保存的新偏好");
    localStorage.removeItem("tau-schedule-preferences");
    localStorage.setItem("calendar-store", "旧偏好");
    const storage = {
      getItem: localStorage.getItem.bind(localStorage),
      removeItem: localStorage.removeItem.bind(localStorage),
      setItem: () => {
        throw new Error("空间不足");
      },
    };
    expect(() => migrateSchedulePreferences(storage)).toThrow("空间不足");
    expect(localStorage.getItem("calendar-store")).toBe("旧偏好");
  });

  it("切库清除草稿、速览和合并选择，保留视图偏好", () => {
    const event = { id: 1 } as CalendarEvent;
    useScheduleStore.setState({
      currentView: "week",
      showDayPanel: true,
      editingEvent: event,
      mergeModeEnabled: true,
      selectedCalendarsForMerge: [1],
    });
    usePeekStore.getState().peek(event);
    useSettingStore.setState(state => ({
      setting: {
        ...state.setting,
        database: { ...state.setting.database, active: "b" },
      },
    }));
    expect(useScheduleStore.getState()).toMatchObject({
      currentView: "week",
      showDayPanel: true,
      editingEvent: null,
      mergeModeEnabled: false,
      selectedCalendarsForMerge: [],
    });
    expect(usePeekStore.getState().event).toBeNull();
    const persisted = JSON.parse(localStorage.getItem("tau-schedule-preferences") ?? "null")?.state;
    expect(persisted).not.toHaveProperty("editingEvent");
    expect(persisted).not.toHaveProperty("currentDate");
  });
});
