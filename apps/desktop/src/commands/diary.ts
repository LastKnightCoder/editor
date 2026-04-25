import {
  DiaryEntry,
  CreateDiaryEntry,
  UpdateDiaryEntry,
  DiaryType,
  DiaryHeatmapData,
} from "@/types/diary";
import { invoke } from "@/electron";

export const createDiaryEntry = async (
  entry: CreateDiaryEntry,
): Promise<DiaryEntry> => {
  // Serialize weather and mood to JSON strings
  const serializedEntry = {
    ...entry,
    weather: entry.weather ? JSON.stringify(entry.weather) : null,
    mood: entry.mood ? JSON.stringify(entry.mood) : null,
  };
  const result = await invoke("create-diary-entry", serializedEntry);
  return deserializeDiaryEntry(result);
};

export const updateDiaryEntry = async (
  entry: UpdateDiaryEntry,
): Promise<DiaryEntry> => {
  // Serialize weather and mood to JSON strings if they exist
  const serializedEntry = {
    ...entry,
    weather:
      entry.weather !== undefined
        ? entry.weather
          ? JSON.stringify(entry.weather)
          : null
        : undefined,
    mood:
      entry.mood !== undefined
        ? entry.mood
          ? JSON.stringify(entry.mood)
          : null
        : undefined,
  };
  const result = await invoke("update-diary-entry", serializedEntry);
  return deserializeDiaryEntry(result);
};

export const deleteDiaryEntry = async (id: number): Promise<number> => {
  return invoke("delete-diary-entry", id);
};

export const getDiaryEntryById = async (id: number): Promise<DiaryEntry> => {
  const result = await invoke("get-diary-entry-by-id", id);
  return deserializeDiaryEntry(result);
};

export const getDiaryEntryByDate = async (
  date: string,
): Promise<DiaryEntry | null> => {
  const result = await invoke("get-diary-entry-by-date", date);
  return result ? deserializeDiaryEntry(result) : null;
};

export const getDiaryEntriesByType = async (
  type: DiaryType,
): Promise<DiaryEntry[]> => {
  const results = await invoke("get-diary-entries-by-type", type);
  return results.map(deserializeDiaryEntry);
};

export const getDiaryEntriesByDateRange = async (
  startDate: string,
  endDate: string,
): Promise<DiaryEntry[]> => {
  const results = await invoke(
    "get-diary-entries-by-date-range",
    startDate,
    endDate,
  );
  return results.map(deserializeDiaryEntry);
};

export const getAllDiaryEntries = async (): Promise<DiaryEntry[]> => {
  const results = await invoke("get-all-diary-entries");
  return results.map(deserializeDiaryEntry);
};

export const getDiaryHeatmapData = async (
  year: number,
  month: number,
): Promise<DiaryHeatmapData[]> => {
  return await invoke("get-diary-heatmap-data", year, month);
};

export const getDiariesByDates = async (
  dates: string[],
  diaryType?: DiaryType,
): Promise<DiaryEntry[]> => {
  const results = await invoke("get-diaries-by-dates", dates, diaryType);
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
    weather: any;
    mood: any;
    wordCount: number;
    content: string;
    createTime: string;
    updateTime: string;
  }>
> => {
  return await invoke("get-diaries-with-content", params);
};

// Helper function to deserialize weather and mood from JSON strings
function deserializeDiaryEntry(entry: any): DiaryEntry {
  return {
    ...entry,
    weather: entry?.weather != null ? JSON.parse(entry.weather) : null,
    mood: entry?.mood != null ? JSON.parse(entry.mood) : null,
  };
}
