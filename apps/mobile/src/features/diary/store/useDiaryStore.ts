import { create } from "zustand";
import type { Descendant } from "slate";
import * as tauri from "../../../services/tauri";
import type { DiaryEntry, DiaryType } from "../../../types";
import {
  getBaseDateFromDiaryKey,
  getDiaryDateKey,
  shiftDiaryBaseDate,
  sortDiaryEntriesDesc,
} from "../dateKey";
import {
  EMPTY_EDITOR_CONTENT,
  normalizeEditorContent,
} from "../../cards/editorContentUtils";

type DiaryStoreState = {
  initialized: boolean;
  loading: boolean;
  saving: boolean;
  error: string;
  lastSavedAt: number | null;
  mode: DiaryType;
  baseDate: string;
  entries: DiaryEntry[];
  currentEntry: DiaryEntry | null;
  lastFailedContent: Descendant[] | null;
};

type DiaryStoreActions = {
  initialize: () => Promise<void>;
  openAt: (mode: DiaryType, baseDate: string) => Promise<void>;
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

function mergeEntries(
  entries: DiaryEntry[],
  nextEntry: DiaryEntry,
): DiaryEntry[] {
  const index = entries.findIndex((item) => item.id === nextEntry.id);
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
  baseDate: string,
): DiaryEntry | null {
  const key = getDiaryDateKey(mode, baseDate);
  return (
    entries.find((item) => item.type === mode && item.date === key) ?? null
  );
}

const initialState: DiaryStoreState = {
  initialized: false,
  loading: false,
  saving: false,
  error: "",
  lastSavedAt: null,
  mode: "daily",
  baseDate: getTodayDateKey(),
  entries: [],
  currentEntry: null,
  lastFailedContent: null,
};

export const useDiaryStore = create<DiaryStoreState & DiaryStoreActions>(
  (set, get) => ({
    ...initialState,

    initialize: async () => {
      if (get().initialized) {
        const current = findCurrentEntry(
          get().entries,
          get().mode,
          get().baseDate,
        );
        if (current) {
          set({ currentEntry: current });
          return;
        }
      }

      set({ loading: true, error: "" });
      try {
        const entries = await tauri.diaryListEntries();
        const sorted = sortDiaryEntriesDesc(entries);
        const current = findCurrentEntry(sorted, get().mode, get().baseDate);
        set({
          entries: sorted,
          currentEntry: current,
          initialized: true,
        });
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

    openAt: async (mode, baseDate) => {
      const current = findCurrentEntry(get().entries, mode, baseDate);
      set({
        mode,
        baseDate,
        currentEntry: current,
        error: "",
      });
      if (!current) {
        await get().saveCurrentContent(EMPTY_DIARY_CONTENT);
      }
    },

    setMode: async (mode) => {
      if (mode === get().mode) {
        return;
      }
      const baseDate = get().baseDate;
      const current = findCurrentEntry(get().entries, mode, baseDate);
      set({ mode, currentEntry: current, error: "" });
      if (!current) {
        await get().saveCurrentContent(EMPTY_DIARY_CONTENT);
      }
    },

    shiftDate: async (delta) => {
      const nextBaseDate = shiftDiaryBaseDate(
        get().mode,
        get().baseDate,
        delta,
      );
      const current = findCurrentEntry(get().entries, get().mode, nextBaseDate);
      set({
        baseDate: nextBaseDate,
        currentEntry: current,
        error: "",
      });
      if (!current) {
        await get().saveCurrentContent(EMPTY_DIARY_CONTENT);
      }
    },

    jumpToEntry: async (entry) => {
      const nextEntries = mergeEntries(get().entries, entry);
      const nextBaseDate = getBaseDateFromDiaryKey(entry.type, entry.date);
      set({
        entries: nextEntries,
        mode: entry.type,
        baseDate: nextBaseDate,
        currentEntry: entry,
        error: "",
      });
    },

    syncEntryContentByContentId: (payload) => {
      if (!Number.isFinite(payload.contentId) || payload.contentId <= 0) {
        return;
      }
      const normalizedContent = normalizeEditorContent(payload.content);
      const nextWordCount = Math.max(0, Math.trunc(payload.wordCount));
      const nextUpdateTime = Number.isFinite(payload.updateTime)
        ? payload.updateTime
        : Date.now();

      const prev = get();
      let changed = false;
      const nextEntries = prev.entries.map((entry) => {
        if (entry.contentId !== payload.contentId) {
          return entry;
        }
        changed = true;
        return {
          ...entry,
          content: normalizedContent,
          wordCount: nextWordCount,
          updateTime: nextUpdateTime,
        };
      });

      const nextCurrent =
        prev.currentEntry && prev.currentEntry.contentId === payload.contentId
          ? {
              ...prev.currentEntry,
              content: normalizedContent,
              wordCount: nextWordCount,
              updateTime: nextUpdateTime,
            }
          : prev.currentEntry;

      if (!changed && nextCurrent === prev.currentEntry) {
        return;
      }

      set({
        entries: changed ? sortDiaryEntriesDesc(nextEntries) : prev.entries,
        currentEntry: nextCurrent,
      });
    },

    saveCurrentContent: async (content) => {
      const normalized = normalizeEditorContent(content);
      const state = get();
      const dateKey = getDiaryDateKey(state.mode, state.baseDate);
      set({ saving: true, error: "" });

      try {
        const saved = await tauri.diaryUpsertEntry({
          type: state.mode,
          date: dateKey,
          content: normalized,
          weather: state.currentEntry?.weather ?? null,
          mood: state.currentEntry?.mood ?? null,
        });
        const nextEntries = mergeEntries(get().entries, saved);
        set({
          entries: nextEntries,
          currentEntry: findCurrentEntry(
            nextEntries,
            get().mode,
            get().baseDate,
          ),
          saving: false,
          error: "",
          lastSavedAt: Date.now(),
          lastFailedContent: null,
        });
        return saved;
      } catch (error) {
        console.error("[diary-store] save failed", error);
        set({
          saving: false,
          error: "日记自动保存失败，请稍后重试",
          lastFailedContent: normalized,
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
        await get().saveCurrentContent(failedContent);
        return true;
      } catch {
        return false;
      }
    },

    clearError: () => {
      if (!get().error) {
        return;
      }
      set({ error: "" });
    },
  }),
);

export default useDiaryStore;
