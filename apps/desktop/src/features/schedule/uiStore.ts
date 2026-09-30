import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CalendarEvent, CalendarViewType } from "@/types";
import useSettingStore from "@/stores/useSettingStore";
import { usePeekStore } from "./peekStore";

interface SchedulePreferences {
  currentView: CalendarViewType;
  showSystemSection: boolean;
  showMyCalendarSection: boolean;
  showArchivedSection: boolean;
  showDayPanel: boolean;
}

const defaults: SchedulePreferences = {
  currentView: "month",
  showSystemSection: true,
  showMyCalendarSection: true,
  showArchivedSection: false,
  showDayPanel: false,
};

export function sanitizeSchedulePreferences(value: unknown): SchedulePreferences {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    currentView:
      source.currentView === "week" || source.currentView === "agenda"
        ? source.currentView
        : "month",
    showSystemSection:
      typeof source.showSystemSection === "boolean"
        ? source.showSystemSection
        : defaults.showSystemSection,
    showMyCalendarSection:
      typeof source.showMyCalendarSection === "boolean"
        ? source.showMyCalendarSection
        : defaults.showMyCalendarSection,
    showArchivedSection:
      typeof source.showArchivedSection === "boolean"
        ? source.showArchivedSection
        : defaults.showArchivedSection,
    showDayPanel:
      typeof source.showDayPanel === "boolean" ? source.showDayPanel : defaults.showDayPanel,
  };
}

export function migrateSchedulePreferences(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">
) {
  const legacy = storage.getItem("calendar-store");
  if (!legacy) return;
  if (!storage.getItem("tau-schedule-preferences")) {
    let state: unknown;
    try {
      state = JSON.parse(legacy).state;
    } catch {
      state = undefined;
    }
    storage.setItem(
      "tau-schedule-preferences",
      JSON.stringify({
        state: sanitizeSchedulePreferences(state),
        version: 1,
      })
    );
  }
  storage.removeItem("calendar-store");
}

try {
  migrateSchedulePreferences(window.localStorage);
} catch {
  // 存储不可用时保留旧键，下次启动继续迁移。
}

interface ScheduleState extends SchedulePreferences {
  currentDate: number;
  editingEvent: CalendarEvent | null;
  mergeModeEnabled: boolean;
  selectedCalendarsForMerge: number[];
  setCurrentView(view: CalendarViewType): void;
  setCurrentDate(date: number): void;
  goToToday(): void;
  goToPrevious(): void;
  goToNext(): void;
  setEditingEvent(event: CalendarEvent | null): void;
  setShowSystemSection(show: boolean): void;
  setShowMyCalendarSection(show: boolean): void;
  setShowArchivedSection(show: boolean): void;
  setShowDayPanel(show: boolean): void;
  toggleMergeMode(): void;
  toggleCalendarForMerge(id: number): void;
  resetSession(): void;
}

export const useScheduleStore = create<ScheduleState>()(
  persist<ScheduleState, [], [], SchedulePreferences>(
    (set, get) => {
      const shiftDate = (direction: number) => {
        const { currentDate, currentView } = get();
        const date = new Date(currentDate);
        if (currentView === "week") date.setDate(date.getDate() + 7 * direction);
        else date.setMonth(date.getMonth() + direction);
        set({ currentDate: date.getTime() });
      };
      return {
        ...defaults,
        currentDate: Date.now(),
        editingEvent: null,
        mergeModeEnabled: false,
        selectedCalendarsForMerge: [],
        setCurrentView: currentView =>
          set({ currentView: currentView === "day" ? "month" : currentView }),
        setCurrentDate: currentDate => set({ currentDate }),
        goToToday: () => set({ currentDate: Date.now() }),
        goToPrevious: () => shiftDate(-1),
        goToNext: () => shiftDate(1),
        setEditingEvent: editingEvent => set({ editingEvent }),
        setShowSystemSection: showSystemSection => set({ showSystemSection }),
        setShowMyCalendarSection: showMyCalendarSection => set({ showMyCalendarSection }),
        setShowArchivedSection: showArchivedSection => set({ showArchivedSection }),
        setShowDayPanel: showDayPanel => set({ showDayPanel }),
        toggleMergeMode: () =>
          set(state => ({
            mergeModeEnabled: !state.mergeModeEnabled,
            selectedCalendarsForMerge: [],
          })),
        toggleCalendarForMerge: id =>
          set(state => ({
            selectedCalendarsForMerge: state.selectedCalendarsForMerge.includes(id)
              ? state.selectedCalendarsForMerge.filter(selected => selected !== id)
              : [...state.selectedCalendarsForMerge, id],
          })),
        resetSession: () =>
          set({
            currentDate: Date.now(),
            editingEvent: null,
            mergeModeEnabled: false,
            selectedCalendarsForMerge: [],
          }),
      };
    },
    {
      name: "tau-schedule-preferences",
      version: 1,
      partialize: sanitizeSchedulePreferences,
      merge: (persisted, current) => ({ ...current, ...sanitizeSchedulePreferences(persisted) }),
    }
  )
);

useSettingStore.subscribe((state, previous) => {
  if (state.setting.database.active !== previous.setting.database.active) {
    useScheduleStore.getState().resetSession();
    usePeekStore.getState().close();
  }
});
