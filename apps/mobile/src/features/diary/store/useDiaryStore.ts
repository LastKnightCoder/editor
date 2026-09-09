import { create } from "zustand";
import { getQueryClient } from "../../../router";
import { readDiaryEntries, writeDiaryEntries } from "../queries";
import type { Descendant } from "slate";
import * as tauri from "../../../services/tauri";
import type { DiaryEntry, DiaryType } from "../../../types";
import {
  getBaseDateFromDiaryKey,
  getDiaryDateKey,
  shiftDiaryBaseDate,
  sortDiaryEntriesDesc,
} from "../dateKey";
import { EMPTY_EDITOR_CONTENT, normalizeEditorContent } from "../../cards/editorContentUtils";

type DiaryStoreState = {
  initialized: boolean;
  loading: boolean;
  saving: boolean;
  error: string;
  lastSavedAt: number | null;
  mode: DiaryType;
  baseDate: string;
  currentEntry: DiaryEntry | null;
  lastFailedContent: Descendant[] | null;
  activeSegmentId: number | null;
  lastFailedTarget: {
    type: DiaryType;
    date: string;
    segmentId?: number;
  } | null;
};

type DiaryStoreActions = {
  initialize: () => Promise<void>;
  reloadAfterDatabaseChange: (databaseName?: string | null) => Promise<void>;
  openAt: (mode: DiaryType, baseDate: string) => Promise<number | null>;
  setMode: (mode: DiaryType) => Promise<void>;
  shiftDate: (delta: number) => Promise<void>;
  jumpToEntry: (entry: DiaryEntry) => Promise<void>;
  syncEntryContentByContentId: (payload: {
    contentId: number;
    content: Descendant[];
    wordCount: number;
    updateTime: number;
  }) => void;
  saveCurrentContent: (content: Descendant[]) => Promise<DiaryEntry>;
  selectSegment: (segmentId: number) => void;
  appendSegment: () => Promise<void>;
  deleteCurrentSegment: () => Promise<void>;
  retryLastFailed: () => Promise<boolean>;
  clearError: () => void;
};

const EMPTY_DIARY_CONTENT = normalizeEditorContent(EMPTY_EDITOR_CONTENT);

function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mergeEntries(entries: DiaryEntry[], nextEntry: DiaryEntry): DiaryEntry[] {
  const index = entries.findIndex(item => item.id === nextEntry.id);
  if (index >= 0) {
    const merged = [...entries];
    merged[index] = nextEntry;
    return sortDiaryEntriesDesc(merged);
  }
  return sortDiaryEntriesDesc([...entries, nextEntry]);
}

function findCurrentEntry(
  entries: DiaryEntry[],
  mode: DiaryType,
  baseDate: string
): DiaryEntry | null {
  const key = getDiaryDateKey(mode, baseDate);
  return entries.find(item => item.type === mode && item.date === key) ?? null;
}

const initialState: DiaryStoreState = {
  initialized: false,
  loading: false,
  saving: false,
  error: "",
  lastSavedAt: null,
  mode: "daily",
  baseDate: getTodayDateKey(),
  currentEntry: null,
  lastFailedContent: null,
  activeSegmentId: null,
  lastFailedTarget: null,
};

// 服务端读路径走 query 缓存：并发去重、staleTime 内重复初始化秒显；
// mutation 后 invalidateQueries(["diary"]) 标记缓存失效
function invalidateDiaryQueries() {
  getQueryClient().invalidateQueries({ queryKey: ["diary"] });
}

export const useDiaryStore = create<DiaryStoreState & DiaryStoreActions>((set, get) => ({
  ...initialState,

  initialize: async () => {
    if (get().initialized && get().currentEntry) {
      return;
    }

    set({ loading: true, error: "" });
    try {
      const sorted = sortDiaryEntriesDesc(await readDiaryEntries());
      const current = findCurrentEntry(sorted, get().mode, get().baseDate);
      set({ currentEntry: current, initialized: true });
      if (!current) {
        await get().saveCurrentContent(EMPTY_DIARY_CONTENT);
      }
    } catch (error) {
      console.error("[diary-store] initialize failed", error);
      set({ error: "日记初始化失败，请稍后重试" });
    } finally {
      set({ loading: false });
    }
  },

  reloadAfterDatabaseChange: async _databaseName => {
    invalidateDiaryQueries();
    set({
      loading: true,
      error: "",
      activeSegmentId: null,
      lastFailedContent: null,
      lastFailedTarget: null,
    });
    try {
      const sorted = sortDiaryEntriesDesc(await readDiaryEntries());
      const current = findCurrentEntry(sorted, get().mode, get().baseDate);
      set({ currentEntry: current, initialized: true, error: "" });
    } catch (error) {
      console.error("[diary-store] reloadAfterDatabaseChange failed", error);
      set({ error: "日记刷新失败，请稍后重试" });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  openAt: async (mode, baseDate) => {
    const sorted = sortDiaryEntriesDesc(await readDiaryEntries());
    const current = findCurrentEntry(sorted, mode, baseDate);
    set({
      mode,
      baseDate,
      currentEntry: current,
      activeSegmentId: current?.segments?.[0]?.id ?? null,
      error: "",
    });
    if (!current) {
      const saved = await get().saveCurrentContent(EMPTY_DIARY_CONTENT);
      return saved.contentId;
    }
    return current.contentId;
  },

  setMode: async mode => {
    if (mode === get().mode) {
      return;
    }
    const baseDate = get().baseDate;
    const current = findCurrentEntry(
      sortDiaryEntriesDesc(await readDiaryEntries()),
      mode,
      baseDate
    );
    set({
      mode,
      currentEntry: current,
      activeSegmentId: current?.segments?.[0]?.id ?? null,
      error: "",
    });
    if (!current) {
      await get().saveCurrentContent(EMPTY_DIARY_CONTENT);
    }
  },

  shiftDate: async delta => {
    const nextBaseDate = shiftDiaryBaseDate(get().mode, get().baseDate, delta);
    const current = findCurrentEntry(
      sortDiaryEntriesDesc(await readDiaryEntries()),
      get().mode,
      nextBaseDate
    );
    set({
      baseDate: nextBaseDate,
      currentEntry: current,
      activeSegmentId: current?.segments?.[0]?.id ?? null,
      error: "",
    });
    if (!current) {
      await get().saveCurrentContent(EMPTY_DIARY_CONTENT);
    }
  },

  jumpToEntry: async entry => {
    writeDiaryEntries(prev => mergeEntries(prev, entry));
    const nextBaseDate = getBaseDateFromDiaryKey(entry.type, entry.date);
    set({
      mode: entry.type,
      baseDate: nextBaseDate,
      currentEntry: entry,
      error: "",
    });
  },

  syncEntryContentByContentId: payload => {
    if (!Number.isFinite(payload.contentId) || payload.contentId <= 0) {
      return;
    }
    const normalizedContent = normalizeEditorContent(payload.content);
    const nextWordCount = Math.max(0, Math.trunc(payload.wordCount));
    const nextUpdateTime = Number.isFinite(payload.updateTime) ? payload.updateTime : Date.now();

    let changed = false;
    const prevEntries = getQueryClient().getQueryData<DiaryEntry[]>(["diary", "entries"]) ?? [];
    const mapped = prevEntries.map(entry => {
      if (
        entry.contentId !== payload.contentId &&
        !entry.segments?.some(segment => segment.contentId === payload.contentId)
      ) {
        return entry;
      }
      changed = true;
      const segments = entry.segments?.map(segment =>
        segment.contentId === payload.contentId
          ? {
              ...segment,
              content: normalizedContent,
              wordCount: nextWordCount,
              updateTime: nextUpdateTime,
            }
          : segment
      );
      return {
        ...entry,
        segments: segments ?? [],
        content: segments?.length
          ? segments.flatMap(segment => segment.content)
          : normalizedContent,
        wordCount: segments?.length
          ? segments.reduce((sum, segment) => sum + segment.wordCount, 0)
          : nextWordCount,
        updateTime: nextUpdateTime,
      };
    });

    if (!changed) {
      return;
    }
    // 乐观 patch 缓存（currentEntry 若命中同 id 也同步刷新）
    const patched = sortDiaryEntriesDesc(mapped);
    writeDiaryEntries(() => patched);
    const state = get();
    if (state.currentEntry) {
      const nextCurrent = patched.find(entry => entry.id === state.currentEntry?.id);
      if (nextCurrent && nextCurrent !== state.currentEntry) {
        set({ currentEntry: nextCurrent });
      }
    }
  },

  saveCurrentContent: async content => {
    const normalized = normalizeEditorContent(content);
    const state = get();
    const dateKey = getDiaryDateKey(state.mode, state.baseDate);
    const segment =
      state.currentEntry?.segments?.find(item => item.id === state.activeSegmentId) ??
      state.currentEntry?.segments?.[0];
    const target = {
      type: state.mode,
      date: dateKey,
      segmentId: segment?.id,
    };
    set({ saving: true, error: "" });

    try {
      const saved = await tauri.diaryUpsertEntry({
        ...target,
        content: normalized,
        weather: state.currentEntry?.weather ?? null,
        mood: state.currentEntry?.mood ?? null,
      });
      writeDiaryEntries(prev => mergeEntries(prev, saved));
      const merged = getQueryClient().getQueryData<DiaryEntry[]>(["diary", "entries"]) ?? [];
      set({
        currentEntry: findCurrentEntry(merged, get().mode, get().baseDate),
        saving: false,
        error: "",
        lastSavedAt: Date.now(),
        lastFailedContent: null,
        lastFailedTarget: null,
      });
      invalidateDiaryQueries();
      return saved;
    } catch (error) {
      console.error("[diary-store] save failed", error);
      set({
        saving: false,
        error: "日记自动保存失败，请稍后重试",
        lastFailedContent: normalized,
        lastFailedTarget: target,
      });
      throw error;
    }
  },

  retryLastFailed: async () => {
    const failedContent = get().lastFailedContent;
    if (!failedContent) {
      return true;
    }
    try {
      const target = get().lastFailedTarget;
      const state = get();
      const currentSegment =
        state.currentEntry?.segments?.find(segment => segment.id === state.activeSegmentId) ??
        state.currentEntry?.segments?.[0];
      if (
        target &&
        (target.type !== state.mode ||
          target.date !== getDiaryDateKey(state.mode, state.baseDate) ||
          target.segmentId !== currentSegment?.id)
      ) {
        set({ error: "请返回保存失败的日记片段后重试" });
        return false;
      }
      await get().saveCurrentContent(failedContent);
      return true;
    } catch {
      return false;
    }
  },

  selectSegment: segmentId => {
    if (get().currentEntry?.segments?.some(segment => segment.id === segmentId)) {
      set({ activeSegmentId: segmentId });
    }
  },

  appendSegment: async () => {
    const state = get();
    const saved = await tauri.diaryUpsertEntry({
      type: state.mode,
      date: getDiaryDateKey(state.mode, state.baseDate),
      content: EMPTY_DIARY_CONTENT,
      weather: state.currentEntry?.weather ?? null,
      mood: state.currentEntry?.mood ?? null,
      newSegment: true,
    });
    writeDiaryEntries(prev => mergeEntries(prev, saved));
    const merged = getQueryClient().getQueryData<DiaryEntry[]>(["diary", "entries"]) ?? [];
    set({
      currentEntry: findCurrentEntry(merged, get().mode, get().baseDate),
      activeSegmentId: saved.segments[saved.segments.length - 1]?.id ?? null,
    });
  },

  deleteCurrentSegment: async () => {
    const state = get();
    const segment =
      state.currentEntry?.segments?.find(item => item.id === state.activeSegmentId) ??
      state.currentEntry?.segments?.[0];
    if (!state.currentEntry || !segment) return;
    const saved = await tauri.diaryDeleteSegment(state.currentEntry.id, segment.id);
    writeDiaryEntries(prev => mergeEntries(prev, saved));
    const merged = getQueryClient().getQueryData<DiaryEntry[]>(["diary", "entries"]) ?? [];
    set({
      currentEntry: findCurrentEntry(merged, get().mode, get().baseDate),
      activeSegmentId: saved.segments[0]?.id ?? null,
    });
  },

  clearError: () => {
    if (!get().error) {
      return;
    }
    set({ error: "" });
  },
}));

export default useDiaryStore;
