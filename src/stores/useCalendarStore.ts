import { create } from "zustand";
import { persist } from "zustand/middleware";
import { produce } from "immer";
import {
  Calendar,
  CalendarEvent,
  CalendarGroup,
  CreateCalendar,
  UpdateCalendar,
  CreateCalendarEvent,
  UpdateCalendarEvent,
  CalendarViewType,
  CreateCalendarGroup,
  UpdateCalendarGroup,
} from "@/types";

import {
  getAllCalendars,
  createCalendar as createCalendarCommand,
  updateCalendar as updateCalendarCommand,
  deleteCalendar as deleteCalendarCommand,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getEventsForDay,
  getEventsForWeek,
  getEventsForMonth,
  getAllCalendarGroups,
  createCalendarGroup as createCalendarGroupCommand,
  updateCalendarGroup as updateCalendarGroupCommand,
  deleteCalendarGroup as deleteCalendarGroupCommand,
} from "@/commands";

import { getWeekStart } from "@/utils/calendar";

interface IState {
  // 日历数据
  calendars: Calendar[];
  events: CalendarEvent[];
  calendarGroups: CalendarGroup[];

  // 视图状态
  currentView: CalendarViewType;
  currentDate: number; // 当前查看的日期

  // 选中的日历（用于过滤）
  selectedCalendarIds: number[];

  // UI 状态
  loading: boolean;
  showArchived: boolean;
  showSystemSection: boolean;
  showMyCalendarSection: boolean;
  showArchivedSection: boolean;

  // 当前编辑的事件
  editingEvent: CalendarEvent | null;
}

interface IActions {
  // 初始化
  init: () => Promise<void>;

  // 日历管理
  createCalendar: (calendar: CreateCalendar) => Promise<Calendar>;
  updateCalendar: (calendar: UpdateCalendar) => Promise<Calendar>;
  deleteCalendar: (id: number) => Promise<number>;
  archiveCalendar: (id: number) => Promise<Calendar>;
  unarchiveCalendar: (id: number) => Promise<Calendar>;
  toggleCalendarVisibility: (id: number) => Promise<void>;

  // 日历分组管理
  createCalendarGroup: (group: CreateCalendarGroup) => Promise<CalendarGroup>;
  updateCalendarGroup: (group: UpdateCalendarGroup) => Promise<CalendarGroup>;
  deleteCalendarGroup: (id: number) => Promise<number>;
  loadCalendarGroups: () => Promise<void>;

  // 事件管理
  createEvent: (event: CreateCalendarEvent) => Promise<CalendarEvent>;
  updateEvent: (event: UpdateCalendarEvent) => Promise<CalendarEvent>;
  deleteEvent: (id: number) => Promise<number>;

  // 视图控制
  setCurrentView: (view: CalendarViewType) => void;
  setCurrentDate: (date: number) => void;
  goToToday: () => void;
  goToPrevious: () => void;
  goToNext: () => void;

  // 日历选择
  toggleCalendarSelection: (id: number) => void;
  selectAllCalendars: () => void;
  deselectAllCalendars: () => void;

  // 加载事件
  loadEventsForCurrentView: () => Promise<void>;

  // 编辑状态
  setEditingEvent: (event: CalendarEvent | null) => void;

  // 展开/收起状态
  setShowSystemSection: (show: boolean) => void;
  setShowMyCalendarSection: (show: boolean) => void;
  setShowArchivedSection: (show: boolean) => void;
}

const initState: IState = {
  calendars: [],
  events: [],
  calendarGroups: [],
  currentView: "month",
  currentDate: Date.now(),
  selectedCalendarIds: [],
  loading: false,
  showArchived: false,
  showSystemSection: true,
  showMyCalendarSection: true,
  showArchivedSection: false,
  editingEvent: null,
};

const useCalendarStore = create<IState & IActions>()(
  persist(
    (set, get) => ({
      ...initState,

      init: async () => {
        set({ loading: true });
        try {
          const [calendars, calendarGroups] = await Promise.all([
            getAllCalendars(),
            getAllCalendarGroups(),
          ]);
          const selectedCalendarIds = calendars
            .filter((c) => c.visible)
            .map((c) => c.id);
          set({ calendars, calendarGroups, selectedCalendarIds });
          await get().loadEventsForCurrentView();
        } finally {
          set({ loading: false });
        }
      },

      loadCalendarGroups: async () => {
        const calendarGroups = await getAllCalendarGroups();
        set({ calendarGroups });
      },

      createCalendarGroup: async (group: CreateCalendarGroup) => {
        const newGroup = await createCalendarGroupCommand(group);
        await get().loadCalendarGroups();
        return newGroup;
      },

      updateCalendarGroup: async (group: UpdateCalendarGroup) => {
        const updated = await updateCalendarGroupCommand(group);
        await get().loadCalendarGroups();
        return updated;
      },

      deleteCalendarGroup: async (id: number) => {
        const result = await deleteCalendarGroupCommand(id);
        await get().loadCalendarGroups();
        const calendars = await getAllCalendars();
        set({ calendars });
        return result;
      },

      createCalendar: async (calendar: CreateCalendar) => {
        const newCalendar = await createCalendarCommand(calendar);
        const calendars = await getAllCalendars();
        set({
          calendars,
          selectedCalendarIds: [...get().selectedCalendarIds, newCalendar.id],
        });
        return newCalendar;
      },

      updateCalendar: async (calendar: UpdateCalendar) => {
        const updated = await updateCalendarCommand(calendar);
        const calendars = await getAllCalendars();
        set({ calendars });
        return updated;
      },

      deleteCalendar: async (id: number) => {
        const result = await deleteCalendarCommand(id);
        const calendars = await getAllCalendars();
        set({
          calendars,
          selectedCalendarIds: get().selectedCalendarIds.filter(
            (cid) => cid !== id,
          ),
        });
        await get().loadEventsForCurrentView();
        return result;
      },

      archiveCalendar: async (id: number) => {
        const calendar = get().calendars.find((c) => c.id === id);
        if (!calendar) throw new Error("Calendar not found");
        return await get().updateCalendar({ ...calendar, archived: true });
      },

      unarchiveCalendar: async (id: number) => {
        const calendar = get().calendars.find((c) => c.id === id);
        if (!calendar) throw new Error("Calendar not found");
        return await get().updateCalendar({ ...calendar, archived: false });
      },

      toggleCalendarVisibility: async (id: number) => {
        const calendar = get().calendars.find((c) => c.id === id);
        if (!calendar) throw new Error("Calendar not found");
        await get().updateCalendar({ ...calendar, visible: !calendar.visible });
        get().toggleCalendarSelection(id);
      },

      createEvent: async (event: CreateCalendarEvent) => {
        const newEvent = await createCalendarEvent(event);
        await get().loadEventsForCurrentView();
        return newEvent;
      },

      updateEvent: async (event: UpdateCalendarEvent) => {
        const updated = await updateCalendarEvent(event);
        await get().loadEventsForCurrentView();
        return updated;
      },

      deleteEvent: async (id: number) => {
        const result = await deleteCalendarEvent(id);
        await get().loadEventsForCurrentView();
        return result;
      },

      setCurrentView: (view: CalendarViewType) => {
        set({ currentView: view });
        get().loadEventsForCurrentView();
      },

      setCurrentDate: (date: number) => {
        set({ currentDate: date });
        get().loadEventsForCurrentView();
      },

      goToToday: () => {
        set({ currentDate: Date.now() });
        get().loadEventsForCurrentView();
      },

      goToPrevious: () => {
        const { currentView, currentDate } = get();
        const date = new Date(currentDate);

        if (currentView === "day") {
          date.setDate(date.getDate() - 1);
        } else if (currentView === "week") {
          date.setDate(date.getDate() - 7);
        } else if (currentView === "month" || currentView === "agenda") {
          date.setMonth(date.getMonth() - 1);
        }

        set({ currentDate: date.getTime() });
        get().loadEventsForCurrentView();
      },

      goToNext: () => {
        const { currentView, currentDate } = get();
        const date = new Date(currentDate);

        if (currentView === "day") {
          date.setDate(date.getDate() + 1);
        } else if (currentView === "week") {
          date.setDate(date.getDate() + 7);
        } else if (currentView === "month" || currentView === "agenda") {
          date.setMonth(date.getMonth() + 1);
        }

        set({ currentDate: date.getTime() });
        get().loadEventsForCurrentView();
      },

      toggleCalendarSelection: (id: number) => {
        set(
          produce((state: IState) => {
            const index = state.selectedCalendarIds.indexOf(id);
            if (index > -1) {
              state.selectedCalendarIds.splice(index, 1);
            } else {
              state.selectedCalendarIds.push(id);
            }
          }),
        );
        get().loadEventsForCurrentView();
      },

      selectAllCalendars: () => {
        set({ selectedCalendarIds: get().calendars.map((c) => c.id) });
        get().loadEventsForCurrentView();
      },

      deselectAllCalendars: () => {
        set({ selectedCalendarIds: [] });
        get().loadEventsForCurrentView();
      },

      loadEventsForCurrentView: async () => {
        const { currentView, currentDate, selectedCalendarIds } = get();

        if (selectedCalendarIds.length === 0) {
          set({ events: [] });
          return;
        }

        let events: CalendarEvent[] = [];
        const date = new Date(currentDate);

        try {
          if (currentView === "day") {
            events = await getEventsForDay(
              date.setHours(0, 0, 0, 0),
              selectedCalendarIds,
            );
          } else if (currentView === "week") {
            const weekStart = getWeekStart(date);
            events = await getEventsForWeek(weekStart, selectedCalendarIds);
          } else if (currentView === "month" || currentView === "agenda") {
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            events = await getEventsForMonth(year, month, selectedCalendarIds);
          }

          set({ events });
        } catch (error) {
          console.error("Failed to load events:", error);
          set({ events: [] });
        }
      },

      setEditingEvent: (event: CalendarEvent | null) => {
        set({ editingEvent: event });
      },

      setShowSystemSection: (show: boolean) => {
        set({ showSystemSection: show });
      },

      setShowMyCalendarSection: (show: boolean) => {
        set({ showMyCalendarSection: show });
      },

      setShowArchivedSection: (show: boolean) => {
        set({ showArchivedSection: show });
      },
    }),
    {
      name: "calendar-store",
      partialize: (state) => ({
        currentView: state.currentView,
        selectedCalendarIds: state.selectedCalendarIds,
        showArchived: state.showArchived,
        showSystemSection: state.showSystemSection,
        showMyCalendarSection: state.showMyCalendarSection,
        showArchivedSection: state.showArchivedSection,
      }),
    },
  ),
);

export default useCalendarStore;
