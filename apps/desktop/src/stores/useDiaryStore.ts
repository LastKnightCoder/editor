import { create } from "zustand";
import {
  DiaryEntry,
  CreateDiaryEntry,
  UpdateDiaryEntry,
  DiaryHeatmapData,
  DiarySegmentItem,
  DiaryTagSetting,
} from "@/types/diary";
import {
  getAllDiaryEntries,
  getAllDiarySegmentsFlat,
  getAllDiaryTagSettings,
  createDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  getDiaryHeatmapData,
  createDiarySegment,
  updateDiarySegment,
  deleteDiarySegment,
  upsertDiaryTagSetting,
  deleteDiaryTagSetting,
} from "@/commands";
import { produce } from "immer";
import dayjs from "dayjs";
import type { Descendant } from "slate";
import { createEmptyDiaryContent } from "@/pages/DiaryView/constants/content";

const PAGE_SIZE = 20;

const getHeatmapCacheKey = (date: string) => {
  const dateObj = dayjs(date);
  return `${dateObj.year()}-${String(dateObj.month() + 1).padStart(2, "0")}`;
};

const concatSegmentContent = (segments: DiaryEntry["segments"]): Descendant[] =>
  segments.flatMap((segment) => segment.content ?? []);

const sumSegmentWordCount = (segments: DiaryEntry["segments"]) =>
  segments.reduce((sum, segment) => sum + (segment.wordCount || 0), 0);

const syncEntrySegmentSummary = (entry: DiaryEntry) => {
  entry.content = concatSegmentContent(entry.segments);
  entry.wordCount = sumSegmentWordCount(entry.segments);
};

interface IState {
  initLoading: boolean;
  diaryEntries: DiaryEntry[];
  segmentsFlat: DiarySegmentItem[];
  tagSettings: DiaryTagSetting[];

  activeTagFilter: string[];
  activeDateRange: [number, number] | null;
  searchQuery: string;

  visibleCount: number;
  momentScrollPosition: number;
  currentDate: string;

  heatmapDataCache: Map<string, DiaryHeatmapData[]>;
  activeEntryId?: number;
}

interface IActions {
  init: () => Promise<void>;
  refreshSegmentsFlat: () => Promise<void>;

  setActiveTagFilter: (tags: string[]) => void;
  setActiveDateRange: (range: [number, number] | null) => void;
  setSearchQuery: (query: string) => void;

  loadMore: (pageSize?: number) => void;
  resetVisibleCount: () => void;

  saveScrollPosition: (position: number) => void;
  getScrollPosition: () => number;

  setCurrentDate: (date: string) => void;

  onCreateDiaryEntry: (entry: CreateDiaryEntry) => Promise<DiaryEntry>;
  onUpdateDiaryEntry: (entry: UpdateDiaryEntry) => Promise<DiaryEntry>;
  onDeleteDiaryEntry: (id: number) => Promise<number>;
  onUpdateDiaryTags: (entryId: number, tags: string[]) => Promise<void>;

  onCreateDiarySegment: (diaryId: number) => Promise<void>;
  onUpdateDiarySegment: (
    segmentId: number,
    content: Descendant[],
  ) => Promise<void>;
  onDeleteDiarySegment: (segmentId: number) => Promise<void>;
  onCreateMoment: (content?: Descendant[]) => Promise<void>;

  loadTagSettings: () => Promise<void>;
  upsertTagSetting: (setting: {
    name: string;
    color: string;
    sort?: number;
  }) => Promise<void>;
  deleteTagSetting: (name: string) => Promise<void>;

  loadHeatmapData: (year: number, month: number) => Promise<DiaryHeatmapData[]>;
  setActiveEntryId: (id?: number) => void;
}

const initialState: IState = {
  diaryEntries: [],
  segmentsFlat: [],
  tagSettings: [],
  initLoading: true,
  currentDate: dayjs().format("YYYY-MM-DD"),
  activeTagFilter: [],
  activeDateRange: null,
  searchQuery: "",
  visibleCount: PAGE_SIZE,
  momentScrollPosition: 0,
  heatmapDataCache: new Map(),
  activeEntryId: undefined,
};

const useDiaryStore = create<IState & IActions>((set, get) => ({
  ...initialState,

  init: async () => {
    set({ ...initialState, initLoading: true });
    try {
      const [diaryEntries, segmentsFlat, tagSettings] = await Promise.all([
        getAllDiaryEntries(),
        getAllDiarySegmentsFlat(),
        getAllDiaryTagSettings(),
      ]);
      set({ diaryEntries, segmentsFlat, tagSettings, initLoading: false });
    } catch (error) {
      console.error("Failed to initialize diary store:", error);
      set({ initLoading: false });
    }
  },

  refreshSegmentsFlat: async () => {
    try {
      const segmentsFlat = await getAllDiarySegmentsFlat();
      set({ segmentsFlat });
    } catch (error) {
      console.error("Failed to refresh segments flat:", error);
    }
  },

  setActiveTagFilter: (tags: string[]) => {
    set({ activeTagFilter: tags, visibleCount: PAGE_SIZE });
  },

  setActiveDateRange: (range: [number, number] | null) => {
    set({ activeDateRange: range, visibleCount: PAGE_SIZE });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query, visibleCount: PAGE_SIZE });
  },

  loadMore: (pageSize: number = PAGE_SIZE) => {
    set((state) => ({ visibleCount: state.visibleCount + pageSize }));
  },

  resetVisibleCount: () => {
    set({ visibleCount: PAGE_SIZE });
  },

  saveScrollPosition: (position: number) => {
    set({ momentScrollPosition: position });
  },

  getScrollPosition: () => {
    return get().momentScrollPosition;
  },

  setCurrentDate: (date: string) => {
    set({ currentDate: date });
  },

  onCreateDiaryEntry: async (entry: CreateDiaryEntry) => {
    const result = await createDiaryEntry(entry);
    const { diaryEntries } = get();
    const newEntries = produce(diaryEntries, (draft) => {
      draft.push(result);
      draft.sort((a, b) => b.date.localeCompare(a.date));
    });
    set({ diaryEntries: newEntries });
    const cacheKey = getHeatmapCacheKey(result.date);
    const { heatmapDataCache } = get();
    heatmapDataCache.delete(cacheKey);
    set({ heatmapDataCache: new Map(heatmapDataCache) });
    return result;
  },

  onUpdateDiaryEntry: async (entry: UpdateDiaryEntry) => {
    const result = await updateDiaryEntry(entry);
    const { diaryEntries } = get();
    set({
      diaryEntries: produce(diaryEntries, (draft) => {
        const index = draft.findIndex((item) => item.id === entry.id);
        if (index !== -1) draft[index] = result;
      }),
    });

    // 同步 segmentsFlat 中的 entry 摘要字段
    if (
      entry.tags !== undefined ||
      entry.weather !== undefined ||
      entry.mood !== undefined
    ) {
      const { segmentsFlat } = get();
      set({
        segmentsFlat: segmentsFlat.map((item) =>
          item.diaryId === result.id
            ? {
                ...item,
                weather: result.weather,
                mood: result.mood,
                tags: result.tags,
              }
            : item,
        ),
      });
    }

    const cacheKey = getHeatmapCacheKey(result.date);
    const { heatmapDataCache } = get();
    heatmapDataCache.delete(cacheKey);
    set({ heatmapDataCache: new Map(heatmapDataCache) });

    return result;
  },

  onDeleteDiaryEntry: async (id: number) => {
    const result = await deleteDiaryEntry(id);
    const { diaryEntries, segmentsFlat } = get();
    const entryToDelete = diaryEntries.find((item) => item.id === id);

    set({
      diaryEntries: produce(diaryEntries, (draft) => {
        const index = draft.findIndex((item) => item.id === id);
        if (index !== -1) draft.splice(index, 1);
      }),
      segmentsFlat: segmentsFlat.filter((item) => item.diaryId !== id),
    });

    if (entryToDelete) {
      const cacheKey = getHeatmapCacheKey(entryToDelete.date);
      const { heatmapDataCache } = get();
      heatmapDataCache.delete(cacheKey);
      set({ heatmapDataCache: new Map(heatmapDataCache) });
    }

    return result;
  },

  onUpdateDiaryTags: async (entryId: number, tags: string[]) => {
    await get().onUpdateDiaryEntry({ id: entryId, tags });
  },

  // ---- Segment-level actions ----

  onCreateDiarySegment: async (diaryId: number) => {
    const { diaryEntries } = get();
    const entry = diaryEntries.find((e) => e.id === diaryId);
    if (!entry) return;
    const created = await createDiarySegment({
      diaryId,
      content: createEmptyDiaryContent(),
    });
    set({
      diaryEntries: produce(diaryEntries, (draft) => {
        const e = draft.find((item) => item.id === diaryId);
        if (e) {
          e.segments.push(created);
          e.updateTime = created.updateTime;
          syncEntrySegmentSummary(e);
        }
      }),
    });
    const cacheKey = getHeatmapCacheKey(entry.date);
    const { heatmapDataCache } = get();
    heatmapDataCache.delete(cacheKey);
    set({ heatmapDataCache: new Map(heatmapDataCache) });
    await get().refreshSegmentsFlat();
  },

  onUpdateDiarySegment: async (segmentId: number, content: Descendant[]) => {
    const { diaryEntries } = get();
    let diaryId: number | null = null;
    for (const e of diaryEntries) {
      if (e.segments.some((s) => s.id === segmentId)) {
        diaryId = e.id;
        break;
      }
    }
    if (diaryId == null) return;
    const updated = await updateDiarySegment({ segmentId, content });
    if (!updated) return;
    set({
      diaryEntries: produce(diaryEntries, (draft) => {
        const e = draft.find((item) => item.id === diaryId);
        if (e) {
          const idx = e.segments.findIndex((s) => s.id === segmentId);
          if (idx !== -1) e.segments[idx] = updated;
          e.updateTime = updated.updateTime;
          syncEntrySegmentSummary(e);
        }
      }),
    });
    const { segmentsFlat } = get();
    set({
      segmentsFlat: segmentsFlat.map((item) =>
        item.id === segmentId
          ? {
              ...item,
              wordCount: updated.wordCount,
              updateTime: updated.updateTime,
              content: updated.content,
            }
          : item,
      ),
    });
    const entry = diaryEntries.find((item) => item.id === diaryId);
    if (entry) {
      const cacheKey = getHeatmapCacheKey(entry.date);
      const { heatmapDataCache } = get();
      heatmapDataCache.delete(cacheKey);
      set({ heatmapDataCache: new Map(heatmapDataCache) });
    }
  },

  onDeleteDiarySegment: async (segmentId: number) => {
    const { diaryEntries } = get();
    let diaryId: number | null = null;
    let entryDate: string | null = null;
    for (const e of diaryEntries) {
      if (e.segments.some((s) => s.id === segmentId)) {
        diaryId = e.id;
        entryDate = e.date;
        break;
      }
    }
    if (diaryId == null) return;
    await deleteDiarySegment(segmentId);
    set({
      diaryEntries: produce(diaryEntries, (draft) => {
        const e = draft.find((item) => item.id === diaryId);
        if (e) {
          e.segments = e.segments
            .filter((s) => s.id !== segmentId)
            .sort((a, b) => a.createTime - b.createTime || a.id - b.id);
          syncEntrySegmentSummary(e);
        }
      }),
      segmentsFlat: get().segmentsFlat.filter((item) => item.id !== segmentId),
    });
    if (entryDate) {
      const cacheKey = getHeatmapCacheKey(entryDate);
      const { heatmapDataCache } = get();
      heatmapDataCache.delete(cacheKey);
      set({ heatmapDataCache: new Map(heatmapDataCache) });
    }
  },

  // 朋友圈式"记录此刻"：找到或创建当日 diary entry，再追加一个 segment
  onCreateMoment: async (content?: Descendant[]) => {
    const { currentDate, diaryEntries } = get();
    const todayEntry = diaryEntries.find(
      (e) => e.type === "daily" && e.date === currentDate,
    );
    const segmentContent = content ?? createEmptyDiaryContent();

    if (!todayEntry) {
      await get().onCreateDiaryEntry({
        type: "daily",
        date: currentDate,
        weather: null,
        mood: null,
        tags: [],
        segments: [segmentContent],
      });
      await get().refreshSegmentsFlat();
      return;
    }

    const diaryId = todayEntry.id;
    const created = await createDiarySegment({
      diaryId,
      content: segmentContent,
    });

    const { diaryEntries: currentEntries } = get();
    set({
      diaryEntries: produce(currentEntries, (draft) => {
        const e = draft.find((item) => item.id === diaryId);
        if (e) {
          e.segments.push(created);
          e.updateTime = created.updateTime;
          syncEntrySegmentSummary(e);
        }
      }),
    });
    const cacheKey = getHeatmapCacheKey(todayEntry.date);
    const { heatmapDataCache } = get();
    heatmapDataCache.delete(cacheKey);
    set({ heatmapDataCache: new Map(heatmapDataCache) });

    await get().refreshSegmentsFlat();
  },

  // ---- 标签设置 ----

  loadTagSettings: async () => {
    try {
      const tagSettings = await getAllDiaryTagSettings();
      set({ tagSettings });
    } catch (error) {
      console.error("Failed to load tag settings:", error);
    }
  },

  upsertTagSetting: async (setting: {
    name: string;
    color: string;
    sort?: number;
  }) => {
    const result = await upsertDiaryTagSetting(setting);
    const { tagSettings } = get();
    const existing = tagSettings.findIndex((s) => s.name === result.name);
    if (existing !== -1) {
      set({
        tagSettings: produce(tagSettings, (draft) => {
          draft[existing] = result;
        }),
      });
    } else {
      set({
        tagSettings: produce(tagSettings, (draft) => {
          draft.push(result);
          draft.sort((a, b) => a.sort - b.sort || a.createTime - b.createTime);
        }),
      });
    }
  },

  deleteTagSetting: async (name: string) => {
    await deleteDiaryTagSetting(name);
    const { diaryEntries, segmentsFlat, tagSettings, activeTagFilter } = get();
    const affectedEntries = diaryEntries.filter((entry) =>
      entry.tags.includes(name),
    );
    const updatedEntries = await Promise.all(
      affectedEntries.map((entry) =>
        updateDiaryEntry({
          id: entry.id,
          tags: entry.tags.filter((tag) => tag !== name),
        }),
      ),
    );
    const updatedEntryMap = new Map(
      updatedEntries.map((entry) => [entry.id, entry]),
    );

    set({
      tagSettings: tagSettings.filter((s) => s.name !== name),
      activeTagFilter: activeTagFilter.filter((tag) => tag !== name),
      diaryEntries: diaryEntries.map(
        (entry) => updatedEntryMap.get(entry.id) ?? entry,
      ),
      segmentsFlat: segmentsFlat.map((item) =>
        item.tags.includes(name)
          ? { ...item, tags: item.tags.filter((tag) => tag !== name) }
          : item,
      ),
    });
  },

  // ---- 热力图（保留用于时间筛选辅助） ----

  loadHeatmapData: async (year: number, month: number) => {
    const cacheKey = `${year}-${String(month).padStart(2, "0")}`;
    const { heatmapDataCache } = get();
    if (heatmapDataCache.has(cacheKey)) {
      return heatmapDataCache.get(cacheKey)!;
    }
    const data = await getDiaryHeatmapData(year, month);
    heatmapDataCache.set(cacheKey, data);
    set({ heatmapDataCache: new Map(heatmapDataCache) });
    return data;
  },

  setActiveEntryId: (id?: number) => {
    set({ activeEntryId: id });
  },
}));

export default useDiaryStore;
