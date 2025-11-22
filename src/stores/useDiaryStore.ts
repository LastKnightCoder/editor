import { create } from "zustand";
import {
  DiaryEntry,
  CreateDiaryEntry,
  UpdateDiaryEntry,
  DiaryHeatmapData,
} from "@/types/diary";
import {
  getAllDiaryEntries,
  createDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  getDiaryHeatmapData,
} from "@/commands";
import { produce } from "immer";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(isoWeek);

export type DiaryViewMode = "daily" | "weekly" | "monthly" | "timeline";

interface IState {
  initLoading: boolean;
  diaryEntries: DiaryEntry[];
  currentDate: string; // YYYY-MM-DD
  currentViewMode: DiaryViewMode;

  // Scroll position cache for each view
  scrollPositions: {
    daily: number;
    weekly: number;
    monthly: number;
    timeline: number;
  };

  // Heatmap data cache
  heatmapDataCache: Map<string, DiaryHeatmapData[]>; // key: "YYYY-MM"

  // Active editing entry
  activeEntryId?: number;
}

interface IActions {
  init: () => Promise<void>;

  // Date and view management
  setCurrentDate: (date: string) => void;
  setCurrentViewMode: (mode: DiaryViewMode) => void;
  navigateToToday: () => void;
  navigateToPrevDay: () => void;
  navigateToNextDay: () => void;

  // Entry CRUD
  onCreateDiaryEntry: (entry: CreateDiaryEntry) => Promise<DiaryEntry>;
  onUpdateDiaryEntry: (entry: UpdateDiaryEntry) => Promise<DiaryEntry>;
  onDeleteDiaryEntry: (id: number) => Promise<number>;

  // Entry queries
  getDailyEntry: (date: string) => DiaryEntry | null;
  getWeeklyEntry: (date: string) => DiaryEntry | null; // date in week
  getMonthlyEntry: (date: string) => DiaryEntry | null; // date in month
  getEntriesInDateRange: (startDate: string, endDate: string) => DiaryEntry[];

  // Heatmap data
  loadHeatmapData: (year: number, month: number) => Promise<DiaryHeatmapData[]>;

  // Scroll position management
  saveScrollPosition: (viewMode: DiaryViewMode, position: number) => void;
  getScrollPosition: (viewMode: DiaryViewMode) => number;

  // Active entry
  setActiveEntryId: (id?: number) => void;
}

const initialState: IState = {
  diaryEntries: [],
  initLoading: false,
  currentDate: dayjs().format("YYYY-MM-DD"),
  currentViewMode: "daily",
  scrollPositions: {
    daily: 0,
    weekly: 0,
    monthly: 0,
    timeline: 0,
  },
  heatmapDataCache: new Map(),
  activeEntryId: undefined,
};

const useDiaryStore = create<IState & IActions>((set, get) => ({
  ...initialState,

  init: async () => {
    set({
      ...initialState,
      initLoading: true,
    });

    try {
      const diaryEntries = await getAllDiaryEntries();
      set({ diaryEntries, initLoading: false });
    } catch (error) {
      console.error("Failed to initialize diary store:", error);
      set({ initLoading: false });
    }
  },

  setCurrentDate: (date: string) => {
    set({ currentDate: date });
  },

  setCurrentViewMode: (mode: DiaryViewMode) => {
    set({ currentViewMode: mode });
  },

  navigateToToday: () => {
    set({ currentDate: dayjs().format("YYYY-MM-DD") });
  },

  navigateToPrevDay: () => {
    const { currentDate } = get();
    const prevDay = dayjs(currentDate).subtract(1, "day").format("YYYY-MM-DD");
    set({ currentDate: prevDay });
  },

  navigateToNextDay: () => {
    const { currentDate } = get();
    const nextDay = dayjs(currentDate).add(1, "day").format("YYYY-MM-DD");
    set({ currentDate: nextDay });
  },

  onCreateDiaryEntry: async (entry: CreateDiaryEntry) => {
    const result = await createDiaryEntry(entry);
    const { diaryEntries } = get();

    const newEntries = produce(diaryEntries, (draft) => {
      draft.push(result);
      // Sort by date descending
      draft.sort((a, b) => b.date.localeCompare(a.date));
    });

    set({ diaryEntries: newEntries });
    return result;
  },

  onUpdateDiaryEntry: async (entry: UpdateDiaryEntry) => {
    const result = await updateDiaryEntry(entry);
    const { diaryEntries } = get();

    const newEntries = produce(diaryEntries, (draft) => {
      const index = draft.findIndex((item) => item.id === entry.id);
      if (index !== -1) {
        draft[index] = result;
      }
    });

    set({ diaryEntries: newEntries });

    // Invalidate heatmap cache for the affected month
    const dateObj = dayjs(result.date);
    const cacheKey = `${dateObj.year()}-${String(dateObj.month() + 1).padStart(2, "0")}`;
    const { heatmapDataCache } = get();
    heatmapDataCache.delete(cacheKey);
    set({ heatmapDataCache: new Map(heatmapDataCache) });

    return result;
  },

  onDeleteDiaryEntry: async (id: number) => {
    const result = await deleteDiaryEntry(id);
    const { diaryEntries } = get();

    const entryToDelete = diaryEntries.find((item) => item.id === id);

    const newEntries = produce(diaryEntries, (draft) => {
      const index = draft.findIndex((item) => item.id === id);
      if (index !== -1) {
        draft.splice(index, 1);
      }
    });

    set({ diaryEntries: newEntries });

    // Invalidate heatmap cache
    if (entryToDelete) {
      const dateObj = dayjs(entryToDelete.date);
      const cacheKey = `${dateObj.year()}-${String(dateObj.month() + 1).padStart(2, "0")}`;
      const { heatmapDataCache } = get();
      heatmapDataCache.delete(cacheKey);
      set({ heatmapDataCache: new Map(heatmapDataCache) });
    }

    return result;
  },

  getDailyEntry: (date: string) => {
    const { diaryEntries } = get();
    return (
      diaryEntries.find(
        (entry) => entry.type === "daily" && entry.date === date,
      ) || null
    );
  },

  getWeeklyEntry: (date: string) => {
    const { diaryEntries } = get();
    const dateObj = dayjs(date);
    const weekString = `${dateObj.year()}-W${String(dateObj.isoWeek()).padStart(2, "0")}`;
    return (
      diaryEntries.find(
        (entry) => entry.type === "weekly" && entry.date === weekString,
      ) || null
    );
  },

  getMonthlyEntry: (date: string) => {
    const { diaryEntries } = get();
    const dateObj = dayjs(date);
    const monthString = `${dateObj.year()}-${String(dateObj.month() + 1).padStart(2, "0")}`;
    return (
      diaryEntries.find(
        (entry) => entry.type === "monthly" && entry.date === monthString,
      ) || null
    );
  },

  getEntriesInDateRange: (startDate: string, endDate: string) => {
    const { diaryEntries } = get();
    return diaryEntries.filter(
      (entry) => entry.date >= startDate && entry.date <= endDate,
    );
  },

  loadHeatmapData: async (year: number, month: number) => {
    const cacheKey = `${year}-${String(month).padStart(2, "0")}`;
    const { heatmapDataCache } = get();

    // Check cache first
    if (heatmapDataCache.has(cacheKey)) {
      return heatmapDataCache.get(cacheKey)!;
    }

    // Load from server
    const data = await getDiaryHeatmapData(year, month);

    // Update cache
    heatmapDataCache.set(cacheKey, data);
    set({ heatmapDataCache: new Map(heatmapDataCache) });

    return data;
  },

  saveScrollPosition: (viewMode: DiaryViewMode, position: number) => {
    set(
      produce((state: IState) => {
        state.scrollPositions[viewMode] = position;
      }),
    );
  },

  getScrollPosition: (viewMode: DiaryViewMode) => {
    return get().scrollPositions[viewMode];
  },

  setActiveEntryId: (id?: number) => {
    set({ activeEntryId: id });
  },
}));

export default useDiaryStore;
