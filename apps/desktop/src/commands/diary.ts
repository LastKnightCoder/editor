import {
  DiaryEntry,
  DiarySegment,
  CreateDiaryEntry,
  UpdateDiaryEntry,
  DiaryType,
  DiaryHeatmapData,
  DiarySegmentItem,
  DiaryTagSetting,
  WeatherMood,
} from "@/types/diary";
import { Descendant } from "slate";
import { invoke } from "@/electron";

// IPC 返回的原始结构（weather/mood/tags 为 JSON string，segments 为原始对象数组）
interface RawDiaryEntry {
  id: number;
  type: DiaryType;
  date: string;
  contentId: number | null;
  weather: string | null;
  mood: string | null;
  tags: string | null;
  wordCount: number;
  createTime: number;
  updateTime: number;
  segments: RawDiarySegment[];
  content?: Descendant[];
}

interface RawDiarySegment {
  id: number;
  diaryId: number;
  contentId: number;
  wordCount: number;
  createTime: number;
  updateTime: number;
  content: Descendant[];
  tags: string | null;
}

interface RawDiarySegmentItem {
  id: number;
  diaryId: number;
  contentId: number;
  wordCount: number;
  createTime: number;
  updateTime: number;
  content: Descendant[];
  entryDate: string;
  entryDateMs: number;
  weather: string | null;
  mood: string | null;
  tags: string | null;
}

interface RawDiaryTagSetting {
  name: string;
  color: string;
  sort: number;
  createTime: number;
  updateTime: number;
}

export const createDiaryEntry = async (entry: CreateDiaryEntry): Promise<DiaryEntry> => {
  const serializedEntry = {
    ...entry,
    weather: entry.weather ? JSON.stringify(entry.weather) : null,
    mood: entry.mood ? JSON.stringify(entry.mood) : null,
    tags: entry.tags ? JSON.stringify(entry.tags) : "[]",
  };
  const result = await invoke<RawDiaryEntry>("create-diary-entry", serializedEntry);
  return deserializeDiaryEntry(result);
};

export const updateDiaryEntry = async (entry: UpdateDiaryEntry): Promise<DiaryEntry> => {
  const serializedEntry = {
    ...entry,
    weather:
      entry.weather !== undefined
        ? entry.weather
          ? JSON.stringify(entry.weather)
          : null
        : undefined,
    mood: entry.mood !== undefined ? (entry.mood ? JSON.stringify(entry.mood) : null) : undefined,
    tags: entry.tags !== undefined ? JSON.stringify(entry.tags) : undefined,
  };
  const result = await invoke<RawDiaryEntry>("update-diary-entry", serializedEntry);
  return deserializeDiaryEntry(result);
};

export const deleteDiaryEntry = async (id: number): Promise<number> => {
  return invoke("delete-diary-entry", id);
};

export const getDiaryEntryById = async (id: number): Promise<DiaryEntry> => {
  const result = await invoke<RawDiaryEntry>("get-diary-entry-by-id", id);
  return deserializeDiaryEntry(result);
};

export const getDiaryEntryByDate = async (date: string): Promise<DiaryEntry | null> => {
  const result = await invoke<RawDiaryEntry | null>("get-diary-entry-by-date", date);
  return result ? deserializeDiaryEntry(result) : null;
};

export const getDiaryEntriesByType = async (type: DiaryType): Promise<DiaryEntry[]> => {
  const results = await invoke<RawDiaryEntry[]>("get-diary-entries-by-type", type);
  return results.map(deserializeDiaryEntry);
};

export const getDiaryEntriesByDateRange = async (
  startDate: string,
  endDate: string,
  diaryType?: DiaryType
): Promise<DiaryEntry[]> => {
  // 显式透传 diaryType：后端 IPC 调用 handler 时会在末尾追加 win 对象，
  // 若省略可选参数，win 会顶替 diaryType 的位置导致查询失效
  const results = await invoke<RawDiaryEntry[]>(
    "get-diary-entries-by-date-range",
    startDate,
    endDate,
    diaryType
  );
  return results.map(deserializeDiaryEntry);
};

export const getAllDiaryEntries = async (): Promise<DiaryEntry[]> => {
  const results = await invoke<RawDiaryEntry[]>("get-all-diary-entries");
  return results.map(deserializeDiaryEntry);
};

export const getDiaryHeatmapData = async (
  year: number,
  month: number
): Promise<DiaryHeatmapData[]> => {
  return await invoke("get-diary-heatmap-data", year, month);
};

export const getDiariesByDates = async (
  dates: string[],
  diaryType?: DiaryType
): Promise<DiaryEntry[]> => {
  const results = await invoke<RawDiaryEntry[]>("get-diaries-by-dates", dates, diaryType);
  return results.map(deserializeDiaryEntry);
};

export const getDiariesWithContent = async (params: {
  dates?: string[];
  startDate?: string;
  endDate?: string;
  diaryType?: DiaryType;
  maxLength?: number;
}): Promise<
  Array<{
    id: number;
    type: DiaryType;
    date: string;
    weather: WeatherMood | null;
    mood: WeatherMood | null;
    wordCount: number;
    content: string;
    createTime: string;
    updateTime: string;
  }>
> => {
  return await invoke("get-diaries-with-content", params);
};

// ---- Segment-level commands ----

export const getDiarySegments = async (diaryId: number): Promise<DiarySegment[]> => {
  const results = await invoke<RawDiarySegment[]>("get-diary-segments", diaryId);
  return results.map(deserializeDiarySegment);
};

export const createDiarySegment = async (params: {
  diaryId: number;
  content: Descendant[];
}): Promise<DiarySegment> => {
  const result = await invoke<RawDiarySegment>("create-diary-segment", params);
  return deserializeDiarySegment(result);
};

export const updateDiarySegment = async (params: {
  segmentId: number;
  content?: Descendant[];
  // 标签与片段绑定：传入时整体覆盖该 segment 的标签
  tags?: string[];
}): Promise<DiarySegment | null> => {
  const result = await invoke<RawDiarySegment | null>("update-diary-segment", params);
  return result ? deserializeDiarySegment(result) : null;
};

export const deleteDiarySegment = async (segmentId: number): Promise<number> => {
  return invoke("delete-diary-segment", segmentId);
};

// ---- Deserialization helpers ----

function deserializeDiarySegment(segment: RawDiarySegment): DiarySegment {
  return {
    id: segment.id,
    diaryId: segment.diaryId,
    contentId: segment.contentId,
    wordCount: segment.wordCount,
    createTime: segment.createTime,
    updateTime: segment.updateTime,
    content: segment.content,
    tags: segment.tags != null ? safeParseTags(segment.tags) : [],
  };
}

function deserializeDiaryEntry(entry: RawDiaryEntry): DiaryEntry {
  return {
    id: entry.id,
    type: entry.type,
    date: entry.date,
    contentId: entry.contentId,
    weather: entry.weather != null ? JSON.parse(entry.weather) : null,
    mood: entry.mood != null ? JSON.parse(entry.mood) : null,
    tags: entry.tags != null ? safeParseTags(entry.tags) : [],
    wordCount: entry.wordCount,
    createTime: entry.createTime,
    updateTime: entry.updateTime,
    segments: entry.segments.map(deserializeDiarySegment),
    content: entry.content ?? [],
  };
}

function safeParseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function deserializeDiarySegmentItem(item: RawDiarySegmentItem): DiarySegmentItem {
  return {
    id: item.id,
    diaryId: item.diaryId,
    contentId: item.contentId,
    wordCount: item.wordCount,
    createTime: item.createTime,
    updateTime: item.updateTime,
    content: item.content,
    entryDate: item.entryDate,
    entryDateMs: item.entryDateMs,
    weather: item.weather != null ? JSON.parse(item.weather) : null,
    mood: item.mood != null ? JSON.parse(item.mood) : null,
    tags: item.tags != null ? safeParseTags(item.tags) : [],
  };
}

function deserializeDiaryTagSetting(setting: RawDiaryTagSetting): DiaryTagSetting {
  return {
    name: setting.name,
    color: setting.color,
    sort: setting.sort,
    createTime: setting.createTime,
    updateTime: setting.updateTime,
  };
}

// ---- 朋友圈流 + 标签设置 ----

export const getAllDiarySegmentsFlat = async (): Promise<DiarySegmentItem[]> => {
  const results = await invoke<RawDiarySegmentItem[]>("get-all-diary-segments-flat");
  return results.map(deserializeDiarySegmentItem);
};

export const getAllDiaryTagSettings = async (): Promise<DiaryTagSetting[]> => {
  const results = await invoke<RawDiaryTagSetting[]>("get-all-diary-tag-settings");
  return results.map(deserializeDiaryTagSetting);
};

export const upsertDiaryTagSetting = async (setting: {
  name: string;
  color: string;
  sort?: number;
}): Promise<DiaryTagSetting> => {
  const result = await invoke<RawDiaryTagSetting>("upsert-diary-tag-setting", setting);
  return deserializeDiaryTagSetting(result);
};

export const deleteDiaryTagSetting = async (name: string): Promise<number> => {
  return invoke("delete-diary-tag-setting", name);
};
